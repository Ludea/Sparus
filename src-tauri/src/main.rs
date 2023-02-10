#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use libloading::{Library, Symbol};
use rand::distributions::{Alphanumeric, DistString};
use tauri::{
  plugin::TauriPlugin, CustomMenuItem, Manager, Runtime, SystemTray, SystemTrayEvent,
  SystemTrayMenu,
};
use tauri_plugin_autostart::MacosLauncher;

mod updater;

pub fn get_plugin<R: Runtime>() -> Result<TauriPlugin<R>, Box<dyn std::error::Error>> {
  unsafe {
    let lib = Library::new("~/lib.rlib")?;
    let func: Symbol<unsafe extern "C" fn() -> Box<TauriPlugin<R>>> = lib.get(b"")?;
    Ok(*func())
  }
}

fn main() {
  let spawner = updater::LocalSpawner::new();

  let tray_menu = SystemTrayMenu::new().add_item(CustomMenuItem::new("exit", "Exit App"));
  tauri::Builder::default()
    .manage(spawner)
    .invoke_handler(tauri::generate_handler![
      updater::update_workspace,
      updater::update_available
    ])
    .system_tray(SystemTray::new().with_menu(tray_menu))
    .on_system_tray_event(move |app, event| match event {
      SystemTrayEvent::LeftClick {
        position: _,
        size: _,
        ..
      } => {
        let window = app.get_window("main").unwrap();
        window.unminimize().unwrap();
        window.show().unwrap();
        window.set_focus().unwrap();
      }
      SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
        "exit" => {
          app.exit(0);
        }
        _ => {}
      },
      _ => {}
    })
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      None,
    ))
    .plugin(
      tauri_plugin_stronghold::Builder::new(|password| {
        let config = argon2::Config {
          lanes: 2,
          mem_cost: 50_000,
          time_cost: 30,
          thread_mode: argon2::ThreadMode::from_threads(2),
          variant: argon2::Variant::Argon2id,
          ..Default::default()
        };

        let salt = Alphanumeric.sample_string(&mut rand::thread_rng(), 12);
        let key = argon2::hash_raw(password.as_ref(), salt.as_bytes(), &config)
          .expect("failed to hash password");

        key.to_vec()
      })
      .build(),
    )
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
