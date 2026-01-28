pub mod sparus {
  tonic::include_proto!("sparus");
}

use crate::errors::SparusError;
use crate::plugins::PluginSystem;
use crate::rpc::reqwest::StatusCode;
use futures::StreamExt;
use sparus::{event_client::EventClient, EventType, Plugins};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri_plugin_http::reqwest;
use tokio::{
  fs::{self, File},
  io::AsyncWriteExt,
};
use tonic::transport::Channel;

async fn start_streaming(
  app_data_dir: PathBuf,
  runtime: PluginSystem,
  client: &mut EventClient<Channel>,
  plugins_url: String,
  launcher_name: String,
) -> Result<(), SparusError> {
  let app_data_dir_string = app_data_dir.display().to_string();
  let plugins = get_list_plugins_with_versions(app_data_dir_string.clone(), runtime).await;
  let response = client
    .sparus(Plugins {
      repository_name: launcher_name,
      list_plugin: plugins,
    })
    .await?;
  // .map_err(|err| DownloadError::Rpc(err.to_string()))?;

  let mut stream = response.into_inner();

  while let Ok(Some(item)) = stream.message().await {
    let plugin_name = item.plugin;
    let url = format!("{}/plugins/{}", plugins_url, plugin_name);
    let event = EventType::try_from(item.event_type);
    match event {
      Ok(EventType::Install) => {
        download_and_write_file(app_data_dir.clone(), url, plugin_name).await?
      }
      Ok(EventType::Delete) => {
        fs::remove_file(format!("{app_data_dir_string}/plugins/{plugin_name}.wasm")).await?
      }
      Ok(EventType::Update) => {
        download_and_write_file(app_data_dir.clone(), url, plugin_name).await?
      }
      Err(err) => {
        err.to_string();
      }
    }
  }
  Ok(())
}

pub async fn start_rpc_client(
  app_data_dir: PathBuf,
  runtime: PluginSystem,
  cms_url: String,
  plugins_url: String,
  launcher_name: String,
) -> Result<(), SparusError> {
  if let Ok(mut client) = EventClient::connect(cms_url).await {
    start_streaming(
      app_data_dir,
      runtime,
      &mut client,
      plugins_url,
      launcher_name,
    )
    .await?;
  }
  Ok(())
}

async fn download_and_write_file(
  app_data_dir: PathBuf,
  url: String,
  plugin_name: String,
) -> Result<(), SparusError> {
  let response = reqwest::get(url).await?;
  if response.status() != StatusCode::OK {
    return Err(SparusError::Plugin);
  }

  let mut stream = response.bytes_stream();
  let plugins_dir = app_data_dir.join("plugins");
  let plugin_name_dir = plugins_dir.join("{plugin_name}");
  fs::create_dir_all(plugin_name_dir.clone()).await?;
  let file_path = plugin_name_dir.join(format!("{}.wasm", &plugin_name));
  let mut file = File::create(file_path).await?;
  while let Some(chunk) = stream.next().await {
    let data = chunk?;
    file.write_all(&data).await?;
  }
  Ok(())
}

async fn get_list_plugins_with_versions(
  app_data_dir: String,
  runtime: PluginSystem,
) -> HashMap<String, String> {
  let plugins_path = Path::new(&app_data_dir).join("plugins");
  let mut list_plugins = HashMap::new();
  if plugins_path.is_dir() {
    for entry in std::fs::read_dir(&plugins_path).unwrap() {
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
              .call(
                plugins_path.clone(),
                plugin_name.clone(),
                "get-version".to_string(),
                Vec::new(),
              )
              .await;
            list_plugins.insert(plugin_name, version.unwrap());
          }
        }
      }
    }
  }
  list_plugins
}
