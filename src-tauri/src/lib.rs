use axum::Router;
#[cfg(target_family = "unix")]
use std::os::unix::fs::PermissionsExt;
use std::{
  env, fs, io,
  net::SocketAddr,
  path::{Path, PathBuf},
};
use tauri::{command, Builder, Manager, Runtime, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;
use tower_http::{
  cors::{Any, CorsLayer},
  services::ServeDir,
  trace::TraceLayer,
};

#[cfg(desktop)]
use tauri::RunEvent;
#[cfg(mobile)]
use tauri::WebviewUrl;
#[cfg(desktop)]
use tauri_plugin_autostart::MacosLauncher;
#[cfg(mobile)]
use tauri_plugin_fs::FsExt;
#[cfg(desktop)]
use tauri_runtime_verso::INVOKE_SYSTEM_SCRIPTS;

mod plugins;
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
fn get_game_exe_name(path: String) -> Result<String, String> {
  let folder = path;
  if let Ok(mut entries) = fs::read_dir(folder) {
    if let Some(entry) = entries.next() {
      if let Ok(entry) = entry {
        let path = entry.path();
        if path.is_file() && is_executable(&path) {
          return Ok(path.file_name().unwrap().to_string_lossy().to_string());
        } else {
          return Err("Game exe not found".to_string());
        }
      }
      return Err("No game installed".to_string());
    }
    Err("Unable to read dir".to_string())
  } else {
    Err("Unable to read dir".to_string())
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(desktop)]
  run_app(tauri_runtime_verso::builder());
  #[cfg(mobile)]
  run_app(tauri::Builder::default());
}

pub fn run_app<R: Runtime>(mut builder: Builder<R>) {
  let spawner: updater::LocalSpawner<R> = updater::LocalSpawner::new();
  let plugins_manager: plugins::PluginSystem = plugins::PluginSystem::new();

  #[cfg(all(debug_assertions, desktop))]
  tauri_runtime_verso::set_verso_devtools_port(8000);

  builder = builder
    .manage(spawner)
    .manage(plugins_manager.clone())
    .setup(|app| {
      let config_file = "Sparus.json";
      let store_file_content;
      let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Unable to access to config directory");
      let store_file_destination = app_data_dir.join(config_file);

      #[cfg(mobile)]
      {
        let resource_dir_file = app
          .path()
          .resource_dir()
          .expect("Unable to access to resource directory")
          .join(config_file);
        store_file_content = app.fs().read_to_string(&resource_dir_file)?;
      }

      #[cfg(mobile)]
      WebviewWindowBuilder::new(app, "main", WebviewUrl::default()).build()?;

      #[cfg(desktop)]
      {
        store_file_content = fs::read_to_string(config_file)?;

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
      tauri::async_runtime::spawn(start_http_server(app_data_dir));

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
      .invoke_system(INVOKE_SYSTEM_SCRIPTS)
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
      updater::check_if_installed,
      plugins::call_plugin_function,
      plugins::js_plugins_path,
      get_current_path,
      get_game_exe_name
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

async fn start_http_server(app_data_dir: PathBuf) {
  let js_plugins_path = app_data_dir.join("plugins");
  let test = js_plugins_path.display().to_string();
  let router = Router::new().nest_service("/plugins", ServeDir::new(test));
  let addr = SocketAddr::from(([127, 0, 0, 1], 8012));
  let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
  axum::serve(
    listener,
    router
      .layer(
        CorsLayer::new()
          .allow_origin(Any)
          .allow_headers(Any)
          .expose_headers(Any),
      )
      .layer(TraceLayer::new_for_http()),
  )
  .await
  .unwrap();
}
