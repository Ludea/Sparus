pub mod sparus {
  tonic::include_proto!("sparus");
}

use crate::plugins::PluginSystem;
use crate::rpc::reqwest::StatusCode;
use futures::StreamExt;
use sparus::{event_client::EventClient, EventType, Plugins};
use std::collections::HashMap;
use std::path::Path;
use tauri_plugin_http::reqwest;
use tokio::{
  fs::{self, File},
  io::AsyncWriteExt,
};
use tonic::transport::Channel;

#[derive(serde::Serialize, Debug)]
pub enum DownloadError {
  Httperror(String),
  Io(String),
  Rpc(String),
}

impl From<std::io::Error> for DownloadError {
  fn from(err: std::io::Error) -> Self {
    DownloadError::Io(err.to_string())
  }
}

impl From<reqwest::Error> for DownloadError {
  fn from(err: reqwest::Error) -> Self {
    DownloadError::Httperror(err.to_string())
  }
}

async fn start_streaming(
  runtime: PluginSystem,
  client: &mut EventClient<Channel>,
  url: String,
) -> Result<(), DownloadError> {
  let plugins = get_list_plugins_with_versions(runtime).await;

  let response = client
    .sparus(Plugins {
      list_plugin: plugins,
    })
    .await
    .map_err(|err| DownloadError::Rpc(err.to_string()))?;

  let mut stream = response.into_inner();

  while let Ok(Some(item)) = stream.message().await {
    let plugin_name = item.plugin;
    let url = format!("{}/plugins/{}", url, plugin_name);
    let event = EventType::try_from(item.event_type);
    if event == Ok(EventType::Install) {
      download_file(url, plugin_name).await?;
    }
  }
  Ok(())
}

pub async fn start_rpc_client(runtime: PluginSystem, url: String) -> Result<(), DownloadError> {
  if let Ok(mut client) = EventClient::connect(url.clone()).await {
    start_streaming(runtime, &mut client, url).await?;
  }
  Ok(())
}

async fn download_file(url: String, plugin_name: String) -> Result<(), DownloadError> {
  let response = reqwest::get(url).await?;
  if response.status() == StatusCode::OK {
    let mut stream = response.bytes_stream();
    let plugins_dir = Path::new("plugins");
    fs::create_dir_all(plugins_dir).await?;
    let file_path = plugins_dir.join(format!("{}.wasm", &plugin_name));
    let mut file = File::create(file_path).await?;
    while let Some(chunk) = stream.next().await {
      let data = chunk?;
      file.write_all(&data).await?;
    }
    Ok(())
  } else {
    Err(DownloadError::Httperror("Plugin not found".to_string()))
  }
}

async fn get_list_plugins_with_versions(runtime: PluginSystem) -> HashMap<String, String> {
  let plugins_path = Path::new("plugins");
  let mut list_plugins = HashMap::new();
  if plugins_path.is_dir() {
    for entry in std::fs::read_dir(plugins_path).unwrap() {
      let entry = entry.unwrap();
      let file_path = entry.path();
      if file_path.is_file() {
        if let Some(extension) = file_path.clone().extension() {
          if extension == "wasm" {
            let plugin_name = file_path
              .file_stem()
              .unwrap()
              .to_string_lossy()
              .into_owned();
            let version = runtime
              .call(plugin_name.clone(), "get-version".to_string())
              .await;
            list_plugins.insert(plugin_name, version.unwrap());
          }
        }
      }
    }
  }
  list_plugins
}
