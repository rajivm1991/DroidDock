# Implementation: macOS Finder-like Keyboard Behavior

## Overview
Change keyboard selection behavior to match macOS Finder:
- **Space**: Preview the currently highlighted file (instead of toggling selection)
- **Shift + Arrow**: Start checkbox selection (instead of just navigation)
- **Escape**: Close preview window if open (add to existing escape hierarchy)

## Current Behavior Analysis

### Space Key (Lines 778-789)
- Currently toggles selection checkbox on focused file
- Only works for files, not directories
- Modifies `selectedFiles` Set

### Arrow Keys (Lines 790-1010)
- Navigate through files with Up/Down/Left/Right
- Updates `focusedIndex`
- Different behavior per view mode (table/grid/column)
- Does NOT affect selection when used alone

### Escape Key (Lines 1011-1029)
- Priority-based modal/state closure
- Order: rename → shortcuts help → delete confirm → search → clear selection → clear focus
- Does NOT currently handle preview modal

### File Preview (Lines 1623-1687, 2424-2477)
- `handlePreview()` function validates and loads preview
- Modal controlled by `showPreview` state
- Close button in UI closes via `setShowPreview(false)`

## Proposed Changes

### 1. Space Key → Preview File

**Location**: `src/App.tsx` lines 778-789 (handleKeyDown function)

**Changes**:
```typescript
// OLD: Space toggles selection
else if (!isTyping && e.key === ' ') {
  e.preventDefault();
  if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
    const file = getDisplayFiles()[focusedIndex];
    if (!file.is_directory) {
      toggleFileSelection(file.name);
    }
  }
}

// NEW: Space previews file
else if (!isTyping && e.key === ' ') {
  e.preventDefault();
  if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
    const file = getDisplayFiles()[focusedIndex];
    if (!file.is_directory) {
      // Preview the focused file
      const fileName = file.name;
      selectedFiles.clear();
      selectedFiles.add(fileName);
      setSelectedFiles(new Set(selectedFiles));
      handlePreview();
    }
  }
}
```

**Notes**:
- Still only works for files (not directories)
- Temporarily sets selection to the focused file (needed for `handlePreview()`)
- `handlePreview()` validates single file selection internally

### 2. Shift + Arrow Keys → Checkbox Selection

**Location**: `src/App.tsx` lines 790-1010 (arrow key handlers)

**New State Required**:
Add near other state declarations (around line 400):
```typescript
const [shiftSelecting, setShiftSelecting] = useState<boolean>(false);
const [selectionAnchor, setSelectionAnchor] = useState<number>(-1);
```

**Changes for Each Arrow Handler**:

```typescript
// Example for ArrowDown (apply similar logic to all arrow keys)
else if (e.key === 'ArrowDown') {
  e.preventDefault();

  // If Shift is held, start checkbox selection
  if (e.shiftKey) {
    const files = getDisplayFiles();
    if (focusedIndex < 0) {
      // No focus yet, start at index 0
      setFocusedIndex(0);
      setSelectionAnchor(0);
      const file = files[0];
      if (!file.is_directory) {
        selectedFiles.add(file.name);
        setSelectedFiles(new Set(selectedFiles));
      }
    } else {
      // Move focus and select
      const nextIndex = viewMode === 'grid'
        ? ((focusedIndex + cols) % files.length)
        : ((focusedIndex + 1) % files.length);

      setFocusedIndex(nextIndex);
      const file = files[nextIndex];

      // Add to selection (don't toggle, just add)
      if (!file.is_directory) {
        selectedFiles.add(file.name);
        setSelectedFiles(new Set(selectedFiles));
      }

      // Scroll into view
      setTimeout(() => {
        const fileElement = document.querySelector(`[data-file-index="${nextIndex}"]`);
        fileElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
  } else {
    // Normal navigation (no selection change)
    // ... existing navigation code ...
  }
}
```

**Apply to**:
- ArrowDown
- ArrowUp
- ArrowLeft (in grid view)
- ArrowRight (in grid view)

