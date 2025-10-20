# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DroidDock is a macOS desktop application for browsing Android device files via ADB (Android Debug Bridge). Built with Tauri (Rust backend) + React/TypeScript frontend.

## Development Commands

### Running the Application
```bash
npm run tauri dev          # Run development server with hot reload
```

### Building
```bash
npm run build              # Build TypeScript frontend (outputs to dist/)
npm run tauri build        # Build production app (outputs to src-tauri/target/release/bundle/)
```

### Testing
```bash
npm test                   # Run frontend tests
cd src-tauri && cargo test # Run Rust backend tests
```

### TypeScript
```bash
tsc                        # Type check without building
```

## Git Workflow

### Branch Naming Convention

Follow these standard naming patterns for branches:
- `fix/description-of-bug` - For bug fixes (e.g., `fix/directory-names-with-spaces`)
- `feature/description-of-feature` - For new features (e.g., `feature/file-upload`)
- `hotfix/critical-fix` - For urgent production fixes
- `refactor/description` - For code refactoring

### Standard Development Workflow

1. **Create a feature branch from main:**
   ```bash
   git checkout main
   git checkout -b fix/issue-description
   ```

2. **Make changes and test:**
   ```bash
   # For Rust changes
   cd src-tauri && cargo build && cargo test

   # For frontend changes
   npm run build
   ```

3. **Commit with descriptive message:**
   ```bash
   git add <files>
   git commit -m "Title of change

   Detailed description of what was changed and why.

   Fixes #<issue-number>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

4. **Push and create PR:**
   ```bash
   git push -u origin fix/issue-description
   gh pr create --title "Title" --body "Description" --reviewer rajivm1991
   ```

5. **Always assign rajivm1991 as reviewer for PRs**

### Commit Message Format

- Use imperative mood in subject line (e.g., "Fix bug" not "Fixed bug")
- Reference issue numbers with `Fixes #N` or `Closes #N`
- Include detailed explanation of changes
- Add the Claude Code attribution footer

## Architecture

### Frontend-Backend Communication (Tauri IPC)

The app uses Tauri's `invoke()` API to call Rust backend commands from React frontend. All commands are defined in `src-tauri/src/lib.rs` with the `#[tauri::command]` attribute.

**Available Commands:**
- `check_adb()` - Verify ADB installation and availability
- `get_devices()` - List connected Android devices (returns `Vec<AdbDevice>`)
- `list_files(device_id: String, path: String)` - List files at path on device (returns `Vec<FileEntry>`)
- `set_adb_path(path: String)` - Set custom ADB executable path
- `get_current_adb_path()` - Get currently configured ADB path

**Frontend invocation pattern:**
```typescript
import { invoke } from "@tauri-apps/api/core";
const devices = await invoke<AdbDevice[]>("get_devices");
```

### ADB Path Resolution

The Rust backend (`lib.rs:25-74`) automatically searches for ADB in common macOS locations:
1. `/opt/homebrew/bin/adb` (Apple Silicon Homebrew)
2. `/usr/local/bin/adb` (Intel Homebrew)
3. `/opt/local/bin/adb` (MacPorts)
4. `~/Library/Android/sdk/platform-tools/adb` (Android Studio)
5. `~/Android/Sdk/platform-tools/adb` (Alternative Android Studio)

The resolved path is cached in a global `Mutex<Option<String>>` state (`ADB_PATH`). Users can override with custom paths via the `set_adb_path` command.

### File Listing Parser

The `parse_ls_line()` function (`lib.rs:145-193`) parses Android's `ls -la` output format:
```
drwxrwx--- root sdcard_rw 2025-02-01 06:31 FolderName
-rw-rw---- root sdcard_rw    4096 2025-02-01 06:31 filename.txt
```

**Parsing strategy:**
1. Finds the time field (contains `:`)
2. Name is everything after time (supports filenames with spaces)
3. Date is one position before time
4. Size is two positions before time
5. Filters out `.` and `..` entries

### State Management (Frontend)

`App.tsx` uses React hooks for state:
- `adbAvailable` - Tracks if ADB is installed/detected (null = checking, false = not found, true = available)
- `selectedDevice` - Currently selected device ID
- `currentPath` - Current directory path on device (starts at `/storage/emulated/0`)
- `files` - Current directory contents
- `showHiddenFiles` - Toggle for displaying dotfiles

**Effect dependencies:**
- ADB check triggers on mount
- Device list loads when `adbAvailable` becomes true
- File list loads when `selectedDevice` or `currentPath` changes

### Navigation

Breadcrumb navigation is implemented by splitting `currentPath` on `/` and allowing jumps to any ancestor directory. Double-clicking directories navigates deeper.

## Dependencies

### Frontend
- React 19.1.0
- TypeScript 5.8.3
- Vite 7.0.4 (build tool)
- @tauri-apps/api (IPC communication)

### Backend (Rust)
- tauri 2.x (application framework)
- tauri-plugin-shell (for executing ADB commands)
- serde/serde_json (serialization for IPC)

## Prerequisites for Users

- ADB must be installed (via Homebrew recommended: `brew install android-platform-tools`)
- Android device with USB debugging enabled
- macOS (app is currently macOS-specific)

## Future Enhancement Areas

From README.md, potential features include:
- File download/upload (pull/push)
- File deletion
- Search functionality
- File previews
- Drag & drop support
- Multi-device simultaneous viewing
