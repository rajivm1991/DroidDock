# DroidDock v0.2.0 - Enhanced Preview & Navigation

**Release Date**: January 1, 2026  
**Download**: [DroidDock-0.2.0-universal.dmg](https://github.com/rajivm1991/DroidDock/releases/tag/v0.2.0)

---

## 🎉 What's New

### File Preview System
View your files directly in DroidDock without downloading them first!

- **Image Preview**: High-quality image display with dynamic modal sizing
  - Portrait images get a taller, narrower modal
  - Landscape images get a wider, shorter modal
  - Square images get a balanced modal size
- **Text File Preview**: Read text files inline with proper formatting
- **Metadata Panel**: See file information at a glance
  - File name, size, and type
  - Image dimensions and aspect ratio
  - File orientation (portrait/landscape/square)
- **Keyboard Navigation**: Browse through files using arrow keys while in preview
- **Quick Preview**: Press **Space** to preview without changing your selection

### Streamlined Interface
Making DroidDock simpler and more intuitive!

- **3 View Modes**: Simplified from 4 to 3 essential views
  - **Table View** (Cmd+1): Traditional list with columns
  - **Grid View** (Cmd+2): Thumbnail grid for visual browsing
  - **Column View** (Cmd+3): macOS Finder-style Miller columns
- **No More Checkboxes**: Cleaner interface - just click rows to select
- **Enhanced Selection**: Stronger visual feedback with blue backgrounds and 3px borders
- **Compact Header**: More screen space for your files with streamlined 3-line header
- **Updated Icons**: Consistent line-drawing style throughout the app

### Better Navigation Experience
Navigate files like a pro!

- **Double-Click Preview**: Double-click files to preview, single-click for folders
- **Arrow Key Preview**: Navigate between files while in preview mode
- **Improved Focus**: Better keyboard focus management when browsing
- **Kind Column**: Table view now shows file types (Image, Video, Document, etc.)

---

## 📋 Detailed Changes

### ✨ Added
- File preview system with image and text file support
- Two-column preview layout (image + metadata panel)
- Dynamic modal sizing based on image orientation
- File metadata display in preview (dimensions, size, type)
- Keyboard navigation in preview modal (arrow keys)
- Space key for quick-preview functionality
- "Kind" column in table view showing file types
- Scrollbar in keyboard shortcuts dialog for better usability

### 🔄 Changed
- Simplified view modes from 4 to 3 (removed List view)
- Updated keyboard shortcuts: Cmd+3 now opens Column view (was Cmd+4)
- Removed checkboxes - click rows to select files
- Enhanced selection visual feedback
- More compact header design (3-line structure)
- Improved breadcrumb navigation with better truncation
- Gear icon changed from emoji (⚙️) to line drawing (⚙) for consistency

### 🗑️ Removed
- List view mode (replaced by improved Table view)
- Cmd+4 keyboard shortcut
- File checkboxes in table and grid views

### 🐛 Fixed
- Focus management when navigating between directories
- Text selection in preview modal and input fields
- Preview navigation edge cases
- Arrow key navigation consistency across all view modes

### ⚡ Performance
- Bundle size reduced: CSS from 25.59 KB to 24.50 KB
- JavaScript bundle: 241.41 KB (down from 242.92 KB)
- Better TypeScript type safety
- Cleaner component architecture with removed redundant code

---

## 📦 Installation

### New Users

1. **Download**: Get [DroidDock-0.2.0-universal.dmg](https://github.com/rajivm1991/DroidDock/releases/tag/v0.2.0)
2. **Install**: Open the DMG and drag DroidDock to Applications
3. **Launch**: Right-click the app → Open (first time only, due to unsigned app)

**Requirements**:
- macOS 10.13 or later
- Universal binary (works on both Intel and Apple Silicon Macs)
- ADB (Android Debug Bridge) installed

### Existing Users

If you're using v0.1.0, DroidDock will automatically notify you of this update. You can also:
- Download the new DMG manually
- Replace your existing installation

---

## 📸 Screenshots

### File Preview in Action
![File Preview](screenshots/droiddock-2026-01-01-file-preview.png)
*Preview images with metadata panel showing dimensions, size, and file information*

### Table View with Kind Column
![Table View](screenshots/droiddock-2026-01-01-table-view-with-kind-column.png)
*New Kind column shows file types at a glance - Image, Video, Document, and more*

---

## 🎯 How to Use New Features

### Previewing Files

**Method 1: Double-Click**
- Double-click any file to open preview
- Double-click folders to open them (unchanged)

**Method 2: Space Key** (Quick Preview)
- Navigate to a file using arrow keys
- Press **Space** to preview without changing selection
- Press **Space** again to close

**Method 3: From Grid View**
- Double-click any file thumbnail in grid view

### Navigating in Preview
- Use **Arrow Keys** (←↑→↓) to browse between files
- Press **Escape** or **Space** to close preview
- Preview automatically skips folders

### Using the New View Modes
- **Cmd+1**: Switch to Table view (shows Kind, Size, Date columns)
- **Cmd+2**: Switch to Grid view (thumbnail gallery)
- **Cmd+3**: Switch to Column view (Miller columns)

### Selecting Files (No More Checkboxes!)
- **Click** any row to select a file
- **Cmd+Click** to select multiple files
- **Shift+Click** to select a range
- Notice the strong blue highlight with left border

---

## 🔧 Technical Details

### What's Under the Hood
- Improved TypeScript type definitions for better code safety
- Refactored preview system with reusable components
- Optimized CSS with removed redundant styles
- Better focus management system
- Enhanced keyboard event handling

### For Developers
- Preview data structure now includes orientation metadata
- View mode type simplified: `'table' | 'grid' | 'column'`
- Removed ListItem component and related code
- Added `getFileKind()` helper function for file type detection

---

## ⌨️ Updated Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd + 1` | Table view |
| `Cmd + 2` | Grid view |
| `Cmd + 3` | Column view *(changed from Cmd+4)* |
| `Space` | Quick-preview / Close preview *(changed from toggle selection)* |
| `Arrow Keys` | Navigate files (+ navigate in preview) |
| `Enter` | Open folder / Execute search |
| `Escape` | Close preview / Clear selection |

---

## 🙏 Thank You!

Thank you to everyone who's been using DroidDock! This release brings significant improvements to the file browsing experience based on real-world usage.

Special thanks to:
- GitHub Copilot for code review assistance
- The Tauri community for the excellent framework
- All users who provided feedback

---

## 📝 Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete technical details.

---

## 🐛 Known Issues

None currently! If you encounter any issues, please [report them on GitHub](https://github.com/rajivm1991/DroidDock/issues).

---

## 🔜 What's Next?

Looking ahead to v0.3.0 and beyond:
- Video file preview support
- Drag & drop file transfers
- Multiple device support
- Folder upload/download
- Copy/paste operations

Stay tuned!

---

**Links**:
- 🌐 [DroidDock Website](https://rajivm1991.github.io/DroidDock/)
- 📦 [Download Latest Release](https://github.com/rajivm1991/DroidDock/releases/latest)
- 🐙 [GitHub Repository](https://github.com/rajivm1991/DroidDock)
- 📖 [Full Documentation](README.md)
