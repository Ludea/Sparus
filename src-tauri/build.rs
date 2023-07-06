fn main() -> Result<(), Box<dyn std::error::Error>> {
  tauri_build::build();
  tonic_build::configure()
    .compile(&["proto/echo.proto"], &["proto"])
    .unwrap();

  Ok(())
}
