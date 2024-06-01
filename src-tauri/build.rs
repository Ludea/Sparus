use protox::prost::Message;
use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
  let file_descriptors = protox::compile(["proto/echo.proto"], ["."]).unwrap();

  let file_descriptor_path =
    PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR not set")).join("file_descriptor_set.bin");
  fs::write(&file_descriptor_path, file_descriptors.encode_to_vec()).unwrap();

  tauri_build::build();
  tonic_build::configure()
    .skip_protoc_run()
    .file_descriptor_set_path(&file_descriptor_path)
    .compile(&["proto/echo.proto"], &["proto"])
    .unwrap();

  Ok(())
}
