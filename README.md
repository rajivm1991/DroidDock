# DroidDock

A sleek macOS desktop application for browsing Android device files via ADB (Android Debug Bridge).

## Features

- **📱 Device Detection**: Automatically detects connected Android devices
- **📂 File Browsing**: Navigate through your Android device's file system with an intuitive interface
- **🔍 Hidden Files Toggle**: Show or hide dot files with a single click
- **🔄 Breadcrumb Navigation**: Easily navigate back to parent directories
- **📊 File Information**: View file permissions, sizes, and modification dates
- **🎨 Dark Mode Support**: Automatically adapts to your system theme
- **🛠️ Smart ADB Detection**: Automatically finds ADB in common installation locations
- **⚙️ Custom ADB Path**: Set a custom ADB path if it's not automatically detected

## Screenshots

> Add screenshots here

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

### Option 1: Download Release (Coming Soon)

Download the latest `.dmg` file from the [Releases](https://github.com/rajiv/droiddock/releases) page.

### Option 2: Build from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/rajiv/droiddock.git
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

### 4. Navigate Files

- **Double-click** folders to open them
- Use **breadcrumb navigation** or the **↑ Up** button to go back
- Toggle **Show Hidden** button to view dot files
- Click **Refresh** to reload the device list

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
- `set_adb_path(path)` - Set custom ADB path
- `get_current_adb_path()` - Get current ADB path

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

### Permission Errors When Browsing

- Some system directories require root access
- Try browsing user-accessible directories like `/storage/emulated/0` or `/sdcard`

### Can't Navigate Into Folders

- Make sure you're **double-clicking** (not single-clicking) on folders
- Wait for the loading indicator to finish

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

## Future Enhancements

Potential features for future releases:

- 📥 **File Download** - Pull files from device to Mac
- 📤 **File Upload** - Push files from Mac to device
- 🗑️ **File Deletion** - Delete files on device
- 🔍 **Search** - Search for files by name
- 📷 **File Preview** - Preview images and text files
- 🖼️ **Thumbnails** - Show image thumbnails in file list
- 💾 **Drag & Drop** - Drag files to/from the app
- 📱 **Multiple Devices** - View multiple devices simultaneously
- ⏱️ **File Sync** - Sync files between Mac and Android

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
- Open an issue on [GitHub Issues](https://github.com/rajiv/droiddock/issues)
- Check the [Troubleshooting](#troubleshooting) section above

---

**Note**: DroidDock requires USB debugging to be enabled on your Android device. This app does not collect or transmit any personal data.
