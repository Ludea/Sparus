use std::{env, fs, io, path::Path};
use tauri::command;

#[derive(serde::Serialize)]
#[serde(tag = "kind", content = "message")]
#[serde(rename_all = "camelCase")]
pub enum GameErr {
  Io(String),
  NotInstalled(String),
  BadInstalled(String),
  Other(String),
}

impl From<io::Error> for GameErr {
  fn from(err: io::Error) -> Self {
    GameErr::Io(err.to_string())
  }
}

#[command]
pub fn get_current_path() -> Result<String, GameErr> {
  let path = env::current_dir()?;
  Ok(path.to_string_lossy().to_string())
}

#[command]
pub fn get_game_exe_name(path: String) -> Result<String, GameErr> {
  if let Ok(mut entries) = fs::read_dir(path) {
    if let Some(entry) = entries.next() {
      if let Ok(entry) = entry {
        let path = entry.path();
        if path.is_file() && is_executable(&path) {
          return Ok(path.file_name().unwrap().to_string_lossy().to_string());
        } else {
          return Err(GameErr::BadInstalled("Game binaries not found".to_string()));
        }
      }
      return Err(GameErr::Other("No game installed".to_string()));
    }
    Err(GameErr::Other("Unable to read dir".to_string()))
  } else {
    Err(GameErr::NotInstalled("No game installed".to_string()))
  }
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
