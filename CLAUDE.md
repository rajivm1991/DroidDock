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

1. **ALWAYS create a new branch from main when starting work on a fresh GitHub issue**: `git checkout main && git pull && git checkout -b feature/issue-description`
2. Make changes and test: `npm run build` and `cargo build`
3. Commit with issue reference: `Fixes #N`
4. Create PR: `gh pr create --title "Title" --body "Description" --reviewer rajivm1991`
5. After merge: delete branch locally and remotely, pull main

## Architecture

- **Backend:** Tauri commands in `src-tauri/src/lib.rs` with `#[tauri::command]`
- **Frontend:** React/TypeScript in `src/App.tsx`, calls backend via `invoke()` from `@tauri-apps/api/core`

## Implementation Workflow

**Note on impl/ directory:**

- Implementation documents in `impl/` are **local-only planning files** and are not committed to git (added to `.gitignore`)
- They serve as temporary planning artifacts during development
- Important architectural decisions should be documented in commit messages, PR descriptions, or permanent documentation files

## Release Checklist

Follow every step in order for each release.

### 1. Prepare versions

```bash
npm run release:prepare <version>
```

This bumps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and moves the `[Unreleased]` section in `CHANGELOG.md`.

### 2. Update CHANGELOG.md

- Ensure the `[Unreleased]` section has been moved to a versioned section (e.g., `## [X.Y.Z] - YYYY-MM-DD`) by `release:prepare`
- Review the new versioned section and make sure all notable changes are listed under the correct categories (`Added`, `Changed`, `Fixed`, `Removed`, etc.)
- Add any missing entries for changes made since the last release

### 3. Ask about screenshots

**Always ask the user:** "Do you have new screenshots to include for this release?"

- If yes: add PNGs to `docs/screenshots/` (naming: `droiddock-YYYY-MM-DD-<feature>.png`)
- Update `README.md` screenshot references
- Update `docs/index.html` screenshot section

### 4. Update README.md

- Add new features to the Features section
- Update keyboard shortcuts table if changed
- Update screenshot references
- Update version references if any

### 5. Update GitHub Pages (`docs/`)

Two files to update:

- **Create** `docs/releases/vX.Y.Z.html` — release notes page for the new version (follow the pattern of existing files like `docs/releases/v0.4.0.html`)
- **Update** `docs/index.html` — bump the hero version text (`Version X.Y.Z`), add new release card in the release notes section, link to new release HTML, update screenshots section if needed

### 6. Commit, tag, push

```bash
git add -A
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The tag push triggers the GitHub Actions release workflow automatically.

### 7. Verify CI

- Watch the Release workflow at GitHub Actions
- Confirm all 3 jobs pass: `create-release`, `build-tauri`, `publish-release`
- Confirm `universal.dmg` + `.tar.gz` assets are attached to the release

### 8. Update Homebrew cask

File: `homebrew-droiddock/Casks/droiddock.rb`

- Download the new `universal.dmg` asset and compute sha256: `shasum -a 256 DroidDock_X.Y.Z_universal.dmg`
- Update `version`, `sha256`, and `url` (use `universal.dmg`, not `aarch64.dmg`)
- Cask URL pattern: `https://github.com/rajivm1991/DroidDock/releases/download/v#{version}/DroidDock_#{version}_universal.dmg`
- Commit and push the homebrew-droiddock repo

### Verification

```bash
gh release view vX.Y.Z          # confirm assets and release notes
brew update && brew upgrade --cask droiddock  # confirm Homebrew installs new version
```

Also visit the GitHub Pages site to confirm new version and release notes appear.
