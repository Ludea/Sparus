use argon2::{hash_raw, Config, Variant, Version};
use libloading::{Library, Symbol};
use std::{env, fs, path::Path};
use tauri::{plugin::TauriPlugin, Runtime};
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

mod rpc;
#[cfg(desktop)]
mod tray;
mod updater;

pub fn get_plugin<R: Runtime>() -> Result<TauriPlugin<R>, Box<dyn std::error::Error>> {
  unsafe {
    let lib = Library::new("~/lib.rlib")?;
    let func: Symbol<unsafe extern "C" fn() -> Box<TauriPlugin<R>>> = lib.get(b"")?;
    Ok(*func())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let spawner = updater::LocalSpawner::new();

  let mut builder = tauri::Builder::default()
    .manage(spawner)
    .setup(|app| {
      tauri::async_runtime::spawn(rpc::start_rpc_client());
      #[cfg(desktop)]
      {
        let handle = app.handle();
        tray::create_tray(handle)?;
      }

      Ok(())
    })
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(
      tauri_plugin_stronghold::Builder::new(|password| {
        let config = Config {
          lanes: 4,
          mem_cost: 10_000,
          time_cost: 10,
          variant: Variant::Argon2id,
          version: Version::Version13,
          ..Default::default()
        };
        let salt = match env::var("STRONGHOLD_SALT") {
          Ok(val) => val,
          Err(_) => {
            if !Path::new("salt.txt").exists() {
              let mut buf = [0u8, 16];
              getrandom::getrandom(&mut buf).unwrap();
              fs::write("salt.txt", buf).unwrap();
              String::from_utf8(buf.to_vec()).unwrap()
            } else {
              fs::read_to_string("salt.txt").unwrap()
            }
          }
        };
        let key =
          hash_raw(password.as_ref(), salt.as_bytes(), &config).expect("failed to hash password");
        key.to_vec()
      })
      .build(),
    )
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_os::init());

  #[cfg(desktop)]
  builder
    .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      None,
    ));

  let mut app = builder
    .invoke_handler(tauri::generate_handler![
      updater::update_workspace,
      updater::update_available,
    ])
    .build(tauri::tauri_build_context!())
    .expect("error while building tauri application");

  app.run(move |_app_handle, _event| {});
}
