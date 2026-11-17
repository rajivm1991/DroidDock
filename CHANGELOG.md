# Changelog

All notable changes to DroidDock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Rename from the selection strip**: A pencil button beside Preview and Delete renames the one selected phone item. List edits the name in the row; Icons and Columns ask in a small dialog
- **USB debugging by brand**: When no phone is connected, the phone pane shows Brand and Software dropdowns with steps for that pair
- **Phone and This Mac together**: Both panes stay open so you can browse the phone and your Mac in one window
- **Active pane shortcuts**: The active side uses a light wash over the whole pane so `Ctrl+Tab` is obvious. `Cmd+[` / `Cmd+]` go back and forward on that side. `Ctrl+Return` opens the file menu for the selection. Arrow keys, view mode, filter focus, and parent-folder shortcuts follow the active pane
- **Columns keyboard**: Up and down move and select without opening. Right opens the highlighted folder; left goes back a column — same idea as Finder Columns
- **Return opens folders**: Return opens the focused folder. On Phone, Cmd+Return renames. Arrow keys select as they move so Cmd+C works without a mouse click. Ctrl+Return opens the menu on that same item; ↑↓ move among menu items and Return runs the highlight
- **Delete goes up**: Delete (the Mac backspace key) opens the parent folder. Cmd+↑ was removed so arrow chords stay for browsing only
- **Back keeps the folder**: After Delete, history back, or breadcrumb to a parent, the folder you left stays focused and selected on Phone and This Mac. Entering a folder clears focus/selection so a child index cannot fight that restore. Columns keep the opened folder highlighted and scrolled on mouse open, →, ←, and back/forward
- **Escape in filter**: Escape in the Phone or This Mac filter blurs the field and returns focus to the pane instead of leaving fullscreen
- **Cmd+. stays in the window**: Cmd+. no longer leaves fullscreen (that also stopped keyboard shortcuts until a click in the file list)
- **Cmd+C / Cmd+V copy**: `Cmd+C` remembers the selection on the active pane and shows a short tip above the status bar. `Cmd+V` on the other pane copies into the folder that is open there. `Cmd+D` still copies immediately
- **Copy either way**: Copy from the action strip above the list, the file menu, or `Cmd+D`. Drag between the phone pane and the This Mac pane inside DroidDock. A separate drop from Finder (the Mac's own file window) copies into the open phone folder only when it lands on the phone pane. In Columns view it has to land on the Open column. A drop on This Mac from Finder is refused. The confirm question comes back on later drops until Don't show again is checked. Selecting files on one side clears the other
- **Transfer queue**: Overall and per-file progress, with pause, cancel, and retry. Before files move, you can skip, replace, keep both, or ask for each item, and you can merge or replace matching folders
- **Quick tour**: A one-time tour of the two panes. Settings can show it again
- **Place marks**: Shortcuts for common phone and Mac folders, plus your own. A shortcut hides when that folder is missing
- **Folder history**: Back and forward on each pane. Refresh reloads the folder you have open
- **Filter and search**: On the phone and This Mac, the filter box narrows the open folder as you type, to names that contain that text. Search subfolders is a separate button that looks through the folders inside the open folder
- **Phone start folder**: Settings can open Camera, Screenshots, Downloads, or Internal storage when a phone connects
- **How folders open**: Choose single-click or double-click. Double-click stays the default
- **New folder**: Create a folder in the open phone or Mac directory
- **Phone connection setup**: If Android Debug Bridge (ADB), the tool DroidDock uses to talk to the phone, is missing, setup can download Google's platform-tools for you in one click (checked against the file Google published, no Homebrew or password needed) and show each step, or you can choose the `adb` program or the folder that contains it
- **As-is notice**: The first launch asks you to agree that DroidDock, and any install it runs, is provided as is. That screen comes before the library and before phone-tool setup, including when those tools are already installed. Later launches skip it. The install screen keeps the same agreement and starts with it checked
- **Icons on This Mac**: Photo and video files can show previews in Icons view

### Changed
- **README**: Shorter, with screenshots of the setup screen, the phone side with no phone connected, a connected phone, and a drag between the two sides. Getting the app is a short install note, because the setup screen and the empty phone pane already walk through ADB and USB debugging. Features are one-line bullets, and the shortcut table lists the main keys (Cmd+/ shows the full list in the app)
- **Icons zoom with thumbnails**: With Show Thumbnails on, Icons view can zoom past the usual largest size. Those larger steps stay within the preview image and still fit the pane. Turning thumbnails off returns Icons to that usual largest size, and turning them on again restores the larger size. The toggle and that size are remembered the next time DroidDock opens
- **Phone delete**: Cmd+Delete no longer deletes files on the phone. Delete stays on the file menu and the selection strip
- **Top bar**: The phone picker, Look for phones, Sync, and Settings stay in the top bar. Place marks and List, Icons, and Columns sit on each pane
- **List sorting**: The Name, Size, and Date column headers set the sort
- **Status bar**: Separate storage meters for the phone and This Mac. The selection size adds up files and notes when folders are left out of that total

### Fixed
- **Phone search previews**: Searching the phone in Icons no longer treats a folder as the photo being previewed (that failed with “Is a directory”). Clearing the search no longer leaves a folder, such as Android, showing that photo until Refresh
- **Rename in Columns and Icons**: Right-click Rename and Cmd+Return now work in Columns and Icons (they did nothing there). Both ask for the new name in a small dialog; List still edits in the row. In Columns the right-clicked column is the one renamed
- **Emulated crumb**: Clicking `emulated` in the phone path opens `/storage/emulated/0` instead of an adb permission error, and Back skips the unlistable folder
- **Breadcrumb clears selection**: Clicking any path crumb on Phone or This Mac clears the selection and hides the action strip; the folder you left stays highlighted but is not selected
- **Columns keep Open in view**: Arrow keys and select-only clicks no longer leave the Open column scrolled off the edge, and a drill-in scroll is no longer cancelled partway on Phone and This Mac
- **Columns after copy or delete**: Copy, delete, rename, sync, and New folder refresh Columns as well as List and Icons, so the open folder’s names stay current in every view
- **Escape in shortcut help**: Escape closes the Keyboard Shortcuts dialog without leaving fullscreen; a later Escape can still leave fullscreen when nothing is open
- **Mac privacy prompts**: Desktop, Documents, Downloads, and removable-volume explanations are part of the Mac app. A normal build includes them
- **Empty start folder**: A missing or empty start folder opens Internal storage
- **Phone disconnect**: Unplugging the phone clears the phone list. If Android Debug Bridge (ADB) is no longer available after setup, the setup screen returns
- **Folder reload**: Reloading a phone folder keeps your place in Columns view
- **Mac folder access**: When macOS blocks a folder, This Mac shows Allow access
- **Multi-select menu**: Right-clicking a selected item keeps the rest of the selection
- **Columns copy target**: Copies and drops use the open column. An empty storage folder continues into internal storage so the open folder stays usable
- **Second copy**: Starting another copy while a conflict question or scan is still open is refused, so the first copy stays in place
- **Replace and cancel**: A replace keeps the existing file until the new copy finishes, so cancel or failure leaves the original in place. Cancel also works while a transfer is still preparing

## [0.6.0] - 2026-10-02

### Added
- **Per-action sync toggles**: Choose which actions a folder sync performs — copy, update, and rename — independently. Rename is available when matching by content; a disabled rename falls back to a copy under the new name. Existing saved syncs load unchanged
- **Live sync scan progress**: Sync preview and the scan before a sync now show a scanning panel with items scanned per side, hashing progress in content mode, and elapsed time
- **Sync result breakdown**: The sync result shows per-type counts for copied, updated, renamed, and deleted items

### Changed
- **Sync dialog options**: Reworded compare-by options with hints, moved match-by out of advanced, and stacked sync direction and options at full width

### Fixed
- **Sync dialog on short windows**: The dialog now scrolls on short windows, with a sticky bordered header and footer

## [0.5.0] - 2026-07-20

### Added
- **Recursive Folder Download**: Download entire folders (not just individual files), including subfolders, with per-download conflict handling — skip duplicates, replace, or keep both
- **Folder Selection in All View Modes**: Folders can now be selected alongside files in Table, Grid, and Column view for batch operations
- **Settings Modal with Appearance Control**: Settings moved from a dropdown to a modal dialog (Cmd+, to open), with dark mode replaced by a Light / Dark / Sync with System three-way control that follows the OS theme live

### Fixed
- **Recursive listing permission errors**: Recursive folder listing now tolerates permission-denied subdirectories instead of failing the whole operation
- **Dark-mode toolbar styling**: Neutralized dark-mode toolbar colors to match native Finder grays
- **Dark-mode text contrast**: Fixed a CSS nesting bug where the global dark-mode text/background fallback silently never applied, leaving black text on several elements (settings shortcuts button, sync pattern chip buttons, download options dialog)
- **List/grid view and preview styling**: Aligned with native Finder look and feel

## [0.4.1] - 2026-02-23

### Added
- **Saved Sync Configurations**: Name and save sync setups for quick reuse — pick a saved sync from a dropdown to instantly reload its source folder, destination, direction, and filter settings without reconfiguring from scratch
- **Root `/` button in breadcrumb**: List and grid views now show a `/` button at the start of the breadcrumb for one-click access to filesystem root, matching the existing column view behavior

### Fixed
- **Internal storage button**: Breadcrumb "Internal storage" button now navigates to the device's actual detected storage root instead of always hardcoding `/storage/emulated/0`
- **Storage detection for MIUI/Android 12**: Added `/mnt/user/0/primary` as a fallback candidate path, improving detection on Xiaomi/Redmi devices
- **Inaccessible storage feedback**: When the detected internal storage path is empty or inaccessible (e.g. wrong USB mode or ADB permissions), a clear error message is now shown instead of a silent empty file list
- **Sync dialog UX**: Improved sync dialog layout and layout consistency
- **Intel Mac compatibility**: Improved Intel Mac compatibility with build verification

### Changed
- **Release Checklist**: Added explicit step to review and update `CHANGELOG.md` before each release

## [0.4.0] - 2026-02-18

### Added
- **Folder Sync**: Sync entire folders between Mac and Android device
  - Configure include/exclude patterns and preview changes before committing
  - Excludes system and metadata files automatically (`.DS_Store`, `Thumbs.db`, etc.)
  - Excludes macOS AppleDouble resource fork files (`._*`)
  - Filter by custom file patterns (include or exclude)
  - Preserves file timestamps including created timestamps
  - Per-file progress tracking
- **Device Model Name in Selector**: Device selector now shows actual model name (e.g. "Pixel 8 Pro") instead of ADB serial
- **New Keyboard Shortcuts**:
  - `Cmd+I` — open sync dialog
  - `Cmd+U` — open upload picker
  - File browser shortcuts are disabled when a modal is open

### Changed
- **UI Improvements**: Improved dark mode breadcrumb colors
- **Custom Tooltips**: Better visibility in light and dark mode
- **Consistent Filename Styling**: Unified across table, grid, and column views
- **Larger Default Window Size**

## [0.3.0] - 2026-02-13

### Added
- **Skip Duplicate Downloads**: New settings toggle to skip downloading files that already exist locally
  - Enabled by default and saved in localStorage
  - Prevents unnecessary duplicate file transfers
  - Shows skipped file count in download results
- **Homebrew Cask Installation Option**: Added install path using `brew install --cask droiddock`
  - Added to README installation instructions
  - Added to GitHub Pages website download sections

### Changed
- **Download Result Messaging**: Success and error messages now distinguish downloaded files from skipped duplicates

## [0.2.2] - 2026-01-29

### Added
- **Manual Dark Mode Toggle**: New settings option to manually switch dark mode independent of system preference
- **Homebrew Cask Support**: Initial Homebrew Cask release for easy installation via `brew install --cask droiddock`

### Fixed
- Download/upload progress and success message display
- App icon padding for macOS Cmd+Tab consistency

## [0.2.1] - 2026-01-01

### Added
- **Clickable Column Headers**: Click table column headers (Name, Size, Date) to sort
  - Click same header again to toggle sort direction (ascending ↔ descending)
  - Visual indicators show active column with arrows (↑/↓)
  - Syncs with header sort dropdown controls
- **Sort Controls in Header**: Moved sort options from settings menu to main header
  - Sort by dropdown (Name/Size/Date) always visible
  - Sort direction toggle button with arrow indicators
  - Seamless grouped control design (select + button appear as one unit)
- **Zoom Controls for Grid View**: Simplified icon size controls
  - Changed from 4 separate buttons to 2 zoom buttons (− and +)
  - Works with Cmd+/Cmd− keyboard shortcuts
  - Disabled state visual feedback (opacity 0.4) at min/max zoom
  - 4 zoom levels: small → medium → large → xlarge

### Changed
- **Minimalist UI**: Complete visual redesign with 95% grayscale aesthetic
  - Clean white backgrounds with medium gray accents (#b0b0b0)
  - Removed all blue/gold colors (except functional: red delete, green download)
  - Unicode symbols instead of emoji: ↻ (refresh), ↑ (upload), − (zoom out), + (zoom in), ⋯ (loading)
  - Consistent shadows across all controls: `0 1px 3px rgba(0, 0, 0, 0.08)`
  - Seamless grouped controls (no visible gaps between related buttons)
  - Dark mode updated with darker grayscale palette (#1a1a1a, #2a2a2a, #3a3a3a)
- **New App Icon**: Playful Android robot design
  - Friendly robot with antennae standing on dock platform
  - Floating document icons representing file management
  - Clean white-on-black minimalist design
- **Improved Table View Date Column**
  - Width increased from 140px to 180px (fully visible dates)
  - Monospace font for better alignment and readability
  - Font: 'SF Mono', 'Menlo', 'Monaco', 'Courier New'
  - Letter spacing: 0.3px for improved scanning
- **Header Layout Improvements**
  - Better control grouping and spacing
  - Sort controls prominently displayed (no longer hidden in settings)
  - Consistent button sizing (32px height)

### Fixed
- TypeScript error: Unused 'searching' variable marked with underscore prefix
- Date truncation in table view (now fully visible)
- Icon size button confusion (simplified to zoom metaphor)

### Technical
- Icon file sizes reduced (icon.icns: 195 KB → 117 KB, icon.ico: 83 KB)
- Cleaner CSS with consistent design tokens
- Better control component reusability

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
- Supports macOS 10.15+ (Catalina)
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

[Unreleased]: https://github.com/rajivm1991/DroidDock/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/rajivm1991/DroidDock/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/rajivm1991/DroidDock/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/rajivm1991/DroidDock/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/rajivm1991/DroidDock/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rajivm1991/DroidDock/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/rajivm1991/DroidDock/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/rajivm1991/DroidDock/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/rajivm1991/DroidDock/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rajivm1991/DroidDock/releases/tag/v0.1.0
