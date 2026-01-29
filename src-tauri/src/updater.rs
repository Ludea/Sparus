use crate::errors::SparusError;
use crate::utils;
use async_lock::Mutex;
use futures::TryStreamExt;
use libspeedupdate::{
  link::{AutoRepository, RemoteRepository},
  metadata::{CleanName, Current},
  workspace::{UpdateOptions, Workspace},
};
use semver::Version;
use serde::Serialize;
use std::{future, path::Path, sync::Arc};
use tauri::{command, AppHandle, Emitter, Runtime, Window};
use tokio::{
  sync::{mpsc, oneshot},
  task::LocalSet,
};

#[derive(Clone, Serialize)]
struct DownloadInfos {
  packages_start: usize,
  packages_end: usize,

  downloaded_files_start: Option<usize>,
  downloaded_files_end: Option<usize>,
  downloaded_bytes_start: Option<u64>,
  downloaded_bytes_end: Option<u64>,
  applied_files_start: Option<usize>,
  applied_files_end: Option<usize>,
  applied_input_bytes_start: Option<u64>,
  applied_input_bytes_end: Option<u64>,
  applied_output_bytes_start: Option<u64>,
  applied_output_bytes_end: Option<u64>,
  failed_files: Option<usize>,
  downloaded_files_per_sec: Option<f64>,
  downloaded_bytes_per_sec: Option<f64>,
  applied_files_per_sec: Option<f64>,
  applied_input_bytes_per_sec: Option<f64>,
  applied_output_bytes_per_sec: Option<f64>,
}

pub enum Task<R: Runtime> {
  UpdateWorkspace {
    window: Window<R>,
    repo: AutoRepository,
    workspace: Arc<Mutex<Workspace>>,
    goal_version: Option<String>,
    response: oneshot::Sender<Result<(), SparusError>>,
  },
}

#[derive(Clone)]
pub struct LocalSpawner<R: Runtime> {
  send: mpsc::UnboundedSender<Task<R>>,
}

impl<R: Runtime> LocalSpawner<R> {
  pub fn new() -> Self {
    let (send, mut recv) = mpsc::unbounded_channel();

    std::thread::spawn(move || {
      let local = LocalSet::new();

      local.spawn_local(async move {
        while let Some(new_task) = recv.recv().await {
          tokio::task::spawn_local(run_task(new_task));
        }
      });

      tauri::async_runtime::block_on(local);
    });

    Self { send }
  }

  pub fn spawn(&self, task: Task<R>) {
    if self.send.send(task).is_err() {
      panic!("Thread with LocalSet has shut down.")
    }
  }
}

async fn run_task<R: Runtime>(task: Task<R>) {
  match task {
    Task::UpdateWorkspace {
      window,
      repo,
      workspace,
      goal_version,
      response,
    } => {
      let result = workspace
        .lock()
        .await
        .update(
          &repo,
          goal_version.map(|v| CleanName::new(v).unwrap()),
          UpdateOptions::default(),
        )
        .try_take_while(|progress| {
          let state = progress.borrow();
          let progression = state.histogram.progress();
          let speed = state.histogram.speed().progress_per_sec();
          window
            .emit(
              "sparus://downloadinfos",
              DownloadInfos {
                packages_start: state.downloading_package_idx,
                packages_end: state.steps.len(),
                downloaded_files_start: Some(progression.downloaded_files),
                downloaded_files_end: Some(state.download_files),
                downloaded_bytes_start: Some(progression.downloaded_bytes),
                downloaded_bytes_end: Some(state.download_bytes),
                applied_files_start: Some(progression.applied_files),
                applied_files_end: Some(state.apply_files),
                applied_input_bytes_start: Some(progression.applied_input_bytes),
                applied_input_bytes_end: Some(state.apply_input_bytes),
                applied_output_bytes_start: Some(progression.applied_output_bytes),
                applied_output_bytes_end: Some(state.apply_output_bytes),
                failed_files: Some(progression.failed_files),
                downloaded_files_per_sec: Some(speed.downloaded_files_per_sec),
                downloaded_bytes_per_sec: Some(speed.downloaded_bytes_per_sec),
                applied_files_per_sec: Some(speed.applied_files_per_sec),
                applied_input_bytes_per_sec: Some(speed.applied_input_bytes_per_sec),
                applied_output_bytes_per_sec: Some(speed.applied_output_bytes_per_sec),
              },
            )
            .unwrap();
          future::ready(Ok(true))
        })
        .try_for_each(|_| future::ready(Ok(())))
        .await;

      let _ = response.send(result.map_err(Into::into));
    }
  }
}

#[command]
pub async fn update_workspace<R: Runtime>(
  window: Window<R>,
  spawner: tauri::State<'_, LocalSpawner<R>>,
  workspace_path: &str,
  repository_url: &str,
  auth: Option<(&str, &str)>,
  goal_version: Option<String>,
) -> Result<(), SparusError> {
  let repo = AutoRepository::new(repository_url, auth)?;

  let workspace = Arc::new(Mutex::new(Workspace::open(Path::new(workspace_path))?));

  let (send, response) = oneshot::channel();
  spawner.spawn(Task::UpdateWorkspace {
    window,
    repo,
    workspace,
    goal_version,
    response: send,
  });
  response.await.unwrap()
}

#[command]
pub async fn update_available<R: Runtime>(
  handle: AppHandle<R>,
  repository_url: String,
  username: Option<String>,
  password: Option<String>,
) -> Result<bool, SparusError> {
  let auth;
  match username {
    Some(ref user) => match password {
      Some(ref pass) => auth = Some((user.as_str(), pass.as_str())),
      None => auth = None,
    },
    None => auth = None,
  }

  let local_version_string = utils::version(handle)?;
  let local_version = Version::parse(&local_version_string).unwrap();
  let remote_version = latest_remote_version(repository_url, auth).await;
  match remote_version {
    Ok(value) => {
      let remote_version_semver = Version::parse(value.version().as_str());
      let rv = remote_version_semver?.gt(&local_version);
      Ok(rv)
    }
    Err(value) => Err(value),
  }
}

async fn latest_remote_version(
  repository_url: String,
  auth: Option<(&str, &str)>,
) -> Result<Current, SparusError> {
  let res = AutoRepository::new(repository_url.as_str(), auth)?;
  let remote_version = res.current_version().await?;
  Ok(remote_version)
}
