use crate::errors::SparusError;
use serde_json::{Map, Value};
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::Arc,
};
use tauri::{command, AppHandle, Manager, Runtime, State};
use tokio::{fs, sync::Mutex};
use wasmtime::{
  component::{
    types::ComponentItem, Component, ComponentExportIndex, Instance, Linker, ResourceAny,
    ResourceTable, Type, Val,
  },
  Config, Engine, Store,
};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

fn plugin_err(msg: impl Into<String> + Clone) -> SparusError {
  println!("wastime err: {}", msg.clone().into());
  SparusError::Wasmtime(wasmtime::Error::msg(msg.into()))
}

fn mismatch(expected: &str, got: &Value) -> SparusError {
  plugin_err(format!("expected {expected}, got {got}"))
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

#[derive(Default)]
struct Resources {
  table: HashMap<u64, ResourceAny>,
  next: u64,
}

impl Resources {
  fn insert(&mut self, resource: ResourceAny) -> u64 {
    self.next += 1;
    self.table.insert(self.next, resource);
    self.next
  }
}

fn handle_id(value: &Value) -> std::result::Result<u64, SparusError> {
  value
    .get("$resource")
    .and_then(Value::as_u64)
    .ok_or_else(|| mismatch("{ \"$resource\": id }", value))
}

fn as_int<T: TryFrom<i64> + TryFrom<u64>>(value: &Value) -> std::result::Result<T, SparusError> {
  value
    .as_i64()
    .and_then(|i| T::try_from(i).ok())
    .or_else(|| value.as_u64().and_then(|u| T::try_from(u).ok()))
    .ok_or_else(|| mismatch("integer in range", value))
}

fn as_float(value: &Value) -> std::result::Result<f64, SparusError> {
  value.as_f64().ok_or_else(|| mismatch("number", value))
}

fn json_to_val(
  value: &Value,
  ty: &Type,
  res: &mut Resources,
) -> std::result::Result<Val, SparusError> {
  Ok(match ty {
    Type::Bool => Val::Bool(value.as_bool().ok_or_else(|| mismatch("bool", value))?),
    Type::S8 => Val::S8(as_int(value)?),
    Type::S16 => Val::S16(as_int(value)?),
    Type::S32 => Val::S32(as_int(value)?),
    Type::S64 => Val::S64(as_int(value)?),
    Type::U8 => Val::U8(as_int(value)?),
    Type::U16 => Val::U16(as_int(value)?),
    Type::U32 => Val::U32(as_int(value)?),
    Type::U64 => Val::U64(as_int(value)?),
    Type::Float32 => Val::Float32(as_float(value)? as f32),
    Type::Float64 => Val::Float64(as_float(value)?),
    Type::Char => {
      let s = value.as_str().ok_or_else(|| mismatch("char", value))?;
      let mut chars = s.chars();
      match (chars.next(), chars.next()) {
        (Some(c), None) => Val::Char(c),
        _ => return Err(mismatch("single character", value)),
      }
    }
    Type::String => Val::String(
      value
        .as_str()
        .ok_or_else(|| mismatch("string", value))?
        .to_string(),
    ),
    Type::List(list) => {
      let elem_ty = list.ty();
      let items = value.as_array().ok_or_else(|| mismatch("array", value))?;
      Val::List(
        items
          .iter()
          .map(|item| json_to_val(item, &elem_ty, res))
          .collect::<std::result::Result<_, _>>()?,
      )
    }
    Type::Record(record) => {
      let obj = value.as_object().ok_or_else(|| mismatch("object", value))?;
      let mut fields = Vec::new();
      for field in record.fields() {
        let val = match obj.get(field.name) {
          Some(v) => json_to_val(v, &field.ty, res)?,
          None if matches!(field.ty, Type::Option(_)) => Val::Option(None),
          None => return Err(plugin_err(format!("missing field `{}`", field.name))),
        };
        fields.push((field.name.to_string(), val));
      }
      Val::Record(fields)
    }
    Type::Tuple(tuple) => {
      let types: Vec<Type> = tuple.types().collect();
      let items = value.as_array().ok_or_else(|| mismatch("array", value))?;
      if items.len() != types.len() {
        return Err(plugin_err(format!(
          "tuple expects {} elements, got {}",
          types.len(),
          items.len()
        )));
      }
      Val::Tuple(
        items
          .iter()
          .zip(&types)
          .map(|(item, t)| json_to_val(item, t, res))
          .collect::<std::result::Result<_, _>>()?,
      )
    }
    Type::Variant(variant) => {
      let obj = value
        .as_object()
        .ok_or_else(|| mismatch("{ tag, val? }", value))?;
      let tag = obj
        .get("tag")
        .and_then(Value::as_str)
        .ok_or_else(|| mismatch("{ tag, val? }", value))?;
      let case = variant
        .cases()
        .find(|c| c.name == tag)
        .ok_or_else(|| plugin_err(format!("unknown variant case `{tag}`")))?;
      let payload = match (&case.ty, obj.get("val")) {
        (Some(t), Some(v)) => Some(Box::new(json_to_val(v, t, res)?)),
        (None, _) => None,
        (Some(_), None) => return Err(plugin_err(format!("case `{tag}` requires `val`"))),
      };
      Val::Variant(tag.to_string(), payload)
    }
    Type::Enum(en) => {
      let name = value
        .as_str()
        .ok_or_else(|| mismatch("enum string", value))?;
      if !en.names().any(|n| n == name) {
        return Err(plugin_err(format!("unknown enum case `{name}`")));
      }
      Val::Enum(name.to_string())
    }
    Type::Flags(flags) => {
      let items = value
        .as_array()
        .ok_or_else(|| mismatch("array of flags", value))?;
      let mut out = Vec::new();
      for item in items {
        let name = item.as_str().ok_or_else(|| mismatch("flag string", item))?;
        if !flags.names().any(|n| n == name) {
          return Err(plugin_err(format!("unknown flag `{name}`")));
        }
        out.push(name.to_string());
      }
      Val::Flags(out)
    }
    Type::Option(option) => {
      if value.is_null() {
        Val::Option(None)
      } else {
        Val::Option(Some(Box::new(json_to_val(value, &option.ty(), res)?)))
      }
    }
    Type::Result(result) => {
      let obj = value
        .as_object()
        .ok_or_else(|| mismatch("{ ok } | { err }", value))?;
      if let Some(v) = obj.get("ok") {
        let inner = match result.ok() {
          Some(t) => Some(Box::new(json_to_val(v, &t, res)?)),
          None => None,
        };
        Val::Result(Ok(inner))
      } else if let Some(v) = obj.get("err") {
        let inner = match result.err() {
          Some(t) => Some(Box::new(json_to_val(v, &t, res)?)),
          None => None,
        };
        Val::Result(Err(inner))
      } else {
        return Err(mismatch("{ ok } | { err }", value));
      }
    }
    Type::Own(_) => {
      let id = handle_id(value)?;
      let resource = res
        .table
        .remove(&id)
        .ok_or_else(|| plugin_err(format!("unknown or already consumed resource {id}")))?;
      Val::Resource(resource)
    }
    // borrow<resource>: the resource stays in the table.
    Type::Borrow(_) => {
      let id = handle_id(value)?;
      let resource = res
        .table
        .get(&id)
        .copied()
        .ok_or_else(|| plugin_err(format!("unknown resource {id}")))?;
      Val::Resource(resource)
    }
    other => return Err(plugin_err(format!("unsupported parameter type: {other:?}"))),
  })
}

fn float_to_json(f: f64) -> Value {
  serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number)
}

