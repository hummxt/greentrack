# Greentrack

<img src="public/greentrack-logo.png" alt="Greentrack" width="96">

A local Windows tracker, built with [Tauri](https://tauri.app/). A track can be a habit, a goal, a task, or exam prep.

Free and open source. Saves locally.

## Preview

![Preview](public/greentrack_screenshot.png)

## Features

- Add a track and keep a daily note for it (`Ctrl` / `Cmd` + `K` to quick-add)
- Mark the day done, partial, or missed
- See the month, streak, and heatmap
- Sit with a timer — 25 minutes up to 3 hours
- Light and dark themes; data stays on your computer
- Close goes to the tray so you don't lose the session

## Requirements

- [Node.js](https://nodejs.org/)
- [Rust](https://rustup.rs/)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) on Windows (usually already installed)

## Run from source

```bash
npm install
npm run tauri dev
```

## Build a Windows installer

```bash
npm run tauri build
```

That writes:

- portable app: `src-tauri/target/release/greentrack.exe`
- NSIS installer: `src-tauri/target/release/bundle/nsis/Greentrack_0.1.0_x64-setup.exe`
- MSI: `src-tauri/target/release/bundle/msi/Greentrack_0.1.0_x64_en-US.msi`

## Data

Tracks and notes are stored on this computer: browser storage plus `habits.json` in the app data folder. Settings stay in local storage. There is no cloud account.

## License

Greentrack is free and open source under the [MIT License](LICENSE).


Built by [Hummet Azim](https://www.hummet.dev).

