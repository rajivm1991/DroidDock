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
1. Create branch from main: `git checkout -b feature/issue-description`
2. Make changes and test: `npm run build` and `cargo build`
3. Commit with issue reference: `Fixes #N`
4. Create PR: `gh pr create --title "Title" --body "Description" --reviewer rajivm1991`
5. After merge: delete branch locally and remotely, pull main

## Architecture

- **Backend:** Tauri commands in `src-tauri/src/lib.rs` with `#[tauri::command]`
- **Frontend:** React/TypeScript in `src/App.tsx`, calls backend via `invoke()` from `@tauri-apps/api/core`