fn opt_to_json(
  inner: Option<Box<Val>>,
  res: &mut Resources,
) -> std::result::Result<Value, SparusError> {
  match inner {
    Some(v) => val_to_json(*v, res),
    None => Ok(Value::Null),
  }
}

fn val_to_json(val: Val, res: &mut Resources) -> std::result::Result<Value, SparusError> {
  Ok(match val {
    Val::Bool(b) => Value::Bool(b),
    Val::S8(n) => Value::from(n),
    Val::S16(n) => Value::from(n),
    Val::S32(n) => Value::from(n),
    Val::S64(n) => Value::from(n), // note: JS precision is limited to 2^53
    Val::U8(n) => Value::from(n),
    Val::U16(n) => Value::from(n),
    Val::U32(n) => Value::from(n),
    Val::U64(n) => Value::from(n), // same caveat
    Val::Float32(f) => float_to_json(f as f64),
    Val::Float64(f) => float_to_json(f),
    Val::Char(c) => Value::String(c.to_string()),
    Val::String(s) => Value::String(s),
    Val::List(items) | Val::Tuple(items) => Value::Array(
      items
        .into_iter()
        .map(|v| val_to_json(v, res))
        .collect::<std::result::Result<_, _>>()?,
    ),
    Val::Record(fields) => {
      let mut map = Map::new();
      for (name, v) in fields {
        map.insert(name, val_to_json(v, res)?);
      }
      Value::Object(map)
    }
    Val::Variant(tag, payload) => {
      let mut map = Map::new();
      map.insert("tag".into(), Value::String(tag));
      if payload.is_some() {
        map.insert("val".into(), opt_to_json(payload, res)?);
      }
      Value::Object(map)
    }
    Val::Enum(name) => Value::String(name),
    Val::Option(inner) => opt_to_json(inner, res)?,
    Val::Result(r) => {
      let mut map = Map::new();
      match r {
        Ok(inner) => map.insert("ok".into(), opt_to_json(inner, res)?),
        Err(inner) => map.insert("err".into(), opt_to_json(inner, res)?),
      };
      Value::Object(map)
    }
    Val::Flags(names) => Value::Array(names.into_iter().map(Value::String).collect()),
    Val::Resource(resource) => {
      let id = res.insert(resource);
      let mut map = Map::new();
      map.insert("$resource".into(), Value::from(id));
      Value::Object(map)
    }
    other => return Err(plugin_err(format!("unsupported result value: {other:?}"))),
  })
}

