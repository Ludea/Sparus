use protox::prost::Message;
use std::{
  env, fs,
  path::{self, Path, PathBuf},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
  let versoview_output_path = ".";
  if !Path::new(&format!("{}/{}", versoview_output_path, "versoview")).exists()
    && Path::new(&format!("{}/{}", versoview_output_path, "versoview")).is_file()
  {
    versoview_build::download_and_extract_verso(versoview_output_path).unwrap();
    rename_verso(versoview_output_path);
  }

  fs::copy("Sparus-sample.json", "Sparus.json")?;
  let file_descriptors = protox::compile(["proto/echo.proto"], ["."]).unwrap();

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

  tonic_build::configure()
    .skip_protoc_run()
    .file_descriptor_set_path(&file_descriptor_path)
    .compile_protos(&["proto/echo.proto"], &["proto"])
    .unwrap();

  Ok(())
}

fn rename_verso(verso_path: &str) {
  let target_triple = std::env::var("TARGET").unwrap();
  let base_path = PathBuf::from(verso_path);
  let ext = if cfg!(windows) { ".exe" } else { "" };

  let from_path = path::absolute(base_path.join(format!("versoview{ext}"))).unwrap();
  let to_path = path::absolute(base_path.join(format!("versoview-{target_triple}{ext}"))).unwrap();

  fs::copy(&from_path, &to_path).unwrap();

  println!("cargo:rerun-if-changed={}", from_path.display());
  println!("cargo:rerun-if-changed={}", to_path.display());
}
