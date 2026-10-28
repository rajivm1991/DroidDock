# DroidDock

Transfer files between an Android phone and a Mac over a USB cable. The phone and This Mac stay open together, and a copy can go either way. Nothing is uploaded to a cloud.

🌐 **[Visit DroidDock Website](https://rajivm1991.github.io/DroidDock/)**

[![Latest Release](https://img.shields.io/github/v/release/rajivm1991/DroidDock?style=flat&color=6b8db5)](https://github.com/rajivm1991/DroidDock/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/rajivm1991/DroidDock/total?style=flat&color=6b8db5)](https://github.com/rajivm1991/DroidDock/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/rajivm1991/DroidDock/release.yml?style=flat)](https://github.com/rajivm1991/DroidDock/actions)
[![License](https://img.shields.io/github/license/rajivm1991/DroidDock?style=flat)](LICENSE)
[![macOS](https://img.shields.io/badge/macOS-10.15%2B-lightgrey?style=flat&logo=apple)](https://github.com/rajivm1991/DroidDock/releases/latest)
[![Homebrew](https://img.shields.io/badge/Homebrew-cask-orange?style=flat&logo=homebrew)](https://github.com/rajivm1991/DroidDock)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=flat&logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/rajivm1991)

**You don't need a technical background.** [Get the app](#get-the-app), open it, and follow the screen.

## How fast is a copy?

**Your phone's USB-C port sets the top speed.** On current phones that rating is often **5 or 10 Gb/s**, and **20 Gb/s** when the phone says so. Many phones are still **USB 2.0**, even with a USB-C plug. DroidDock uses whatever that port and the cable can do. Your Mac's port is faster than the phone's, so the Mac is not the holdup.

**5, 10, and 20 Gb/s are a ceiling, not the speed you will see.** The copy is shown in MB/s, and it lands lower. One large video is the fair test. A folder of photos is slower, because each photo has to start on its own.

| The phone's USB-C port | Ceiling | A large video often copies at |
| --- | --- | --- |
| USB 2.0 | about 50 MB/s | about 20–40 MB/s |
| 5 Gb/s | about 500 MB/s | often about 100–300 MB/s |
| 10 Gb/s | about 1,200 MB/s | higher, and still under 1,200 MB/s |
| 20 Gb/s, only if the phone says so | about 2,400 MB/s | higher, and still under 2,400 MB/s |

**Why the copy sits under that ceiling**

- Part of the rating is used by USB itself, before your file moves.
- The phone and the Mac also spend a moment agreeing on each file. That is still much faster than a Wi-Fi, Bluetooth, or File transfer copy.
- The phone's storage often cannot fill the whole connection on a long copy.

**Faster than Wi-Fi, Bluetooth, or File transfer.** Those are the usual ways to move files to a Mac, and they stop early. File transfer mode on a Mac often stays around 20–40 MB/s. DroidDock uses the USB cable through ADB (Android Debug Bridge), Google's own way for a computer to talk to an Android phone.

**The cable in the box is often the slow part.** A cable can say 60W or 100W and still be built for charging, not for fast data. Check the phone's port — USB 2.0, 5, 10, or 20 Gb/s — and use a cable marked for that same data speed. Plug the phone straight into the Mac. A cheap hub can drop the copy back to USB 2.0 speeds, about 20–40 MB/s.

## Get the app

**Homebrew**

```bash
brew tap rajivm1991/droiddock
brew install --cask droiddock
```

**Or download** the latest `.dmg` from [Releases](https://github.com/rajivm1991/DroidDock/releases/latest), and drag DroidDock into Applications. If macOS says the app is damaged, see [that note](#macos-says-droiddock-is-damaged) below.

**Then open it.** The first screen installs ADB (Android Debug Bridge), Google's USB tool, or lets you point at it. With no phone connected, the phone side shows USB debugging steps for your brand. Plug in, tap Allow, and the phone appears next to This Mac. You do this once.

**USB debugging is safe.** It does not root the phone, void the warranty, or put the phone on the internet. Turn it off later in Developer options.

**DroidDock does not collect your files.** The copy stays on the cable between the Mac and the phone.

## Features

**Device detection.** A connected phone shows up on its own, with its model name.

**File browsing.** The phone and This Mac stay open together. A pale wash marks the side your shortcuts use.

**List, Icons, and Columns.** These are the table, grid, and column views. Each side has its own. List sorts from the Name, Size, and Date headers. Cmd+1, Cmd+2, and Cmd+3 switch them.

**File preview.** On the phone, Space previews the focused file, and double-click previews a file in List or Icons. Arrow keys move to the next file. Space or Escape closes the preview.

**Folder sync.** Sync a whole folder between the Mac and the phone. Filter by pattern, skip system files, and keep timestamps. Compare by name and date, or by file content (MD5) to notice renames. Turn copy, update, rename, and delete on or off. A preview lists what will change before anything runs.

**File search.** The filter box narrows the open folder to names that contain what you type, ignoring case. Search subfolders looks through the folders inside it.

**File deletion.** Delete on the file menu or the bar above the list asks first, and critical system folders are blocked. The Delete key goes to the parent folder. On the phone, Cmd+Delete does not delete.

**Copy from the phone.** Copy a file or a whole folder to the Mac folder that is open. If the name exists, skip, replace, keep both, or ask each time. Folders can merge or be replaced.

**Copy to the phone.** The same copy, the other way. Drag between the panes, or drop a file from Finder onto the phone side. In Columns that drop has to land on the Open column. A drop on This Mac is refused. The question returns until you check Don't show again.

**Transfer queue.** Overall and per-file progress, with pause, cancel, and retry. A replace keeps the existing file until the new copy finishes.

**Multi-select.** Click, Cmd+click, and Shift+click. Cmd+A selects everything visible on the active side. Selecting one side clears the other.

**Thumbnails.** Photos and videos can show a preview in Icons, on the phone and on This Mac. With thumbnails on, Icons can zoom larger, and that size is remembered.

**Breadcrumbs.** The path uses plain names, including Internal storage, and you can click a step to go there.

**Hidden files.** Show or hide names that start with a dot, from Settings or Cmd+Shift+.

**File information.** List shows kind, size, and date.

**Storage.** The status bar has a meter for the phone and one for This Mac. A selection size adds up files.

**Actions for the selection.** When something is selected, a bar offers Copy, and on the phone also Preview, Rename, and Delete.

**Rename and new folder.** Rename one phone item from the pencil, the menu, or Cmd+Return. List edits the name in the row. Icons and Columns ask in a dialog. New folder works on either side.

**Place marks and history.** Shortcuts for common folders and your own. A shortcut hides when that folder is missing. Back and forward on each side. After you go up, the folder you left stays selected.

**USB debugging by brand.** With no phone connected, the phone side shows the steps for the brand and software you pick.

**Keyboard shortcuts.** Arrow keys, view switching, and file actions follow the active side. Cmd+/ opens the list in the app.

**Appearance.** Light, dark, or match the Mac, from the gear icon or Cmd+,. Settings also covers thumbnails, how folders open, the phone's start folder, and the tour.

**ADB setup.** DroidDock looks for ADB in the usual places. The setup screen can install it, or you can choose the `adb` program or the folder that contains it.

## Pictures

**These are the previous single window.** The app now shows the phone and This Mac together. New pictures are still to be taken.

![Download Options](docs/screenshots/folder-download-options.png)

_Recursive folder download with per-download conflict handling_

![Settings & Appearance](docs/screenshots/settings.png)

_Settings modal with Light/Dark/Sync with System appearance control_

![Folder Sync](docs/screenshots/folder-sync.png)

_Folder sync between Mac and Android with filtering options_

![Sync Preview](docs/screenshots/folder-sync-preview.png)

_Preview what will change before running the sync_

![File Preview](docs/screenshots/preview-model.png)

_Preview images directly in DroidDock with metadata panel and keyboard navigation_

![List View](docs/screenshots/list-view.png)

_Browse files in a clean, space-efficient list format_

![Grid View](docs/screenshots/image-grid-view.png)

_Visual browsing with image thumbnails_

![Keyboard Shortcuts](docs/screenshots/keyboard-shortcuts.png)

_Full keyboard navigation with a helpful reference_

## Using DroidDock

**Click a row to select it.** There are no checkboxes. Cmd+click toggles one more. Shift+click selects a range. Cmd+A selects everything visible on the active side. A selection on one side clears the other.

**Double-click a folder to open it.** Return does too. Settings can switch that to a single click. Double-click stays the default. In List or Icons, double-click a file to preview it.

**Press Space** to preview the focused file on the phone, without changing which side is active. Press Space again, or Escape, to close it. Arrow keys move through files while the preview is open.

**Go back** with the path breadcrumbs, the Back button, Cmd+[, or the Delete key. The folder you left stays selected.

**Switch views** with the List, Icons, and Columns buttons, or Cmd+1, Cmd+2, and Cmd+3, on the active side.

**Settings** (the gear, or Cmd+,) covers hidden files, thumbnails, appearance, how folders open, the phone's start folder, and the tour.

**Look for phones** reloads the phone list. Refresh on a pane reloads the folder that is open.

**Copy to the other side** from the bar above the list, the file menu, or Cmd+D. Cmd+C remembers the selection. Cmd+V on the other side pastes into the folder open there. Cmd+V on the same side does not copy. Drag between the panes. A Finder drop has to land on the phone side.

**The bar above the list** is where Copy, and on the phone Preview, Rename, and Delete, show up once something is selected.

### Search

**Filter this folder** narrows the open folder as you type. Matching ignores case.

**Search subfolders** looks through the folders inside the open one.

Escape in the filter returns to the file list.

### Select and delete

**Click, Cmd+click, and Shift+click** select, as above.

**Delete on the menu or the bar** removes the selection after you confirm. Critical system folders are blocked.

**The Delete key goes to the parent folder.** It does not remove files. On the phone, Cmd+Delete does not delete either.

**Columns.** Up and down move without opening. Right opens the highlighted folder. Left goes back one column.

**Rename one phone item** with the pencil, the menu, or Cmd+Return.

## Keyboard shortcuts

Cmd+/ opens this same list in the app. Shortcuts follow the active side.

| Shortcut | Action |
| --- | --- |
| `Cmd + F` | Focus the filter on the active side |
| `Cmd + A` | Select all visible files on the active side |
| `Cmd + 1` | List view (the table) |
| `Cmd + 2` | Icons view (the grid) |
| `Cmd + 3` | Columns view |
| `Cmd + +` / `Cmd + -` | Zoom Icons in or out. Zoom goes larger while thumbnails are on |
| `Cmd + ,` | Open settings |
| `Cmd + I` | Open folder sync |
| `Cmd + D` | Copy the selection now into the folder open on the other side |
| `Cmd + C` | Remember the selection. A tip shows Cmd+V on the other side |
| `Cmd + V` | Paste into the folder open on the other side |
| `Ctrl + Tab` | Switch the active side |
| `Cmd + [` / `Cmd + ]` | Back / forward on the active side |
| `Ctrl + Return` | Open the menu for the focused or selected item |
| `↑` `↓` while that menu is open | Move among menu items |
| `Return` while that menu is open | Run the highlighted item |
| `↑` `↓` | List: move and select. Shift adds to the selection |
| `↑` `↓` `←` `→` | Icons: move and select. Shift adds to the selection |
| `↑` `↓` | Columns: move and select without opening a folder |
| `→` / `←` | Columns: open the highlighted folder / go back one column |
| `Return` | Open the focused folder |
| `Space` | Preview the focused file on the phone, or close the preview |
| `Cmd + Return` | Rename the focused file or folder on the phone |
| `Delete` or `Backspace` | Go to the parent folder |
| `Escape` | Close the tip or menu, leave rename, close a dialog, then clear the selection. In the filter, return to the file list |
| `Cmd + T` | Toggle thumbnails |
| `Cmd + Shift + .` | Toggle hidden files |
| `Cmd + /` | Show this list |
| **While a preview is open** | |
| `Arrow keys` | Next or previous file |
| `Escape` or `Space` | Close the preview |

## Troubleshooting

### macOS says DroidDock is "damaged"

When downloading from GitHub (rather than the Mac App Store), macOS's Gatekeeper flags unsigned apps with this warning even though the app is safe. Run this once in Terminal:

```bash
xattr -cr /Applications/DroidDock.app
```

Then launch the app normally. Future releases will be code-signed to eliminate this step.

### ADB Not Found

Open DroidDock. The setup screen can install ADB, or you can choose the `adb` program or the folder that contains it.

### Device Not Showing Up

With no phone connected, the phone side shows USB debugging steps for your brand. Plug in with a data cable, unlock the phone, and tap Allow. Then use Look for phones.

### "Not Supported on This Mac" Error

DroidDock requires **macOS 10.15 (Catalina) or later** and supports both Intel and Apple Silicon Macs. If you see this error:

1. **Verify your macOS version**: Go to Apple menu > About This Mac
2. **Try the Gatekeeper workaround**: Right-click the app and choose "Open" instead of double-clicking
3. **Clear quarantine attributes**:
   ```bash
   xattr -cr /Applications/DroidDock.app
   ```
4. If the issue persists, please [open an issue](https://github.com/rajivm1991/DroidDock/issues) with your Mac model and macOS version

### Permission Errors When Browsing

- Some system directories require root access
- Try browsing user-accessible directories like `/storage/emulated/0` or `/sdcard`

### Can't Navigate Into Folders

- **Double-click** the folder row to open it (or single-click, if Settings is set that way)
- Wait for the loading indicator to finish
- Note: A single click only selects the folder — it won't open it

## Support

If you encounter any issues or have questions:

- Open an issue on [GitHub Issues](https://github.com/rajivm1991/DroidDock/issues)
- Check the [Troubleshooting](#troubleshooting) section above

### Buy Me a Coffee

DroidDock is free and open-source, made by one developer in their spare time. If it saves you time, buy me a coffee — it means a lot!

☕ **[buymeacoffee.com/rajivm1991](https://www.buymeacoffee.com/rajivm1991)**

---

## Developer Guide

Everything below is for people building, contributing to, or releasing DroidDock — not needed to just use the app.

### Prerequisites

**ADB (Android Debug Bridge)**:

```bash
brew install android-platform-tools
```

Or download manually from [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools).

DroidDock automatically checks these common ADB locations:

- `/opt/homebrew/bin/adb` (Apple Silicon Homebrew)
- `/usr/local/bin/adb` (Intel Mac Homebrew)
- `/opt/local/bin/adb` (MacPorts)
- `~/Library/Android/sdk/platform-tools/adb` (Android Studio)

**Node.js**: Version 20.19+ or 22.12+ — [nodejs.org](https://nodejs.org/)

**Rust**: [rustup.rs](https://rustup.rs/)

### Build from Source

1. Clone the repository:

   ```bash
   git clone https://github.com/rajivm1991/DroidDock.git
   cd droiddock
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run in development mode:

   ```bash
   npm run tauri dev
   ```

4. Or build for production:

   ```bash
   npm run tauri build
   ```

   The compiled app will be in `src-tauri/target/release/bundle/`.

### Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Styling**: Custom CSS with dark mode support

### Project Structure

```
droiddock/
├── src/                 # React frontend
│   ├── App.tsx          # Shell: panes, shortcuts, and overlays
│   ├── components/      # Phone pane, This Mac pane, dialogs, transfer UI
│   ├── hooks/           # Listing, copy, sync, and setup behavior
│   └── styles/          # Shared light and dark theme
├── src-tauri/           # Rust backend
│   └── src/             # adb, phone, transfer, sync, media, local, setup
└── package.json
```

### Available ADB Commands

The app implements these Tauri commands:

- `check_adb()` - Verify ADB installation
- `get_devices()` - List all connected devices
- `list_files(device_id, path)` - List files in a directory
- `delete_file(device_id, file_path, is_directory)` - Delete files and folders with safety checks
- `search_files(device_id, search_path, pattern, recursive)` - Search for files by name
- `get_thumbnail(device_id, file_path, extension, file_size)` - Generate thumbnails for images and videos
- `detect_storage_path(device_id)` - Automatically detect the primary storage path
- `get_storage_info(device_id, path)` - Get storage usage statistics for device
- `download_file(device_id, device_path, local_path)` - Download file from device to Mac
- `upload_file(device_id, local_path, device_path)` - Upload file from Mac to device
- `set_adb_path(path)` - Set custom ADB path
- `get_current_adb_path()` - Get current ADB path

### Run Development Server

```bash
npm run tauri dev
```

Changes to React files will hot-reload automatically. Changes to Rust files will trigger recompilation.

### Run Tests

```bash
# Frontend tests
npm test

# Rust tests
cd src-tauri && cargo test
```

### Preview GitHub Pages Locally

To preview the website (`docs/index.html`) locally:

```bash
# Using Python (built-in on macOS)
cd docs && python3 -m http.server 8080

# Or using npx
cd docs && npx serve
```

Then open http://localhost:8080 in your browser.

To stop the server: Press `Ctrl+C` or run `pkill -f "python3 -m http.server 8080"`

### Releases & Distribution

DroidDock uses an automated release workflow:

1. **Prepare the release** (updates versions and creates git tag):

   ```bash
   npm run release:prepare 0.2.0
   ```

2. **Push the changes and tag**:

   ```bash
   git push origin <branch-name>
   git push origin v0.2.0
   ```

3. **Automated build**: GitHub Actions will:
   - Build a universal macOS binary (Apple Silicon + Intel)
   - Create a DMG installer
   - Generate updater manifest with signature
   - Create a GitHub Release with the DMG attached

4. **Auto-update**: Users with existing installations will be notified of the update.

**Workflow details**:

- **Workflow file**: `.github/workflows/release.yml`
- **Version script**: `scripts/release-prepare.js`
- **Updater config**: `src-tauri/tauri.conf.json` (plugins.updater)
- **Signing**: Uses Tauri updater signatures (stored in GitHub Secrets)

**Code Signing (Future)**: To remove macOS security warnings, code signing requires an Apple Developer Program membership ($99/year), a code signing certificate, and a notarization workflow.

### Future Enhancements

Potential features for future releases:

- **Several phones at once** — the window shows one phone beside This Mac
- **Video playback** — Icons can show a video preview; playing the video in the window is still ahead

### Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### License

MIT License - see [LICENSE](LICENSE) file for details.

### Acknowledgments

- Built with [Tauri](https://tauri.app/) - A framework for building desktop applications with web technologies
- Icons from system emoji set
- Inspired by the need for a simple, native Android file browser on macOS

---

**Note**: DroidDock requires USB debugging to be enabled on your Android device. This app does not collect or transmit any personal data.
