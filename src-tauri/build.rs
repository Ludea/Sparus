use protox::prost::Message;
use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
  #[cfg(any(target_os = "windows", target_os = "macos", target_os = "linux"))
  tauri_runtime_verso_build::get_verso_as_external_bin().unwrap();

  fs::copy("Sparus-sample.json", "Sparus.json")?;

  let file_descriptors = protox::compile(["proto/sparus.proto"], ["."]).unwrap();

  let file_descriptor_path =
    PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR not set")).join("file_descriptor_set.bin");
  fs::write(&file_descriptor_path, file_descriptors.encode_to_vec()).unwrap();

  tauri_build::try_build(
    tauri_build::Attributes::new()
      .codegen(tauri_build::CodegenContext::new())
      .app_manifest(
        tauri_build::AppManifest::new().commands(&["update_workspace", "update_available"]),
      ),
  )
  .expect("failed to run tauri-build");

  tonic_prost_build::configure()
    .skip_protoc_run()
    .file_descriptor_set_path(&file_descriptor_path)
    .compile_protos(&["proto/sparus.proto"], &["proto"])
    .unwrap();

  Ok(())
}
