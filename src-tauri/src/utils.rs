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
  let folder = fs::read_dir(path)?;
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
  let update_dir = current_path.join(".update");
  if update_dir.exists() && update_dir.is_dir() {
    let mut update_content = fs::read_dir(update_dir)?;
    if let Some(entry) = update_content.next() {
      let entry = entry?;
      let path = entry.path();
      if entry.file_name() == "state.json" {
        let content = File::open(&path)?;
        let root: Root = serde_json::from_reader(content)?;
        return Ok(root.state.stable.version);
      } else {
        let initial_version = initial_version(app);
        return Ok(initial_version);
      }
    }
    let initial_version = initial_version(app);
    Ok(initial_version)
  } else {
    let initial_version = initial_version(app);
    Ok(initial_version)
  }
}

fn initial_version<R: Runtime>(app: AppHandle<R>) -> String {
  let store = app.store("Sparus.json").unwrap();
  let initial_version = match store.get("initial_version") {
    Some(version_json) => version_json,
    None => panic!("No initial version specified from store"),
  };
  initial_version.to_string()
}
