pub mod sparus {
  tonic::include_proto!("sparus");
}

use crate::{errors::SparusError, rpc::reqwest::StatusCode};
use futures::StreamExt;
use semver::Version;
use sparus::{event_client::EventClient, EventType, Plugins};
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
};
use tauri_plugin_http::reqwest;
use tokio::{
  fs::{self, File},
  io::AsyncWriteExt,
  time::{sleep, Duration},
};
use tonic::transport::Channel;

async fn start_streaming(
  app_data_dir: PathBuf,
  client: &mut EventClient<Channel>,
  plugins_url: String,
  launcher_name: String,
) -> Result<(), SparusError> {
  let app_data_dir_string = app_data_dir.display().to_string();
  let plugins = get_list_plugins_with_versions(app_data_dir_string.clone()).await?;
  let response = client
    .sparus(Plugins {
      repository_name: launcher_name,
      list_plugin: plugins,
    })
    .await?;

  let mut stream = response.into_inner();
  loop {
    // Handling the three outcomes explicitly. The previous
    // `while let Ok(Some(item))` also matched `Err(_)` as "loop is over" and
    // dropped the status without binding it, so a server-side error looked
    // exactly like a clean shutdown and the launcher went permanently silent.
    let item = match stream.message().await {
      Ok(Some(item)) => item,
      Ok(None) => return Ok(()),
      Err(status) => return Err(SparusError::Status(status)),
    };

    let plugin_name = item.plugin;
    let url = format!("{}/plugins/{}", plugins_url, plugin_name);
    // One failed plugin must not end the subscription: log it and keep
    // listening, otherwise a single 404 stops every later event from being
    // acted on.
    match EventType::try_from(item.event_type) {
      Ok(EventType::Install) | Ok(EventType::Update) => {
        if let Err(err) = download_and_write_file(app_data_dir.clone(), url, &plugin_name).await {
          return Err(SparusError::PluginEvent(format!(
            "Plugin {plugin_name}: install/update failed: {err}"
          )));
        }
      }
      Ok(EventType::Delete) => {
        if let Err(err) =
          fs::remove_dir_all(format!("{app_data_dir_string}/plugins/{plugin_name}")).await
        {
          return Err(SparusError::PluginEvent(format!(
            "Plugin {plugin_name}: delete failed: {err}"
          )));
        }
      }
      Err(_) => {
        // Still a SparusError (as agreed in #1017), but reported rather than
        // returned: an event type this build doesn't know about is not a
        // reason to unsubscribe from every future event.
        return Err(SparusError::PluginEvent(format!(
          "Plugin {plugin_name}: unknown event type {}",
          item.event_type
        )));
      }
    }
  }
}

/// Subscribes to the CMS event stream, reconnecting if the stream drops.
///
/// The subscription has to outlive transient failures: the CMS may not be up
/// yet when the launcher starts, and any dropped stream previously left the
/// launcher silently unsubscribed for the rest of the session.
pub async fn start_rpc_client(
  app_data_dir: PathBuf,
  cms_url: String,
  plugins_url: String,
  launcher_name: String,
) -> Result<(), SparusError> {
  const MIN_BACKOFF: Duration = Duration::from_secs(1);
  const MAX_BACKOFF: Duration = Duration::from_secs(60);

  let mut backoff = MIN_BACKOFF;
  loop {
    match EventClient::connect(cms_url.clone()).await {
      Ok(mut client) => {
        start_streaming(
          app_data_dir.clone(),
          &mut client,
          plugins_url.clone(),
          launcher_name.clone(),
        )
        .await?;
      }
      Err(err) => return Err(SparusError::Rpc(err)),
    }

    sleep(backoff).await;
    backoff = (backoff * 2).min(MAX_BACKOFF);
  }
}

async fn download_and_write_file(
  app_data_dir: PathBuf,
  url: String,
  plugin_name: &str,
) -> Result<(), SparusError> {
  let plugin_name_dir = app_data_dir.join("plugins").join(plugin_name);
  fs::create_dir_all(&plugin_name_dir).await?;

  let mut entries = fs::read_dir(&plugin_name_dir).await?;
  while let Some(entries) = entries.next_entry().await? {
    let path = entries.path();
    if path.extension().and_then(|e| e.to_str()) == Some("wasm") {
      fs::remove_file(path).await?;
    }
  }
  download_to(
    url.clone(),
    plugin_name_dir.join(format!("{plugin_name}.wasm")),
  )
  .await?;
  download_to(
    format!("{url}/frontend.js"),
    plugin_name_dir.join("frontend.js"),
  )
  .await?;

  Ok(())
}

async fn download_to(url: String, destination: PathBuf) -> Result<(), SparusError> {
  let response = reqwest::get(url).await?;
  if response.status() != StatusCode::OK {
    return Err(SparusError::Plugin);
  }

  let mut stream = response.bytes_stream();
  let mut file = File::create(destination).await?;
  while let Some(chunk) = stream.next().await {
    let data = chunk?;
    file.write_all(&data).await?;
  }
  Ok(())
}

async fn get_list_plugins_with_versions(
  app_data_dir: String,
) -> Result<HashMap<String, String>, SparusError> {
  let plugins_path = Path::new(&app_data_dir).join("plugins");
  let mut list_plugins = HashMap::new();

  if plugins_path.is_dir() {
    for entry in std::fs::read_dir(&plugins_path)? {
      let entry = entry?;

      if !entry.path().is_dir() {
        continue;
      }

      let plugin_name = entry.file_name().to_string_lossy().into_owned();

      let plugin_dir = entry.path();

      for file in std::fs::read_dir(&plugin_dir)? {
        let file = file?;
        let path = file.path();

        if path.extension().and_then(|e| e.to_str()) != Some("wasm") {
          continue;
        }

        if let Some(version) = get_plugin_version(&path) {
          list_plugins.insert(plugin_name.clone(), version.to_string());
        }

        break;
      }
    }
  }

  Ok(list_plugins)
}

fn get_plugin_version(path: &Path) -> Option<Version> {
  let stem = path.file_stem()?.to_str()?;

  let (_, version) = stem.rsplit_once("_v")?;

  Version::parse(version).ok()
}
