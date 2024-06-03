use tauri::{
  menu::{Menu, MenuItem},
  tray::TrayIconBuilder,
  Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&quit])?;

  let _ = TrayIconBuilder::with_id("tray")
    .tooltip("Sparus")
    .icon(app.default_window_icon().unwrap().clone())
    .menu(&menu)
    .menu_on_left_click(false)
    .on_menu_event(move |app, event| {
      if event.id.as_ref() == "quit" {
        app.exit(0)
      }
    })
    .build(app);
  Ok(())
}
