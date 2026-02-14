# DroidDock

A sleek macOS desktop application for browsing Android device files via ADB (Android Debug Bridge).

🌐 **[Visit DroidDock Website](https://rajivm1991.github.io/DroidDock/)** | 📦 **[Download Latest Release](https://github.com/rajivm1991/DroidDock/releases/latest)**

## Features

- **📱 Device Detection**: Automatically detects connected Android devices and shows their model name
- **📂 File Browsing**: Navigate through your Android device's file system with an intuitive interface
- **👁️ Multiple View Modes**: Choose between Table, Grid, or Column (Miller) view with keyboard shortcuts
- **🖼️ File Preview**: View images and text files without downloading - press Space for quick preview or double-click
- **🔁 Folder Sync**: Sync entire folders between Mac and Android — filter by file pattern, exclude system files, preserve timestamps
- **🔍 File Search**: Search for files by name with case-insensitive matching and recursive search
- **🗑️ File Deletion**: Delete files and folders with confirmation dialogs and safety checks
- **📥 File Download**: Download files from device to Mac with save dialog
- **📤 File Upload**: Upload files from Mac to device via floating action button
- **✅ Multi-Select**: Select multiple files with click, Ctrl/Cmd+click, and Shift+click range selection
- **🖼️ Thumbnails**: Automatic thumbnail generation for images and videos with lazy loading
- **🏠 Smart Breadcrumbs**: Clean navigation with "Internal storage" labels and arrow separators
- **👁️ Hidden Files Toggle**: Show or hide dot files with a single click
- **📊 File Information**: View file types, permissions, sizes, and modification dates
- **💾 Storage Info**: Real-time storage usage display in VSCode-style status bar
- **🎯 Contextual Actions**: File actions (download/delete) appear in a slide-up bar when files are selected
- **⌨️ Keyboard Shortcuts**: Full keyboard navigation with arrow keys, view switching, and file operations
- **🎨 Dark Mode Support**: Beautiful dark mode with muted, cohesive color palette
- **🛠️ Smart ADB Detection**: Automatically finds ADB in common installation locations
- **⚙️ Custom ADB Path**: Set a custom ADB path if it's not automatically detected

## Screenshots

![Folder Sync](docs/screenshots/droiddock-2026-02-15-folder-sync.png)

_Folder sync between Mac and Android with filtering options_

![Sync Preview](docs/screenshots/droiddock-2026-02-15-sync-preview.png)

_Preview what will change before running the sync_

![File Preview](docs/screenshots/droiddock-2026-01-01-preview-model.png)

_Preview images directly in DroidDock with metadata panel and keyboard navigation_

## Prerequisites

Before running DroidDock, you need to have:

### 1. ADB (Android Debug Bridge)

**Install via Homebrew (Recommended)**:

```bash
brew install android-platform-tools
```

**Or download manually**:

- Download from: [Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)

DroidDock automatically checks these common ADB locations:

- `/opt/homebrew/bin/adb` (Apple Silicon Homebrew)
- `/usr/local/bin/adb` (Intel Mac Homebrew)
- `/opt/local/bin/adb` (MacPorts)
- `~/Library/Android/sdk/platform-tools/adb` (Android Studio)

### 2. Node.js (for development)

- **Version**: 20.19+ or 22.12+
- Download from: https://nodejs.org/

### 3. Rust (for development)

- Install from: https://rustup.rs/

## Installation

### Option 1: Install via Homebrew Cask (Recommended)

```bash
# Tap the custom repository
brew tap rajivm1991/droiddock

# Install DroidDock
brew install --cask droiddock
```

By default, the app will be installed to your Applications folder (or to the appdir you've configured for Homebrew Cask) and can be updated with:

```bash
brew upgrade --cask droiddock
```

### Alternative: Download Pre-built App

1. **Download**: Get the latest `.dmg` file from the [Releases](https://github.com/rajivm1991/DroidDock/releases/latest) page or [DroidDock website](https://rajivm1991.github.io/DroidDock/).

2. **Install**: Open the DMG and drag DroidDock to your Applications folder.

3. **Launch**:

    > ⚠️ **macOS Security Notice**: When downloading from GitHub, macOS may show a warning that DroidDock is "damaged" and can't be opened. This is due to Apple's Gatekeeper security for unsigned apps. The app is safe to use.

    **To fix this, run this command in Terminal:**

    ```bash
    xattr -cr /Applications/DroidDock.app
    ```

    Then launch the app normally.

    This only needs to be done once. Future releases will be code-signed to eliminate this step.

4. **Auto-Updates**: DroidDock will automatically check for updates on launch and notify you when new versions are available.

### Option 2: Build from Source

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

## Usage

### 1. Connect Your Android Device

Enable USB debugging on your Android device:

1. Go to **Settings** → **About Phone**
2. Tap **Build Number** 7 times to enable Developer Options
3. Go to **Settings** → **Developer Options**
4. Enable **USB Debugging**
5. Connect your device via USB

### 2. Verify ADB Connection

```bash
adb devices
```

You should see your device listed.

### 3. Launch DroidDock

- The app will automatically detect your device
- Select it from the dropdown menu
- Browse files starting from `/storage/emulated/0` (main storage)

### 4. Navigate & Manage Files

- **Single-click** folder names to open them
- **Double-click** files to preview them (images, text files)
- **Press Space** to quick-preview the focused file without changing selection
- Use **breadcrumb navigation** or the **↑ Up** button to go back
- **Switch Views**: Use view toggle buttons or keyboard shortcuts (Cmd+1/2/3) to switch between Table, Grid, or Column view
- Toggle **Show Hidden Files** in settings to view dot files
- Toggle **Show Thumbnails** in settings to enable/disable image and video previews
- Click **Refresh** to reload the device list
- **Upload Files**: Click the floating action button (bottom-right) to upload files to current directory
- **File Actions**: Select files to reveal the contextual action bar with Download and Delete options

### 5. Search for Files

- Type in the **search bar** to find files by name (case-insensitive)
- Check **All subdirectories** to search recursively through all folders
- Click **Search** or press Enter to execute the search
- Search results show full file paths
- Click **Clear** to exit search mode

### 6. Select & Delete Files

- **Click row** to select files (no more checkboxes!)
- **Ctrl/Cmd + Click**: Toggle individual files for multi-select
- **Shift + Click**: Select a range of files between two clicks
- **Ctrl/Cmd + A**: Select all visible files
- Press **Delete** or **Backspace** key to delete selected files
- Confirm deletion in the dialog that appears
- The app prevents deletion of critical system directories

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Styling**: Custom CSS with dark mode support

## Project Structure

```
droiddock/
├── src/                 # React frontend
│   ├── App.tsx         # Main application component
│   ├── App.css         # Styles
│   └── main.tsx        # Entry point
├── src-tauri/          # Rust backend
│   ├── src/
│   │   ├── lib.rs      # ADB commands and core logic
│   │   └── main.rs     # Application entry point
│   ├── Cargo.toml      # Rust dependencies
│   └── tauri.conf.json # Tauri configuration
└── package.json        # Node.js dependencies
```

## Available ADB Commands

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

## Keyboard Shortcuts

DroidDock supports these keyboard shortcuts for faster navigation and file management:

| Shortcut                | Action                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `Ctrl/Cmd + F`          | Focus search bar                                                  |
| `Ctrl/Cmd + A`          | Select all visible files                                          |
| `Ctrl/Cmd + 1`          | Switch to Table view                                              |
| `Ctrl/Cmd + 2`          | Switch to Grid view                                               |
| `Ctrl/Cmd + 3`          | Switch to Column view                                             |
| `Ctrl/Cmd + =/-`        | Zoom in/out (Grid view only)                                      |
| `Cmd + I`               | Open folder sync dialog                                           |
| `Cmd + U`               | Open upload file picker                                           |
| `Arrow Keys`            | Navigate between files (Up/Down in table, all directions in grid) |
| `Space`                 | Quick-preview focused file (or close preview)                     |
| `Enter`                 | Open focused folder or execute search                             |
| `Delete` or `Backspace` | Delete selected files (shows confirmation dialog)                 |
| `Escape`                | Clear selection or close dialogs                                  |
| **In Preview Mode**     |                                                                   |
| `Arrow Keys`            | Navigate to next/previous file                                    |
| `Escape` or `Space`     | Close preview                                                     |

## Troubleshooting

### ADB Not Found

If the app can't find ADB:

1. **Install ADB** via Homebrew:

    ```bash
    brew install android-platform-tools
    ```

2. **Or set a custom path**:
    - The app will show a setup screen
    - Enter the full path to your ADB executable (e.g., `/opt/homebrew/bin/adb`)
    - Click "Set Path"

### Device Not Showing Up

- Ensure USB debugging is enabled on your device
- Check if device is recognized: `adb devices`
- Try clicking the "Refresh" button in the app
- You may need to accept the debugging authorization prompt on your device

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

- **Single-click** on the folder name (the blue text) to open it
- Wait for the loading indicator to finish
- Note: Clicking elsewhere on the row selects the folder instead of opening it

## Development

### Run Development Server

```bash
npm run tauri dev
```

Changes to React files will hot-reload automatically. Changes to Rust files will trigger recompilation.

### Build Production App

```bash
npm run tauri build
```

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

## Releases & Distribution

### Creating a New Release

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

### Release Workflow Details

- **Workflow file**: `.github/workflows/release.yml`
- **Version script**: `scripts/release-prepare.js`
- **Updater config**: `src-tauri/tauri.conf.json` (plugins.updater)
- **Signing**: Uses Tauri updater signatures (stored in GitHub Secrets)

### Code Signing (Future)

To remove macOS security warnings, code signing requires:

- Apple Developer Program membership ($99/year)
- Code signing certificate
- Notarization workflow

## Future Enhancements

Potential features for future releases:

- 💾 **Drag & Drop** - Drag files to/from the app
- 📱 **Multiple Devices** - View multiple devices simultaneously
- 📊 **Sortable Columns** - Sort files by name, size, date, etc.
- 🎬 **Video Preview** - Preview video files in-app
- 🔄 **Two-Way Sync** - Bidirectional sync with conflict resolution

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app/) - A framework for building desktop applications with web technologies
- Icons from system emoji set
- Inspired by the need for a simple, native Android file browser on macOS

## Support

If you encounter any issues or have questions:

- Open an issue on [GitHub Issues](https://github.com/rajivm1991/DroidDock/issues)
- Check the [Troubleshooting](#troubleshooting) section above

---

**Note**: DroidDock requires USB debugging to be enabled on your Android device. This app does not collect or transmit any personal data.
