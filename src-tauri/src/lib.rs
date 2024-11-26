use argon2::{hash_raw, Config, Variant, Version};
#[cfg(target_family = "unix")]
use std::os::unix::fs::PermissionsExt;
use std::{env, fs, io, path::Path};
use tauri::command;
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;

#[cfg(desktop)]
use tauri::RunEvent;

mod rpc;
#[cfg(desktop)]
mod tray;
mod updater;

#[derive(serde::Serialize)]
pub enum IOErr {
  Io(String),
}

impl From<io::Error> for IOErr {
  fn from(err: io::Error) -> Self {
    IOErr::Io(err.to_string())
  }
}

#[command]
fn get_current_path() -> Result<String, IOErr> {
  let path = env::current_dir()?;
  Ok(path.to_string_lossy().to_string())
}

#[command]
fn get_game_exe_name() -> Result<String, String> {
  let folder = "./game";
  if let Ok(entries) = fs::read_dir(folder) {
    for entry in entries {
      if let Ok(entry) = entry {
        let path = entry.path();
        if path.is_file() && is_executable(&path) {
          return Ok(path.file_name().unwrap().to_string_lossy().to_string());
        } else {
          return Err("Game exe not found".to_string());
        }
      }
      return Err("".to_string());
    }
    return Err("".to_string());
  }
  return Err("".to_string());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let spawner = updater::LocalSpawner::new();

  #[cfg(desktop)]
  let mut builder;
  #[cfg(mobile)]
  let builder;

  builder = tauri::Builder::default()
    .manage(spawner)
    .setup(|_app| {
      tauri::async_runtime::spawn(rpc::start_rpc_client());
      #[cfg(desktop)]
      {
        let handle = _app.handle();
        tray::create_tray(handle)?;
      }

      Ok(())
    })
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
    );

  #[cfg(desktop)]
  {
    builder = builder
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_os::init())
      .plugin(tauri_plugin_notification::init())
      .plugin(tauri_plugin_shell::init())
      .plugin(tauri_plugin_store::Builder::default().build())
      .plugin(tauri_plugin_process::init())
      .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
      .plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        None,
      ));
  }

  let app = builder
    .invoke_handler(tauri::generate_handler![
      updater::update_workspace,
      updater::update_available,
      updater::check_if_installed,
      get_current_path,
      get_game_exe_name
    ])
    .build(tauri::tauri_build_context!())
    .expect("error while building tauri application");

  app.run(move |_app_handle, _event| {
    #[cfg(desktop)]
    if let RunEvent::ExitRequested { api, code, .. } = &_event {
      if code.is_none() {
        api.prevent_exit();
      }
    }
  });
}

fn is_executable(path: &Path) -> bool {
  #[cfg(not(target_os = "windows"))]
  if let Ok(metadata) = path.metadata() {
    let permissions = metadata.permissions();
    permissions.mode() & 0o111 != 0
  } else {
    false
  }
  #[cfg(target_os = "windows")]
  if let Some(extension) = path.extension() {
    extension == "exe"
  } else {
    false
  }
}
