use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, Runtime, State};
use tokio::fs;
use wasmtime::{
  component::{Component, Linker, ResourceTable},
  *,
};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

#[derive(serde::Serialize)]
pub enum PluginsErr {
  Wasmerr(String),
  IOerror(String),
  StripPrefixError(String),
  TauriError(String),
}

impl From<wasmtime::Error> for PluginsErr {
  fn from(err: wasmtime::Error) -> Self {
    PluginsErr::Wasmerr(err.to_string())
  }
}

impl From<std::io::Error> for PluginsErr {
  fn from(err: std::io::Error) -> Self {
    PluginsErr::IOerror(err.to_string())
  }
}

impl From<std::path::StripPrefixError> for PluginsErr {
  fn from(err: std::path::StripPrefixError) -> Self {
    PluginsErr::StripPrefixError(err.to_string())
  }
}

impl From<tauri::Error> for PluginsErr {
  fn from(err: tauri::Error) -> Self {
    PluginsErr::TauriError(err.to_string())
  }
}

pub struct ComponentRunStates {
  pub wasi_ctx: WasiCtx,
  pub resource_table: ResourceTable,
}

impl WasiView for ComponentRunStates {
  fn ctx(&mut self) -> WasiCtxView<'_> {
    WasiCtxView {
      ctx: &mut self.wasi_ctx,
      table: &mut self.resource_table,
    }
  }
}

#[derive(Clone)]
pub struct PluginSystem {
  engine: Engine,
}

impl PluginSystem {
  pub fn new() -> Self {
    let mut config = Config::new();
    config.async_support(true);
    let engine =
      Engine::new(&config).unwrap_or_else(|err| panic!("Unable to start wasm runtime: {}", err));
    Self { engine }
  }

  pub async fn call(
    &self,
    plugin_dir: PathBuf,
    plugin: String,
    function: String,
  ) -> Result<String> {
    let mut linker = Linker::new(&self.engine);
    wasmtime_wasi::p2::add_to_linker_async(&mut linker)?;

    let wasi = WasiCtx::builder().build();
    let state = ComponentRunStates {
      wasi_ctx: wasi,
      resource_table: ResourceTable::new(),
    };
    let mut store = Store::new(&self.engine, state);
    let plugin_full_path = plugin_dir.display().to_string() + "/" + &plugin + ".wasm";
    let component = Component::from_file(&self.engine, plugin_full_path)?;
    let instance = linker.instantiate_async(&mut store, &component).await?;
    let mut result = [wasmtime::component::Val::String(String::new())];
    if let Some(func) = instance.get_func(&mut store, function) {
      func.call_async(&mut store, &[], &mut result).await?;
      if let wasmtime::component::Val::String(value) = result[0].clone() {
        Ok(value)
      } else {
        let err = std::io::Error::other("error on returned value");
        Err(err.into())
      }
    } else {
      let err = std::io::Error::other("function does not exist");
      Err(err.into())
    }
  }
}

#[command]
pub async fn call_plugin_function<R: Runtime>(
  handle: AppHandle<R>,
  state: State<'_, PluginSystem>,
  plugin: String,
  function: String,
) -> std::result::Result<String, PluginsErr> {
  let app_data_dir = handle.path().app_data_dir()?;
  let plugins_dir = app_data_dir.join("plugins");
  let result = state.call(plugins_dir, plugin, function).await?;
  Ok(result)
}

#[command]
pub async fn js_plugins_path<R: Runtime>(
  app: AppHandle<R>,
) -> std::result::Result<Vec<String>, PluginsErr> {
  let plugins_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| std::io::Error::other(err.to_string()))?
    .join("plugins");

  if !plugins_dir.exists() {
    return Ok(Vec::new());
  }

  let mut entries = fs::read_dir(&plugins_dir)
    .await
    .map_err(|err| std::io::Error::other(err.to_string()))?;

  let mut plugins = Vec::new();

  while let Ok(Some(entry)) = entries.next_entry().await.map_err(|err| err.to_string()) {
    let path = entry.path();
    if path.is_dir() {
      let mut sub_entries = fs::read_dir(&path)
        .await
        .map_err(|err| std::io::Error::other(err.to_string()))?;
      while let Ok(Some(entry)) = sub_entries
        .next_entry()
        .await
        .map_err(|err| err.to_string())
      {
        let path = entry.path();
        if let Some(extension) = path.extension() {
          if extension == "js" {
            let full_path = entry.path();
            let relative_path = full_path.strip_prefix(plugins_dir.clone())?;
            let path = relative_path.display().to_string();

            plugins.push(path);
          }
        }
      }
    }
  }

  Ok(plugins)
}
