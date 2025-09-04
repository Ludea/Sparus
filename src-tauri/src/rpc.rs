pub mod sparus {
  tonic::include_proto!("sparus");
}

use futures::StreamExt;
use sparus::{event_client::EventClient, Empty, EventType};
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
  client: &mut EventClient<Channel>,
  url: String,
) -> Result<(), DownloadError> {
  let mut stream = client.sparus(Empty {}).await.unwrap().into_inner();

  while let Ok(Some(item)) = stream.message().await {
    let plugin_name = item.plugin;
    let url = format!("{}/plugins/{}", url, plugin_name);
    let event = EventType::try_from(item.event_type);
    if event == Ok(EventType::Install) {
      if let Err(err) = download_file(url, plugin_name).await {
        println!("error: {:?}", err);
      }
    }
  }
  Ok(())
}

pub async fn start_rpc_client(url: String) -> Result<(), DownloadError> {
  if let Ok(mut client) = EventClient::connect(url.clone()).await {
    start_streaming(&mut client, url).await?;
  }
  Ok(())
}

async fn download_file(url: String, plugin_name: String) -> Result<(), DownloadError> {
  let response = reqwest::get(url).await?;
  let mut stream = response.bytes_stream();
  let plugins_dir = Path::new("plugins");
  fs::create_dir(plugins_dir).await?;
  let file_path = plugins_dir.join(format!("{}.wasm", &plugin_name));
  let mut file = File::create(file_path).await?;
  while let Some(chunk) = stream.next().await {
    let data = chunk?;
    file.write_all(&data).await?;
  }
  Ok(())
}
