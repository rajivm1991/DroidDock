# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

DroidDock is a macOS desktop application for browsing Android device files via ADB (Android Debug Bridge). Built with Tauri (Rust backend) + React/TypeScript frontend.

## Development Commands

```bash
npm run tauri dev          # Run development server with hot reload
npm run build              # Build TypeScript frontend
npm run tauri build        # Build production app
cd src-tauri && cargo test # Run Rust tests
```

## Git Workflow

**Branch naming:** `fix/`, `feature/`, `hotfix/`, `refactor/` prefix with descriptive name

**Standard workflow:**
1. Create branch from main: `git checkout -b fix/issue-description`
2. Test: `cd src-tauri && cargo build && cargo test` and/or `npm run build`
3. Commit with issue reference: `Fixes #N`
4. Create PR: `gh pr create --title "Title" --body "Description" --reviewer rajivm1991`
5. After merge: delete branch locally and remotely, pull main

## Architecture

### Tauri IPC Commands

All backend commands are in `src-tauri/src/lib.rs` with `#[tauri::command]`:
- `check_adb()`, `get_devices()`, `list_files(device_id, path)`, `set_adb_path(path)`, `get_current_adb_path()`

Frontend calls via: `import { invoke } from "@tauri-apps/api/core"`

### ADB Path Resolution

Backend auto-searches common macOS ADB locations (Homebrew, MacPorts, Android Studio). Resolved path cached in global `Mutex<Option<String>>` (`ADB_PATH`). Override via `set_adb_path` command.

### File Listing Parser

`parse_ls_line()` parses `adb shell ls -la` output. **Critical:** Finds time field (contains `:`), name is everything after time (handles spaces), date/size are relative to time position. Filters `.` and `..`.

### State Management

`App.tsx` React effects chain:
- `adbAvailable` change → loads devices
- `selectedDevice` or `currentPath` change → loads files
