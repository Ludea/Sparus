use tauri::{command, State};
use wasmtime::{
  component::{Component, Linker, ResourceTable},
  *,
};
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

#[derive(serde::Serialize)]
pub enum WasmtimeErr {
  Wasmerr(String),
}

impl From<wasmtime::Error> for WasmtimeErr {
  fn from(err: wasmtime::Error) -> Self {
    WasmtimeErr::Wasmerr(err.to_string())
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

  async fn call(&self, plugin: String, function: String) -> Result<f32> {
    let file_path = "plugins";
    let mut linker = Linker::new(&self.engine);
    wasmtime_wasi::p2::add_to_linker_async(&mut linker)?;

    let wasi = WasiCtx::builder().build();
    let state = ComponentRunStates {
      wasi_ctx: wasi,
      resource_table: ResourceTable::new(),
    };
    let mut store = Store::new(&self.engine, state);
    let plugin_full_path = file_path.to_owned() + "/" + &plugin + ".wasm";
    let component = Component::from_file(&self.engine, plugin_full_path)?;
    let instance = linker.instantiate_async(&mut store, &component).await?;
    let mut result = [wasmtime::component::Val::U8(0)];
    if let Some(func) = instance.get_func(&mut store, function) {
      func.call_async(&mut store, &[], &mut result).await?;
      if let wasmtime::component::Val::Float32(f32_value) = result[0] {
        Ok(f32_value)
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
pub async fn call_plugin_function(
  state: State<'_, PluginSystem>,
  plugin: String,
  function: String,
) -> std::result::Result<f32, WasmtimeErr> {
  let result = state.call(plugin, function).await?;
  Ok(result)
}