fn results_to_json(
  results: Vec<Val>,
  res: &mut Resources,
) -> std::result::Result<Value, SparusError> {
  let mut values = results
    .into_iter()
    .map(|v| val_to_json(v, res))
    .collect::<std::result::Result<Vec<_>, _>>()?;
  Ok(match values.len() {
    0 => Value::Null,
    1 => values.remove(0),
    _ => Value::Array(values),
  })
}

struct PluginSession {
  store: Store<ComponentRunStates>,
  instance: Instance,
  instance_index: ComponentExportIndex,
  resources: Resources,
}

impl PluginSession {
  async fn open(
    engine: &Engine,
    plugin_dir: &Path,
    plugin_name: &str,
  ) -> std::result::Result<Self, SparusError> {
    let mut linker = Linker::new(engine);
    wasmtime_wasi::p3::add_to_linker(&mut linker)?;
    let wasi = WasiCtx::builder().inherit_stdio().inherit_stderr().build();
    let state = ComponentRunStates {
      wasi_ctx: wasi,
      resource_table: ResourceTable::new(),
    };
    let mut store = Store::new(engine, state);

    let plugin_path = plugin_dir
      .join(plugin_name)
      .join(plugin_name)
      .with_extension("wasm");
    let component = Component::from_file(engine, plugin_path)?;

    let component_type = component.component_type();
    let mut instance_name: Option<String> = None;
    for (name, export_type) in component_type.exports(engine) {
      if let ComponentItem::ComponentInstance(_) = export_type.ty {
        instance_name = Some(name.to_string());
      }
    }
    let instance_name = instance_name
      .ok_or_else(|| SparusError::PluginInternal("no exported instance".to_string()))?;

    let instance = linker.instantiate_async(&mut store, &component).await?;
    let instance_index = instance
      .get_export_index(&mut store, None, &instance_name)
      .ok_or_else(|| SparusError::PluginInternal("instance index not found".to_string()))?;

    Ok(Self {
      store,
      instance,
      instance_index,
      resources: Resources::default(),
    })
  }

  async fn call(
    &mut self,
    function: &str,
    args: Vec<Value>,
  ) -> std::result::Result<Value, SparusError> {
    let func_index = self
      .instance
      .get_export_index(&mut self.store, Some(&self.instance_index), function)
      .ok_or_else(|| SparusError::PluginInternal("function index not found".to_string()))?;
    let func = self
      .instance
      .get_func(&mut self.store, func_index)
      .ok_or_else(|| SparusError::PluginInternal("function not found".to_string()))?;

    let func_ty = func.ty(&self.store);
    let param_types: Vec<Type> = func_ty.params().map(|(_, ty)| ty).collect();
    if param_types.len() != args.len() {
      return Err(plugin_err(format!(
        "`{function}` expects {} argument(s), got {}",
        param_types.len(),
        args.len()
      )));
    }

    let params = args
      .iter()
      .zip(&param_types)
      .map(|(arg, ty)| json_to_val(arg, ty, &mut self.resources))
      .collect::<std::result::Result<Vec<Val>, _>>()?;

    // Wasmtime overwrites every slot: only the number of results matters.
    let mut results = vec![Val::Bool(false); func_ty.results().count()];

    if func_ty.async_() {
      self
        .store
        .run_concurrent(async |accessor| -> std::result::Result<(), SparusError> {
          func
            .call_concurrent(accessor, &params, &mut results)
            .await?;
          Ok(())
        })
        .await??
    } else {
      func
        .call_async(&mut self.store, &params, &mut results)
        .await?
    }

    results_to_json(results, &mut self.resources)
  }

