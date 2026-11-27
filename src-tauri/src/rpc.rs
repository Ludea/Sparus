pub mod sparus {
  tonic::include_proto!("sparus");
}

use crate::{errors::SparusError, rpc::reqwest::StatusCode};
use futures::StreamExt;
use semver::Version;
use sparus::{event_client::EventClient, EventType, Plugins};
use std::{
  collections::HashMap,
  io::{Cursor, Read},
  path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_http::reqwest;
use tokio::{
  fs,
  time::{sleep, Duration},
};
use tonic::transport::Channel;

pub const PLUGIN_ERROR_EVENT: &str = "sparus://pluginerror";

fn report<R: Runtime>(app: &AppHandle<R>, err: SparusError) {
  match serde_json::to_value(&err) {
    Ok(payload) => {
      let _ = app.emit(PLUGIN_ERROR_EVENT, payload);
    }
    Err(serialization_err) => {
      let _ = app.emit(
        PLUGIN_ERROR_EVENT,
        serde_json::json!({
          "kind": "plugin_event",
          "message": format!("{err} (payload not serializable: {serialization_err})"),
        }),
      );
    }
  }
}

async fn start_streaming<R: Runtime>(
  app: &AppHandle<R>,
  app_data_dir: PathBuf,
  client: &mut EventClient<Channel>,
  plugins_url: String,
  launcher_name: String,
  plugins_public_key: String,
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
    let item = match stream.message().await {
      Ok(Some(item)) => item,
      Ok(None) => return Ok(()),
      Err(status) => return Err(SparusError::Status(status)),
    };

    let plugin_name = item.plugin;
    let url = format!("{}/plugins/{}", plugins_url, plugin_name);
    match EventType::try_from(item.event_type) {
      Ok(EventType::Install) | Ok(EventType::Update) => {
        if let Err(err) =
          download_and_write_file(app_data_dir.clone(), url, &plugin_name, &plugins_public_key)
            .await
        {
          report(
            app,
            SparusError::PluginEvent(format!(
              "Plugin {plugin_name}: install/update failed: {err}"
            )),
          );
        }
      }
      Ok(EventType::Delete) => {
        if let Err(err) =
          fs::remove_dir_all(format!("{app_data_dir_string}/plugins/{plugin_name}")).await
        {
          report(
            app,
            SparusError::PluginEvent(format!("Plugin {plugin_name}: delete failed: {err}")),
          );
        }
      }
      Err(_) => {
        report(
          app,
          SparusError::PluginEvent(format!(
            "Plugin {plugin_name}: unknown event type {}",
            item.event_type
          )),
        );
      }
    }
  }
}

pub async fn start_rpc_client<R: Runtime>(
  app: AppHandle<R>,
  app_data_dir: PathBuf,
  cms_url: String,
  plugins_url: String,
  launcher_name: String,
  plugins_public_key: String,
) {
  const MIN_BACKOFF: Duration = Duration::from_secs(1);
  const MAX_BACKOFF: Duration = Duration::from_secs(60);

  let mut backoff = MIN_BACKOFF;
  loop {
    match EventClient::connect(cms_url.clone()).await {
      Ok(mut client) => {
        backoff = MIN_BACKOFF;
        if let Err(err) = start_streaming(
          &app,
          app_data_dir.clone(),
          &mut client,
          plugins_url.clone(),
          launcher_name.clone(),
          plugins_public_key.clone(),
        )
        .await
        {
          report(&app, err);
        }
      }
      Err(err) => report(&app, SparusError::Rpc(err)),
    }

    sleep(backoff).await;
    backoff = (backoff * 2).min(MAX_BACKOFF);
  }
}

async fn download_and_write_file(
  app_data_dir: PathBuf,
  url: String,
  plugin_name: &str,
  public_key: &str,
) -> Result<(), SparusError> {
  if plugin_name.is_empty()
    || !plugin_name
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
  {
    return Err(SparusError::PluginEvent(
      "Invalid plugin archive name".into(),
    ));
  }
  if public_key.trim().is_empty() {
    return Err(SparusError::PluginEvent(
      "Plugin signing public key is not configured".into(),
    ));
  }

  let archive_url = format!("{url}/{plugin_name}.zip");
  let signature_url = format!("{archive_url}.minisig");
  let archive = download_bytes(archive_url).await?;
  let signature_text = String::from_utf8(download_bytes(signature_url).await?)?;
  let key = minisign_verify::PublicKey::from_base64(public_key.trim())?;
  let signature = minisign_verify::Signature::decode(&signature_text)?;
  key.verify(&archive, &signature, false)?;

  let plugins_dir = app_data_dir.join("plugins");
  fs::create_dir_all(&plugins_dir).await?;
  let staging_dir = plugins_dir.join(format!(".{plugin_name}.installing"));
  if fs::try_exists(&staging_dir).await? {
    fs::remove_dir_all(&staging_dir).await?;
  }
  fs::create_dir_all(&staging_dir).await?;

  let mut zip = zip::ZipArchive::new(Cursor::new(archive))?;
  for index in 0..zip.len() {
    let mut file = zip.by_index(index)?;
    let Some(relative_path) = file.enclosed_name() else {
      let _ = fs::remove_dir_all(&staging_dir).await;
      return Err(SparusError::PluginEvent(
        "Plugin archive contains an unsafe path".into(),
      ));
    };
    let destination = staging_dir.join(relative_path);
    if file.is_dir() {
      fs::create_dir_all(&destination).await?;
    } else {
      if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
      }
      let mut contents = Vec::new();
      file.read_to_end(&mut contents)?;
      fs::write(destination, contents).await?;
    }
  }

  let destination_dir = plugins_dir.join(plugin_name);
  if fs::try_exists(&destination_dir).await? {
    fs::remove_dir_all(&destination_dir).await?;
  }
  fs::rename(&staging_dir, &destination_dir).await?;

  Ok(())
}

async fn download_bytes(url: String) -> Result<Vec<u8>, SparusError> {
  let response = reqwest::get(url).await?;
  if response.status() != StatusCode::OK {
    return Err(SparusError::Plugin);
  }

  let mut stream = response.bytes_stream();
  let mut bytes = Vec::new();
  while let Some(chunk) = stream.next().await {
    let data = chunk?;
    bytes.extend_from_slice(&data);
  }
  Ok(bytes)
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