**Notes**:
- Only files get selected (skip directories)
- Selection is additive when Shift is held (doesn't deselect)
- Reset `selectionAnchor` when Shift is released (handle in keyup event if needed)
- Consider adding visual feedback for shift-selection mode

### 3. Escape → Close Preview Window

**Location**: `src/App.tsx` lines 1011-1029 (Escape handler)

**Changes**:
```typescript
// OLD: Escape hierarchy
else if (e.key === 'Escape') {
  if (renamingIndex >= 0) {
    setRenamingIndex(-1);
  } else if (showShortcutsHelp) {
    setShowShortcutsHelp(false);
  } else if (showDeleteConfirm) {
    setShowDeleteConfirm(false);
  } else if (searchMode) {
    // ... search exit logic ...
  } else if (selectedFiles.size > 0) {
    // ... clear selection ...
  } else if (focusedIndex >= 0) {
    setFocusedIndex(-1);
  }
}

// NEW: Add preview close to hierarchy
else if (e.key === 'Escape') {
  if (renamingIndex >= 0) {
    setRenamingIndex(-1);
  } else if (showShortcutsHelp) {
    setShowShortcutsHelp(false);
  } else if (showDeleteConfirm) {
    setShowDeleteConfirm(false);
  } else if (showPreview) {  // NEW: Add preview check
    setShowPreview(false);
    setPreviewData(null);
  } else if (searchMode) {
    // ... search exit logic ...
  } else if (selectedFiles.size > 0) {
    // ... clear selection ...
  } else if (focusedIndex >= 0) {
    setFocusedIndex(-1);
  }
}
```

**Priority Order** (high to low):
1. Close rename input
2. Close shortcuts help
3. Close delete confirmation
4. **Close preview window** ← NEW
5. Exit search mode
6. Clear selection
7. Clear focus

### 4. Update Keyboard Shortcuts Help

**Location**: `src/App.tsx` lines 2508-2515 (shortcuts modal)

**Changes**:
```typescript
// OLD
<div className="shortcut-item">
  <span className="shortcut-keys">Space</span>
  <span className="shortcut-desc">Toggle selection on focused file</span>
</div>

// NEW
<div className="shortcut-item">
  <span className="shortcut-keys">Space</span>
  <span className="shortcut-desc">Preview focused file</span>
</div>
<div className="shortcut-item">
  <span className="shortcut-keys">Shift + Arrow</span>
  <span className="shortcut-desc">Select files while navigating</span>
</div>
<div className="shortcut-item">
  <span className="shortcut-keys">Esc</span>
  <span className="shortcut-desc">Close preview (if open)</span>
</div>
```

## Testing Checklist

- [ ] Space key previews focused file (images and text files)
- [ ] Space key does nothing on directories
- [ ] Shift + ArrowDown selects files while moving down
- [ ] Shift + ArrowUp selects files while moving up
- [ ] Shift + Arrow works in grid view (all 4 directions)
- [ ] Shift + Arrow only selects files, skips directories
- [ ] Escape closes preview window
- [ ] Escape hierarchy still works (rename > help > delete > preview > search > selection > focus)
- [ ] Keyboard shortcuts help shows updated descriptions
- [ ] Preview modal shows correct content for images
- [ ] Preview modal shows correct content for text files
- [ ] Preview modal shows error for unsupported types

## Edge Cases

1. **Shift + Arrow on directory**: Should move focus but not select
2. **Space on directory**: Should do nothing (no preview)
3. **Space when preview already open**: Should close old preview and open new one for focused file
4. **Shift + Arrow at list boundaries**: Should wrap around and continue selecting
5. **Multiple files selected, then Space**: Should clear selection and preview only the focused file

## Dependencies

- No new dependencies required
- Uses existing `handlePreview()` function
- Uses existing preview modal UI
- Uses existing file selection state (`selectedFiles` Set)

## Rollback Plan

If issues arise, revert these changes:
1. Space key → restore toggle selection behavior
2. Arrow keys → remove Shift+Arrow selection logic
3. Escape → remove preview close from hierarchy
4. Keyboard shortcuts help → restore original text
