use async_lock::Mutex;
use futures::TryStreamExt;
use libspeedupdate::{
  link::{AutoRepository, RemoteRepository, RepositoryError},
  metadata::{CleanName, Current},
  workspace::{UpdateError, UpdateOptions, Workspace},
};
use semver::Version;
use serde::Serialize;
use std::{fs, future, io, path::Path, sync::Arc};
use tauri::{command, AppHandle, Emitter, Runtime, Window};
use tokio::{
  sync::{mpsc, oneshot},
  task::LocalSet,
};

#[derive(serde::Serialize)]
pub enum UpdateErr {
  Io(String),
  UpdateErr { description: String },
}

impl From<io::Error> for UpdateErr {
  fn from(err: io::Error) -> Self {
    UpdateErr::Io(err.to_string())
  }
}

impl From<UpdateError> for UpdateErr {
  fn from(error: UpdateError) -> Self {
    Self::UpdateErr {
      description: error.to_string(),
    }
  }
}

impl From<RepositoryError> for UpdateErr {
  fn from(error: RepositoryError) -> Self {
    Self::UpdateErr {
      description: error.to_string(),
    }
  }
}

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

pub enum Task {
  UpdateWorkspace {
    window: Window,
    repo: AutoRepository,
    workspace: Arc<Mutex<Workspace>>,
    goal_version: Option<String>,
    response: oneshot::Sender<Result<(), UpdateErr>>,
  },
}

#[derive(Clone)]
pub struct LocalSpawner {
  send: mpsc::UnboundedSender<Task>,
}

impl LocalSpawner {
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

  pub fn spawn(&self, task: Task) {
    if self.send.send(task).is_err() {
      panic!("Thread with LocalSet has shut down.")
    }
  }
}

async fn run_task(task: Task) {
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
pub async fn update_workspace(
  window: Window,
  spawner: tauri::State<'_, LocalSpawner>,
  workspace_path: &str,
  repository_url: &str,
  auth: Option<(&str, &str)>,
  goal_version: Option<String>,
) -> Result<(), UpdateErr> {
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
) -> Result<bool, UpdateErr> {
  let auth;
  match username {
    Some(ref user) => match password {
      Some(ref pass) => auth = Some((user.as_str(), pass.as_str())),
      None => auth = None,
    },
    None => auth = None,
  }

  let local_version = &handle.package_info().version;

  let remote_version = latest_remote_version(repository_url, auth).await;
  match remote_version {
    Ok(value) => {
      let remote_version_semver = Version::parse(value.version().as_str());
      let rv = remote_version_semver.unwrap().gt(local_version);
      Ok(rv)
    }
    Err(value) => Err(value),
  }
}

#[command]
pub fn check_if_installed(path: String) -> Result<(), &'static str> {
  let path = Path::new(&path);
  if path.is_dir() {
    let entries = fs::read_dir(path);
    if let Ok(entries) = entries {
      for entry in entries {
        if entry.is_ok() {
          return Ok(());
        }
      }
    }
    return Err("Not installed");
  }
  Err("folder doesn't exist")
}

async fn latest_remote_version(
  repository_url: String,
  auth: Option<(&str, &str)>,
) -> Result<Current, UpdateErr> {
  let res = AutoRepository::new(repository_url.as_str(), auth)?;
  let remote_version = res.current_version().await?;
  Ok(remote_version)
}