  async fn drop_resource(&mut self, id: u64) -> std::result::Result<(), SparusError> {
    let resource = self
      .resources
      .table
      .remove(&id)
      .ok_or_else(|| plugin_err(format!("unknown resource {id}")))?;
    resource.resource_drop_async(&mut self.store).await?;
    Ok(())
  }
}

type SharedSession = Arc<Mutex<PluginSession>>;

#[derive(Clone)]
pub struct PluginSystem {
  engine: Engine,
  sessions: Arc<Mutex<HashMap<String, SharedSession>>>,
}

fn validate_plugin_name(name: &str) -> std::result::Result<(), SparusError> {
  let valid = !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', '\0']);
  if valid {
    Ok(())
  } else {
    Err(SparusError::PluginInternal(format!(
      "invalid plugin name: {name}"
    )))
  }
}

impl PluginSystem {
  pub fn new() -> Self {
    let mut config = Config::new();
    config
      .wasm_component_model_async(true)
      .wasm_component_model_async(true)
      .concurrency_support(true);
    let engine =
      Engine::new(&config).unwrap_or_else(|err| panic!("Unable to start wasm runtime: {}", err));
    Self {
      engine,
      sessions: Arc::new(Mutex::new(HashMap::new())),
    }
  }

  async fn session(
    &self,
    plugin_dir: &Path,
    plugin_name: &str,
  ) -> std::result::Result<SharedSession, SparusError> {
    validate_plugin_name(plugin_name)?;
    let mut sessions = self.sessions.lock().await;
    if let Some(session) = sessions.get(plugin_name) {
      return Ok(session.clone());
    }
    let session = PluginSession::open(&self.engine, plugin_dir, plugin_name).await?;
    let session = Arc::new(Mutex::new(session));
    sessions.insert(plugin_name.to_string(), session.clone());
    Ok(session)
  }

  pub async fn call(
    &self,
    plugin_dir: PathBuf,
    plugin_name: String,
    function: String,
    args: Vec<Value>,
  ) -> std::result::Result<Value, SparusError> {
    let session = self.session(&plugin_dir, &plugin_name).await?;
    let mut session = session.lock().await;
    session.call(&function, args).await
  }

  pub async fn drop_resource(
    &self,
    plugin_dir: PathBuf,
    plugin_name: String,
    handle: u64,
  ) -> std::result::Result<(), SparusError> {
    let session = self.session(&plugin_dir, &plugin_name).await?;
    let mut session = session.lock().await;
    session.drop_resource(handle).await
  }

  pub async fn unload(&self, plugin_name: &str) {
    self.sessions.lock().await.remove(plugin_name);
  }
}

fn plugins_dir<R: Runtime>(handle: &AppHandle<R>) -> std::result::Result<PathBuf, SparusError> {
  Ok(handle.path().app_data_dir()?.join("plugins"))
}

#[command]
pub async fn call_wasm_plugin_function<R: Runtime>(
  handle: AppHandle<R>,
  state: State<'_, PluginSystem>,
  plugin: String,
  function: String,
  args: Option<Value>,
) -> std::result::Result<Value, SparusError> {
  let args = match args {
    None | Some(Value::Null) => Vec::new(),
    Some(Value::Array(items)) => items,
    Some(other) => return Err(mismatch("array of arguments", &other)),
  };
  state
    .call(plugins_dir(&handle)?, plugin, function, args)
    .await
}

#[command]
pub async fn drop_wasm_plugin_resource<R: Runtime>(
  handle: AppHandle<R>,
  state: State<'_, PluginSystem>,
  plugin: String,
  resource: u64,
) -> std::result::Result<(), SparusError> {
  state
    .drop_resource(plugins_dir(&handle)?, plugin, resource)
    .await
}

#[command]
pub async fn unload_wasm_plugin(
  state: State<'_, PluginSystem>,
  plugin: String,
) -> std::result::Result<(), SparusError> {
  state.unload(&plugin).await;
  Ok(())
}

#[command]
pub async fn js_plugins_path<R: Runtime>(
  app: AppHandle<R>,
) -> std::result::Result<Vec<String>, SparusError> {
  let plugins_dir = plugins_dir(&app)?;

  if !plugins_dir.exists() {
    return Ok(Vec::new());
  }

  let mut entries = fs::read_dir(&plugins_dir).await?;
  let mut plugins = Vec::new();

  while let Some(entry) = entries.next_entry().await? {
    let path = entry.path();
    if path.join("frontend.js").is_file() {
      let plugin_dir = path.strip_prefix(&plugins_dir)?;
      plugins.push(plugin_dir.display().to_string());
    }
  }
  Ok(plugins)
}
