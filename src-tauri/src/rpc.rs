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
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_http::reqwest;
use tokio::{
  fs::{self, File},
  io::AsyncWriteExt,
  time::{sleep, Duration},
};
use tonic::transport::Channel;

/// Event carrying a `SparusError` to the frontend.
///
/// `SparusError` already serializes to `{kind, message}`, which is the shape
/// the UI's error handling expects, so this can be surfaced the same way as
/// any other error. Same mechanism `updater.rs` uses for
/// `sparus://downloadinfos`.
pub const PLUGIN_ERROR_EVENT: &str = "sparus://pluginerror";

fn report<R: Runtime>(app: &AppHandle<R>, err: SparusError) {
  // `Emitter::emit` needs `Serialize + Clone`, and `SparusError` can't be
  // `Clone` (it wraps `io::Error` and friends). Going through `to_value` reuses
  // the existing `Serialize` impl, so the `kind` stays consistent with every
  // other error the frontend receives.
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
    // A failure on one plugin is reported to the frontend and skipped. It must
    // not leave the loop: returning here ends the subscription, so the next
    // event never arrives (#1060).
    match EventType::try_from(item.event_type) {
      Ok(EventType::Install) | Ok(EventType::Update) => {
        if let Err(err) = download_and_write_file(app_data_dir.clone(), url, &plugin_name).await {
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

/// Subscribes to the CMS event stream, reconnecting for as long as the app
/// runs.
///
/// This never returns: the subscription has to outlive transient failures. The
/// CMS may not be up yet when the launcher starts, a stream can drop at any
/// time, and giving up on either leaves the launcher silently unsubscribed for
/// the rest of the session. Errors are emitted to the frontend rather than
/// returned -- the caller spawns this and drops the `JoinHandle`, so a returned
/// error would end the subscription without being seen by anyone.
pub async fn start_rpc_client<R: Runtime>(
  app: AppHandle<R>,
  app_data_dir: PathBuf,
  cms_url: String,
  plugins_url: String,
  launcher_name: String,
) {
  const MIN_BACKOFF: Duration = Duration::from_secs(1);
  const MAX_BACKOFF: Duration = Duration::from_secs(60);

  let mut backoff = MIN_BACKOFF;
  loop {
    match EventClient::connect(cms_url.clone()).await {
      Ok(mut client) => {
        // Connected: a later failure is transient, so restart the backoff.
        backoff = MIN_BACKOFF;
        if let Err(err) = start_streaming(
          &app,
          app_data_dir.clone(),
          &mut client,
          plugins_url.clone(),
          launcher_name.clone(),
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
