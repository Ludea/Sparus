use libspeedupdate::{link::RepositoryError, workspace::UpdateError};
use serde::{ser::SerializeStruct, Serialize, Serializer};
use std::{io, path};
use tauri_plugin_http::reqwest;

#[derive(thiserror::Error, Debug)]
pub enum SparusError {
  #[error(transparent)]
  Io(#[from] io::Error),
  #[error("{0}")]
  Update(String),
  #[error(transparent)]
  Repository(#[from] RepositoryError),
  #[error("{0}")]
  Game(String),
  #[error(transparent)]
  Json(#[from] serde_json::Error),
  #[error(transparent)]
  Semver(#[from] semver::Error),
  #[error(transparent)]
  Http(#[from] reqwest::Error),
  #[error(transparent)]
  Status(#[from] tonic::Status),
  #[error(transparent)]
  StripPrefix(#[from] path::StripPrefixError),
  #[error(transparent)]
  Tauri(#[from] tauri::Error),
  #[error(transparent)]
  Store(#[from] tauri_plugin_store::Error),
  #[error(transparent)]
  Wasmtime(#[from] wasmtime::Error),
  #[error("Plugin not found")]
  Plugin,
}

impl From<UpdateError> for SparusError {
  fn from(error: UpdateError) -> Self {
    SparusError::Update(error.to_string())
  }
}

impl Serialize for SparusError {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    let mut s = serializer.serialize_struct("SparusError", 5)?;
    match self {
      SparusError::Update(err) => {
        s.serialize_field("kind", "update")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Repository(err) => {
        s.serialize_field("kind", "repository")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Io(err) => {
        s.serialize_field("kind", "io")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Game(err) => {
        s.serialize_field("kind", "game")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Json(err) => {
        s.serialize_field("kind", "json")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Semver(err) => {
        s.serialize_field("kind", "semver")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Http(err) => {
        s.serialize_field("kind", "http")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Status(err) => {
        s.serialize_field("kind", "status")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::StripPrefix(err) => {
        s.serialize_field("kind", "strip_prefix")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Tauri(err) => {
        s.serialize_field("kind", "tauri")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Store(err) => {
        s.serialize_field("kind", "store")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Wasmtime(err) => {
        s.serialize_field("kind", "wasmtime")?;
        s.serialize_field("message", &err.to_string())?;
      }
      SparusError::Plugin => {
        s.serialize_field("kind", "plugin")?;
        s.serialize_field("message", "Plugin not found")?;
      }
    }
    s.end()
  }
}
