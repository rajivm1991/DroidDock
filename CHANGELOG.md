# Changelog

All notable changes to DroidDock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2025-11-08

## [0.1.0] - 2025-11-08

### Added
- Complete distribution system with GitHub Pages landing page
- Automated DMG releases via GitHub Actions
- Auto-update functionality with Tauri updater
- Version management script for streamlined releases
- Custom app icon design (SVG source available)
- Professional website at https://rajivm1991.github.io/DroidDock/

### Changed
- Updated installation instructions for DMG releases
- Enhanced README with distribution and release information

## [0.1.0] - 2024-11-05

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

[Unreleased]: https://github.com/rajivm1991/DroidDock/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rajivm1991/DroidDock/releases/tag/v0.1.0
