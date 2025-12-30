# Implementation: Arrow Key Navigation in Preview Window

## Problem
When preview window is open and user presses arrow keys:
- Currently: Arrow keys navigate the file list in the background
- Expected: Arrow keys should update the preview to show the next/previous file (like macOS Finder Quick Look)

## Current Behavior
```
1. User highlights file A, presses Space → Preview opens for file A
2. User presses ArrowDown → Preview stays on file A, focus moves to file B in background
3. User must press Escape, then Space again to preview file B
```

## Expected Behavior (macOS Finder Quick Look)
```
1. User highlights file A, presses Space → Preview opens for file A
2. User presses ArrowDown → Preview updates to show file B (and highlight moves to file B)
3. User can continue pressing arrows to navigate through file previews
4. Directories are skipped (can't preview them)
```

## Solution Design

### When preview is open AND arrow key is pressed:
1. Navigate focus to next/previous file (existing behavior)
2. Skip directories (find next previewable file)
3. Automatically trigger preview for the newly focused file
4. Update preview modal with new file content

### Key Considerations

1. **Skip directories**: If next file is a directory, keep moving until finding a file
2. **Wrap around**: When reaching end of list, optionally wrap to beginning
3. **Preview loading state**: Show "Loading..." while fetching new preview
4. **Error handling**: If preview fails, show error but keep modal open
5. **Shift+Arrow**: Should NOT trigger preview update (that's for selection)
6. **Performance**: Don't pre-load previews, load on demand

## Implementation Changes

### Location: `src/App.tsx` - handleKeyDown function

### Change Strategy

Modify the arrow key handlers to detect when `showPreview === true`:

```typescript
if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
  e.preventDefault();

  // Special handling when preview is open
  if (showPreview) {
    // Don't navigate preview with Shift key (that's for selection)
    if (e.shiftKey) {
      return; // Do nothing
    }

    // Navigate to next/previous file
    const files = getDisplayFiles();
    let nextIndex = focusedIndex;

    // Calculate next index based on key and view mode
    if (e.key === 'ArrowDown') {
      nextIndex = viewMode === 'grid' ? /* grid logic */ : (focusedIndex + 1) % files.length;
    } else if (e.key === 'ArrowUp') {
      nextIndex = viewMode === 'grid' ? /* grid logic */ : ((focusedIndex - 1) + files.length) % files.length;
    }
    // ... handle Left/Right for grid view

    // Find next previewable file (skip directories)
    let attempts = 0;
    const maxAttempts = files.length;
    while (attempts < maxAttempts && files[nextIndex].is_directory) {
      // Skip directory, move to next
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        nextIndex = (nextIndex + 1) % files.length;
      } else {
        nextIndex = ((nextIndex - 1) + files.length) % files.length;
      }
      attempts++;
    }

    // If we found a previewable file
    if (attempts < maxAttempts && !files[nextIndex].is_directory) {
      setFocusedIndex(nextIndex);

      // Update selection to new file and trigger preview
      const newFile = files[nextIndex];
      selectedFiles.clear();
      selectedFiles.add(newFile.name);
      setSelectedFiles(new Set(selectedFiles));

      // Trigger preview for new file
      handlePreview();

      // Scroll into view
      setTimeout(() => {
        const fileElement = document.querySelector(`[data-file-index="${nextIndex}"]`);
        fileElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }

    return; // Don't execute normal arrow key logic
  }

  // Normal arrow key handling when preview is closed
  // ... existing code ...
}
```

### Detailed Changes

#### 1. Add Preview Detection at Start of Arrow Handlers

Before each arrow key handler, add:

```typescript
// Special handling when preview window is open
if (showPreview && !e.shiftKey) {
  e.preventDefault();
  handlePreviewNavigation(e.key);
  return;
}
```

#### 2. Create Helper Function: `handlePreviewNavigation`

Add new function in App.tsx (around line 1620, near `handlePreview`):

```typescript
async function handlePreviewNavigation(key: string) {
  if (!selectedDevice) return;

  const files = getDisplayFiles();
  if (files.length === 0) return;

  let nextIndex = focusedIndex;

  // Calculate next index based on key and view mode
  if (viewMode === 'grid') {
    // Grid view: calculate columns for up/down navigation
    const gridContainer = document.querySelector('.files-grid');
    if (gridContainer) {
      const fileElements = Array.from(gridContainer.children);
      if (fileElements.length > 1) {
        const firstRect = fileElements[0].getBoundingClientRect();
        const secondRect = fileElements[1].getBoundingClientRect();
        const cols = firstRect.top === secondRect.top ?
          fileElements.filter((_, i) => {
            const rect = fileElements[i].getBoundingClientRect();
            return rect.top === firstRect.top;
          }).length : 1;

        if (key === 'ArrowDown') {
          nextIndex = (focusedIndex + cols) % files.length;
        } else if (key === 'ArrowUp') {
          nextIndex = ((focusedIndex - cols) + files.length) % files.length;
        } else if (key === 'ArrowRight') {
          nextIndex = (focusedIndex + 1) % files.length;
        } else if (key === 'ArrowLeft') {
          nextIndex = ((focusedIndex - 1) + files.length) % files.length;
        }
      }
    }
  } else {
    // Table/List view: simple up/down
    if (key === 'ArrowDown') {
      nextIndex = (focusedIndex + 1) % files.length;
    } else if (key === 'ArrowUp') {
      nextIndex = ((focusedIndex - 1) + files.length) % files.length;
    }
    // Left/Right don't apply in table/list view
    else {
      return;
    }
  }

  // Skip directories - find next previewable file
  let attempts = 0;
  const maxAttempts = files.length;
  const direction = (key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1;

  while (attempts < maxAttempts) {
    const file = files[nextIndex];

    // Found a previewable file
    if (!file.is_directory) {
      break;
    }

    // Skip this directory, try next
    if (direction > 0) {
      nextIndex = (nextIndex + 1) % files.length;
    } else {
      nextIndex = ((nextIndex - 1) + files.length) % files.length;
    }
    attempts++;
  }

  // Check if we found a previewable file
  if (attempts >= maxAttempts) {
    // All files are directories, close preview
    setShowPreview(false);
    setPreviewData(null);
    setError("No previewable files found");
    return;
  }

  const newFile = files[nextIndex];
  if (newFile.is_directory) {
    // Still on a directory somehow, do nothing
    return;
  }

  // Update focus
  setFocusedIndex(nextIndex);

  // Update selection to new file
  selectedFiles.clear();
  selectedFiles.add(newFile.name);
  setSelectedFiles(new Set(selectedFiles));

  // Scroll into view
  setTimeout(() => {
    const fileElement = document.querySelector(`[data-file-index="${nextIndex}"]`);
    fileElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 0);

  // Trigger preview for new file
  const fileName = newFile.name;
  const devicePath = searchMode
    ? fileName.startsWith('/')
      ? fileName
      : `/${fileName}`
    : currentPath === '/storage/emulated/0'
      ? `/storage/emulated/0/${fileName}`
      : `${currentPath}/${fileName}`;

  setPreviewFileName(fileName);
  setPreviewLoading(true);
  setPreviewData(null);

  try {
    const preview: FilePreview = await invoke("preview_file", {
      deviceId: selectedDevice,
      devicePath: devicePath,
      extension: newFile.extension,
    });

    setPreviewData(preview);

    if (preview.file_type === "unsupported") {
      setError(`Cannot preview ${newFile.extension || "this"} file type. Supported types: images (jpg, png, gif, etc.) and text files.`);
    } else {
      setError(""); // Clear any previous errors
    }
  } catch (err) {
    setError(`Failed to preview file: ${err}`);
    console.error("Preview error:", err);
  } finally {
    setPreviewLoading(false);
  }
}
```

#### 3. Modify Arrow Key Handlers

At the beginning of each arrow key handler (ArrowDown, ArrowUp, ArrowLeft, ArrowRight), add:

```typescript
else if (e.key === 'ArrowDown') {
  // Handle preview navigation first
  if (showPreview && !e.shiftKey) {
    e.preventDefault();
    handlePreviewNavigation('ArrowDown');
    return;
  }

  e.preventDefault();
  // ... rest of existing code ...
}
```

Apply same pattern to ArrowUp, ArrowLeft, ArrowRight.

#### 4. Update useEffect Dependencies

The `handleKeyDown` function references `showPreview`, so ensure it's in the dependency array:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // ... handlers ...
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [
  selectedFiles,
  searchMode,
  focusedIndex,
  viewMode,
  iconSize,
  showHiddenFiles,
  thumbnailsEnabled,
  showShortcutsHelp,
  showDeleteConfirm,
  renamingIndex,
  loading,
  columnPath,
  columnFiles,
  columnSelected,
  activeColumnIndex,
  showPreview,  // ADD THIS
  previewLoading // ADD THIS
]);
```

## Testing Checklist

- [ ] Open preview with Space on a file
- [ ] Press ArrowDown → Preview updates to next file
- [ ] Press ArrowUp → Preview updates to previous file
- [ ] In grid view, ArrowLeft/Right work
- [ ] Directories are skipped automatically
- [ ] Preview shows "Loading..." while fetching
- [ ] Error messages display if preview fails but modal stays open
- [ ] Shift+Arrow does NOT navigate preview (reserved for selection)
- [ ] Escape still closes preview
- [ ] Navigation scrolls file list in sync with preview
- [ ] Works in table view
- [ ] Works in list view
- [ ] Works in grid view
- [ ] Wraps around at end of list

## Edge Cases

1. **All remaining files are directories**: Close preview with error message
2. **Preview fails to load**: Show error but keep modal open, allow navigation
3. **Very large file list**: Performance should be acceptable
4. **Rapid arrow key presses**: Should queue properly, not break
5. **Switch view mode while preview open**: Preview should remain open
6. **Column view**: Consider whether this should work (probably not for now)

## Files Modified

- `src/App.tsx`:
  - Add `handlePreviewNavigation()` function (near line 1620)
  - Modify arrow key handlers in `handleKeyDown` (lines ~790-978)
  - Update useEffect dependencies (line ~1019)

## Future Enhancements

- Pre-load next/previous preview for faster navigation
- Keyboard shortcut to toggle preview slideshow mode
- Animation transitions between previews
- Support for video previews with arrow navigation
