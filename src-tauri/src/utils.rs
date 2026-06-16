use crate::errors::SparusError;
use serde::Deserialize;
#[cfg(target_family = "unix")]
use std::os::unix::fs::PermissionsExt;
use std::{
  env,
  fs::{self, File},
  path::Path,
};
use tauri::{command, AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Deserialize)]
pub struct Root {
  pub state: State,
}

#[derive(Debug, Deserialize)]
pub struct State {
  pub stable: Stable,
}

#[derive(Debug, Deserialize)]
pub struct Stable {
  pub version: String,
}

#[command]
pub fn get_current_path() -> Result<String, SparusError> {
  let path = env::current_dir()?;
  Ok(path.to_string_lossy().to_string())
}

#[command]
pub fn get_game_exe_name(path: String) -> Result<String, SparusError> {
  let path = Path::new(&path);
  let folder =
    fs::read_dir(path).map_err(|_| SparusError::Game("No Game installed".to_string()))?;
  for entry in folder {
    let entry = entry?;
    let meta = entry.metadata()?;
    let path = entry.path();

    if meta.is_file() && is_executable(&path) {
      return Ok(path.file_name().unwrap().to_string_lossy().to_string());
    }
  }
  Err(SparusError::Game("No Game installed".to_string()))
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

pub fn version<R: Runtime>(app: AppHandle<R>) -> Result<String, SparusError> {
  let current_dir = get_current_path()?;
  let current_path = Path::new(&current_dir);
  let state_file = current_path.join(".update").join("state.json");
  if state_file.is_file() {
    let content = File::open(&state_file)?;
    let root: Root = serde_json::from_reader(content)?;
    Ok(root.state.stable.version)
  } else {
    initial_version(app)
  }
}

fn initial_version<R: Runtime>(app: AppHandle<R>) -> Result<String, SparusError> {
  let store = app.store("Sparus.json")?;
  match store.get("initial_version") {
    Some(version_json) => {
      if let tauri_plugin_store::JsonValue::String(version_string) = version_json {
        Ok(version_string)
      } else {
        Err(SparusError::NoVersion)
      }
    }
    None => Err(SparusError::NoVersion),
  }
}
