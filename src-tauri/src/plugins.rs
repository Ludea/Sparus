use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, Runtime, State};
use tokio::fs;
use wasmtime::{
  component::{Component, Linker, ResourceTable, Val},
  Config, Engine, Result, Store,
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
    args: Vec<Val>,
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
    let mut result = [Val::String(String::new())];
    if let Some(func) = instance.get_func(&mut store, function) {
      func.call_async(&mut store, &args, &mut result).await?;
      let value_result = wasm_val_to_std_val(&result[0]);
      Ok(value_result.to_string())
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
  args: Option<Value>,
) -> std::result::Result<String, PluginsErr> {
  let mut plugins_args: Vec<Val> = Vec::new();
  if let Some(existing_arg) = args {
    plugins_args = std_array_to_vals(&existing_arg)
      .ok_or(PluginsErr::Wasmerr("Epected an array".to_string()))?;
  }
  let app_data_dir = handle.path().app_data_dir()?;
  let plugins_dir = app_data_dir.join("plugins");
  let result = state
    .call(plugins_dir, plugin, function, plugins_args)
    .await?;
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

fn std_val_to_wasm_val(value: &Value) -> Option<Val> {
  match value {
    Value::Null => Some(Val::Option(None)),
    Value::Bool(b) => Some(Val::Bool(*b)),
    Value::Number(n) => {
      if let Some(i) = n.as_i64() {
        if i >= i32::MIN as i64 && i <= i32::MAX as i64 {
          Some(Val::S32(i as i32))
        } else {
          Some(Val::S64(i))
        }
      } else if let Some(f) = n.as_f64() {
        if f >= f32::MIN as f64 && f <= f32::MAX as f64 {
          Some(Val::Float32(f as f32))
        } else {
          Some(Val::Float64(f))
        }
      } else {
        None
      }
    }
    Value::String(s) => Some(Val::String(s.clone())),
    Value::Array(arr) => {
      let vals: Vec<Val> = arr.iter().filter_map(std_val_to_wasm_val).collect();
      Some(Val::List(vals))
    }
    Value::Object(map) => {
      let fields: Vec<(String, Val)> = map
        .iter()
        .filter_map(|(k, v)| std_val_to_wasm_val(v).map(|vv| (k.clone(), vv)))
        .collect();
      Some(Val::Record(fields))
    }
  }
}

fn wasm_val_to_std_val(val: &Val) -> Value {
  match val {
    Val::Bool(b) => Value::Bool(*b),
    Val::S8(i) => Value::Number((*i).into()),
    Val::S16(i) => Value::Number((*i).into()),
    Val::S32(i) => Value::Number((*i).into()),
    Val::S64(i) => json!(i),
    Val::U8(i) => Value::Number((*i).into()),
    Val::U16(i) => Value::Number((*i).into()),
    Val::U32(i) => Value::Number((*i).into()),
    Val::U64(i) => json!(i),
    Val::Float32(f) => json!(f),
    Val::Float64(f) => json!(f),
    Val::String(s) => Value::String(s.clone()),

    Val::List(vals) => {
      let arr: Vec<Value> = vals.iter().map(wasm_val_to_std_val).collect();
      Value::Array(arr)
    }

    Val::Record(fields) => {
      let mut map = serde_json::Map::new();
      for (k, v) in fields {
        map.insert(k.clone(), wasm_val_to_std_val(v));
      }
      Value::Object(map)
    }

    Val::Option(opt) => match opt {
      Some(inner) => wasm_val_to_std_val(inner),
      None => Value::Null,
    },

    Val::Result(res) => match res {
      Ok(opt) => match opt {
        Some(inner) => json!({ "Ok": wasm_val_to_std_val(inner) }),
        None => json!({ "Ok": Value::Null }),
      },
      Err(opt) => match opt {
        Some(inner) => json!({ "Err": wasm_val_to_std_val(inner) }),
        None => json!({ "Err": Value::Null }),
      },
    },

    Val::Tuple(vals) => Value::Array(vals.iter().map(wasm_val_to_std_val).collect()),

    _ => Value::String(format!("{val:?}")),
  }
}

fn std_array_to_vals(value: &Value) -> Option<Vec<Val>> {
  value
    .as_array()
    .map(|arr| arr.iter().filter_map(std_val_to_wasm_val).collect())
}
