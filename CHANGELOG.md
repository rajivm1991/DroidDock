# Changelog

All notable changes to DroidDock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-01-01

### Added
- **File Preview System**: View files without downloading
  - Image preview with base64 display and high-quality rendering
  - Text file preview with syntax highlighting
  - Two-column layout (image + metadata panel)
  - Dynamic modal sizing based on image orientation (portrait/landscape/square)
  - File metadata display (name, size, dimensions, aspect ratio, type)
  - Keyboard navigation in preview modal (arrow keys to browse files)
  - Space key for quick-preview without changing selection
- **Enhanced Keyboard Navigation**
  - Space key to preview files while maintaining current selection
  - Arrow key navigation within preview modal
  - Double-click to preview files (single-click for directories)
  - Improved focus management and restoration
- **"Kind" column in Table View**: Shows file type (Document, Image, Video, Audio, etc.)
- **Scrollbar in Keyboard Shortcuts Dialog**: Better usability for long shortcut lists

### Changed
- **Simplified View Modes**: Reduced from 4 to 3 view modes (Table, Grid, Column)
  - Removed List view (redundant with Table view)
  - Updated keyboard shortcuts: Cmd+1 (Table), Cmd+2 (Grid), Cmd+3 (Column)
  - Removed Cmd+4 shortcut
- **Enhanced Visual Feedback**: Stronger selection indicators (blue backgrounds + 3px left borders)
- **Compact Header Design**: Streamlined 3-line header structure
- **Improved Breadcrumb Navigation**: Better truncation for long paths
- **Gear Icon Style**: Changed from emoji (⚙️) to line drawing (⚙) for consistency

### Removed
- List view mode (streamlined to 3 essential view modes)
- Cmd+4 keyboard shortcut

### Fixed
- Focus management when navigating between directories
- Text selection in preview modal and input fields
- Preview navigation edge cases
- Arrow key navigation consistency across view modes

### Technical
- Bundle size reduction: CSS from 25.59 KB to 24.50 KB, JS from 242.92 KB to 241.41 KB
- Better TypeScript type safety for view modes
- Cleaner component architecture with removed redundant code
- Performance optimizations in preview rendering

## [0.1.0] - 2025-10-19

### Added
- Initial release of DroidDock
- Device detection and management
- File browsing with multiple view modes (Table, Grid, List, Column)
- File operations (download, upload, delete)
- Multi-select with checkboxes and keyboard shortcuts
- Image and video thumbnail generation
- File search with recursive option
- Dark mode support
- Storage usage display
- Smart ADB detection with custom path support
- Keyboard shortcuts for navigation and file operations
- Contextual action bar for selected files
- Floating upload button
- Hidden files toggle
- Breadcrumb navigation

### Technical
- Built with Tauri 2, Rust, React, and TypeScript
- Supports macOS 10.13+
- Universal binary (Apple Silicon + Intel)

---

## Release Types

### Major (X.0.0)
- Breaking changes
- Major feature overhauls
- Significant architecture changes

### Minor (0.X.0)
- New features
- Enhancements to existing features
- Non-breaking changes

### Patch (0.0.X)
- Bug fixes
- Performance improvements
- Documentation updates
- Security patches

---

## How to Update This File

When preparing a new release, update the `[Unreleased]` section with your changes:

1. List changes under appropriate categories:
   - **Added** for new features
   - **Changed** for changes in existing functionality
   - **Deprecated** for soon-to-be removed features
   - **Removed** for removed features
   - **Fixed** for bug fixes
   - **Security** for security improvements

2. Run `npm run release:prepare <version>` which will:
   - Create a new version section from `[Unreleased]`
   - Add the release date
   - Keep the `[Unreleased]` section for future changes

Example workflow:
```bash
# Add your changes to [Unreleased] section
# Then prepare the release
npm run release:prepare 0.2.0

# The script will transform:
# [Unreleased] → [Unreleased] + [0.2.0] - 2024-11-05
```

---

[Unreleased]: https://github.com/rajivm1991/DroidDock/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/rajivm1991/DroidDock/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rajivm1991/DroidDock/releases/tag/v0.1.0
