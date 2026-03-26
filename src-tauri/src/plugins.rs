use crate::errors::SparusError;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, Runtime, State};
use tokio::fs;
use wasmtime::{
  component::{types::ComponentItem, Component, Linker, ResourceTable, Type, Val},
  Config, Engine, Result, Store,
};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

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
    config
      .wasm_component_model_async(true)
      .wasm_component_model_async_builtins(true);
    let engine =
      Engine::new(&config).unwrap_or_else(|err| panic!("Unable to start wasm runtime: {}", err));
    Self { engine }
  }

  pub async fn call(
    &self,
    plugin_dir: PathBuf,
    plugin_name: String,
    function: String,
    args: Vec<Val>,
  ) -> Result<Value, SparusError> {
    let mut linker = Linker::new(&self.engine);
    wasmtime_wasi::p2::add_to_linker_async(&mut linker)?;
    let wasi = WasiCtx::builder().inherit_stdio().inherit_stderr().build();
    let state = ComponentRunStates {
      wasi_ctx: wasi,
      resource_table: ResourceTable::new(),
    };

    let mut store = Store::new(&self.engine, state);

    let plugin_absolute_path = plugin_dir
      .join(&plugin_name)
      .join(plugin_name)
      .with_extension("wasm");
    let component = Component::from_file(&self.engine, plugin_absolute_path)?;

    let component_type = component.component_type();
    let exports_iter = component_type.exports(&self.engine);
    let mut instance_name = "";
    for (name, export_type) in exports_iter {
      if let ComponentItem::ComponentInstance(_) = export_type {
        instance_name = name;
      }
    }

    let instance = linker.instantiate_async(&mut store, &component).await?;
    let instance_index = instance
      .get_export_index(&mut store, None, instance_name)
      .ok_or(SparusError::PluginInternal(
        "instance index not found".to_string(),
      ))?;

    let func_index = instance
      .get_export_index(&mut store, Some(&instance_index), &function)
      .ok_or(SparusError::PluginInternal(
        "function index not found".to_string(),
      ))?;

    let func = instance
      .get_func(&mut store, func_index)
      .ok_or(SparusError::PluginInternal(
        "function not found".to_string(),
      ))?;

    let func_ty = func.ty(&store);
    let result_types = func_ty.results();

    let mut results: Vec<Val> = result_types.map(default_val_from_type).collect();
    if func_ty.async_() {
      store
        .run_concurrent(async |accessor| -> Result<(), SparusError> {
          func.call_concurrent(accessor, &args, &mut results).await?;
          Ok(())
        })
        .await??
    } else {
      func.call_async(&mut store, &args, &mut results).await?
    }

    Ok(results_to_json(results))
  }
}

#[command]
pub async fn call_wasm_plugin_function<R: Runtime>(
  handle: AppHandle<R>,
  state: State<'_, PluginSystem>,
  plugin: String,
  function: String,
  args: Option<Value>,
) -> Result<Value, SparusError> {
  let plugins_args = match args {
    Some(existing_arg) => std_array_to_vals(&existing_arg).ok_or(SparusError::Wasmtime(
      wasmtime::Error::msg("Epected an array"),
    )),
    None => Err(SparusError::Wasmtime(wasmtime::Error::msg(""))),
  }?;
  let app_data_dir = handle.path().app_data_dir()?;
  let plugins_dir = app_data_dir.join("plugins");
  state
    .call(plugins_dir, plugin, function, plugins_args)
    .await
}

#[command]
pub async fn js_plugins_path<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, SparusError> {
  let plugins_dir = app.path().app_data_dir()?.join("plugins");

  if !plugins_dir.exists() {
    return Ok(Vec::new());
  }

  let mut entries = fs::read_dir(&plugins_dir).await?;

  let mut plugins = Vec::new();

  while let Some(entry) = entries.next_entry().await? {
    let path = entry.path();
    if path.is_dir() {
      let mut sub_entries = fs::read_dir(&path).await?;

      while let Some(entry) = sub_entries.next_entry().await? {
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

fn val_to_json(val: Val) -> Value {
  match val {
    Val::Bool(b) => Value::Bool(b),
    Val::S32(n) => Value::Number(n.into()),
    Val::S64(n) => Value::Number(n.into()),
    Val::U32(n) => Value::Number(n.into()),
    Val::U64(n) => Value::Number(n.into()),
    Val::Float32(f) => serde_json::Number::from_f64(f as f64)
      .map(Value::Number)
      .unwrap_or(Value::Null),
    Val::Float64(f) => serde_json::Number::from_f64(f)
      .map(Value::Number)
      .unwrap_or(Value::Null),
    Val::String(s) => Value::String(s),
    _ => Value::Null,
  }
}

fn results_to_json(results: Vec<Val>) -> Value {
  match results.len() {
    0 => Value::Null,
    1 => val_to_json(results.into_iter().next().unwrap()),
    _ => Value::Array(results.into_iter().map(val_to_json).collect()),
  }
}

fn default_val_from_type(ty: Type) -> Val {
  match ty {
    Type::Bool => Val::Bool(false),
    Type::S8 => Val::S8(0),
    Type::S16 => Val::S16(0),
    Type::S32 => Val::S32(0),
    Type::S64 => Val::S64(0),
    Type::U8 => Val::U8(0),
    Type::U16 => Val::U16(0),
    Type::U32 => Val::U32(0),
    Type::U64 => Val::U64(0),
    Type::Float32 => Val::Float32(0.0),
    Type::Float64 => Val::Float64(0.0),
    Type::String => Val::String(String::new()),
    Type::Result(result_ty) => {
      if let Some(ok_ty) = result_ty.ok() {
        Val::Result(Ok(Some(Box::new(default_val_from_type(ok_ty)))))
      } else {
        Val::Result(Ok(None))
      }
    }
    _ => unimplemented!("Type non supporté dynamiquement"),
  }
}

fn std_array_to_vals(value: &Value) -> Option<Vec<Val>> {
  value
    .as_array()
    .map(|arr| arr.iter().filter_map(std_val_to_wasm_val).collect())
}
