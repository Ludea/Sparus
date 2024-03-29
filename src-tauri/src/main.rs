#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use libloading::{Library, Symbol};
use tauri::{
  plugin::TauriPlugin, CustomMenuItem, Manager, Runtime, SystemTray, SystemTrayEvent,
  SystemTrayMenu,
};
use tauri_plugin_autostart::MacosLauncher;

mod rpc;
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
    .setup(|app| {
      tauri::async_runtime::spawn(rpc::start_rpc_client());
      let salt_path = app
        .path_resolver()
        .app_local_data_dir()
        .expect("could not resolve app local data path")
        .join("salt.txt");
      app
        .handle()
        .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;
      Ok(())
    })
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
      SystemTrayEvent::MenuItemClick { id, .. } => {
        if id.as_str() == "exit" {
          app.exit(0);
        }
      }
      _ => {}
    })
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_single_instance::init(|_, _, _| {}))
    .plugin(tauri_plugin_autostart::init(
      MacosLauncher::LaunchAgent,
      None,
    ))
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
