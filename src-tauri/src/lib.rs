use std::{env, fs, path::PathBuf};
use tauri::{Builder, Manager, Runtime, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

#[cfg(desktop)]
use tauri::RunEvent;
#[cfg(mobile)]
use tauri::WebviewUrl;
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(mobile)]
use tauri_plugin_fs::FsExt;

mod errors;
mod plugins;
mod rpc;
#[cfg(desktop)]
mod tray;
mod updater;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  run_app(tauri::Builder::default());
}

pub fn run_app<R: Runtime>(mut builder: Builder<R>) {
  let spawner: updater::LocalSpawner<R> = updater::LocalSpawner::new();
  let plugins_manager: plugins::PluginSystem = plugins::PluginSystem::new();

  builder = builder
    .manage(spawner)
    .manage(plugins_manager.clone())
    .setup(|app| {
      let config_file = "Sparus.json";
      let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Unable to access to config directory");
      let store_file_destination = app_data_dir.join(config_file);
      let config_path = match app.path().resource_dir() {
        Ok(dir) => {
          let bundled = dir.join(config_file);
          if bundled.is_file() {
            bundled
          } else {
            PathBuf::from(config_file)
          }
        }
        Err(_) => PathBuf::from(config_file),
      };
      let store_file_content = fs::read_to_string(&config_path)?;

      #[cfg(mobile)]
      WebviewWindowBuilder::new(app, "main", WebviewUrl::default()).build()?;

      #[cfg(desktop)]
      {
        WebviewWindowBuilder::new(app, "main", Default::default())
          .inner_size(800., 600.)
          .title("Sparus")
          .decorations(false)
          .build()?;

        let handle = app.handle();
        tray::create_tray(handle)?;
      }

      if !store_file_destination.exists() {
        fs::create_dir_all(&app_data_dir).expect("Cannot create app data directory");
        fs::write(&store_file_destination, &store_file_content)
          .expect("Cannot copy default Store file");
      }

      let store = app.store("Sparus.json")?;
      let cms_url = match store.get("launcher_url") {
        Some(url_json) => {
          if let tauri_plugin_store::JsonValue::String(url_string) = url_json {
            url_string
          } else {
            "http://127.0.0.1:8112".to_string()
          }
        }
        None => "http://127.0.0.1:8112".to_string(),
      };

      let plugins_url = match store.get("plugins_url") {
        Some(url_json) => {
          if let tauri_plugin_store::JsonValue::String(url_string) = url_json {
            url_string
          } else {
            "http://127.0.0.1:8012".to_string()
          }
        }
        None => "http://127.0.0.1:8012".to_string(),
      };

      let launcher_name = match store.get("launcher_name") {
        Some(name_json) => {
          if let tauri_plugin_store::JsonValue::String(launcher_name_string) = name_json {
            launcher_name_string
          } else {
            "kataster".to_string()
          }
        }
        None => "kataster".to_string(),
      };

      tauri::async_runtime::spawn(rpc::start_rpc_client(
        app_data_dir.clone(),
        plugins_manager,
        cms_url,
        plugins_url,
        launcher_name,
      ));
      

      Ok(())
    })
    .plugin(tauri_plugin_os::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_store::Builder::default().build());

  #[cfg(mobile)]
  {
    builder = builder.plugin(tauri_plugin_fs::init());
  }

  #[cfg(desktop)]
  {
    builder = builder
      .plugin(tauri_plugin_dialog::init())
      .plugin(tauri_plugin_shell::init())
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
      plugins::call_wasm_plugin_function,
      plugins::js_plugins_path,
      utils::get_current_path,
      utils::get_game_exe_name
    ])
    .build(tauri::tauri_build_context!())
    .expect("error while building Sparus application");

  app.run(move |_app_handle, _event| {
    #[cfg(desktop)]
    if let RunEvent::ExitRequested { api, code, .. } = &_event {
      if code.is_none() {
        api.prevent_exit();
      }
    }
  });
}
