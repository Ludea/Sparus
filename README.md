# Sparus

Sparus is a simple game launcher, available on Windows, MacOS, and Linux, to start and keep your game up-to-date !

## Build Instructions

### Dependencies

To build Sparus, you need some packages:

- [Rust](https://www.rust-lang.org/ "Rust")
- [Nodejs](https://nodejs.org/en/ "Nodejs")
- [Yarn](https://yarnpkg.com/ "Yarn")
- [Webview2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section "Webview2") (only for Windows)
- [xcode](https://developer.apple.com/xcode/ "Xcode") (only for Macos)
- `sudo apt update && sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libappindicator3-dev librsvg2-dev` (only for Linux)

### Build

#### Prerequis

You have to copy or move `Sparus-sample.json` to `Sparus.json` into `src-tauri` folder

dev mode: `yarn tauri dev`  
production mode: `yarn tauri build`

In production mode, binaries are stored into src-tauri/target/release

Note: Cross building is not supported
