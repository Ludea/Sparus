#[cfg(target_family = "unix")]
use std::os::unix::fs::PermissionsExt;
use std::{env, fs, io, path::Path};
use tauri::command;

#[derive(serde::Serialize)]
#[serde(tag = "kind", content = "message")]
#[serde(rename_all = "camelCase")]
pub enum GameErr {
  Io(String),
  NotInstalled(String),
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
  let path = Path::new(&path);
  let folder = fs::read_dir(path).unwrap();
  for entry in folder {
    let entry = entry?;
    let meta = entry.metadata()?;
    let path = entry.path();

    if meta.is_file() && is_executable(&path) {
      return Ok(path.file_name().unwrap().to_string_lossy().to_string());
    }
  }
  Err(GameErr::NotInstalled("No Game installed".to_string()))
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
