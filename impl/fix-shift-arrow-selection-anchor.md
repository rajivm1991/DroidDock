# Fix: Shift+Arrow Selection Should Include Starting File

## Problem
When a file is highlighted and user presses Shift+Arrow:
- Selection starts from the NEXT file (2nd file)
- The currently highlighted file (1st file) is NOT selected
- Expected: The anchor file (where highlight was) should be included in selection

## Current Behavior
```
User has file at index 0 highlighted
User presses Shift+Down
Result: File at index 1 is selected, but index 0 is NOT
```

## Expected Behavior (macOS Finder)
```
User has file at index 0 highlighted
User presses Shift+Down
Result: BOTH file at index 0 AND index 1 are selected
```

## Root Cause Analysis

In the current implementation (lines ~908-978 in App.tsx), when Shift+Arrow is pressed:
1. It calculates the NEXT index
2. It selects the file at the NEXT index
3. It does NOT select the file at the CURRENT index (anchor)

The anchor file needs to be selected when starting a shift-selection.

## Solution

When Shift+Arrow is pressed for the first time (or when starting a new shift-selection):
1. Check if the currently focused file is already selected
2. If NOT selected, add the anchor file to selection
3. THEN move to next index and add that file too

## Implementation Changes

### Location: `src/App.tsx` - Arrow Key Handlers (around lines 908-978)

### Change Strategy

For each arrow key handler (ArrowDown, ArrowUp, ArrowLeft, ArrowRight), when `e.shiftKey` is true:

**Before moving to next index:**
```typescript
// Add anchor file to selection if not already selected
if (focusedIndex >= 0) {
  const currentFile = files[focusedIndex];
  if (!currentFile.is_directory && !selectedFiles.has(currentFile.name)) {
    selectedFiles.add(currentFile.name);
  }
}
```

**Then proceed with navigation:**
```typescript
// Calculate next index
const nextIndex = ...;

// Add next file to selection
const nextFile = files[nextIndex];
if (!nextFile.is_directory) {
  selectedFiles.add(nextFile.name);
}

// Update state
setSelectedFiles(new Set(selectedFiles));
setFocusedIndex(nextIndex);
```

### Specific Changes Required

#### 1. ArrowDown with Shift (Table/List View)
```typescript
else if (e.key === 'ArrowDown') {
  e.preventDefault();

  if (e.shiftKey) {
    const files = getDisplayFiles();

    if (focusedIndex < 0) {
      // No focus yet, start at index 0
      setFocusedIndex(0);
      const file = files[0];
      if (!file.is_directory) {
        selectedFiles.add(file.name);
        setSelectedFiles(new Set(selectedFiles));
      }
    } else {
      // First, select the anchor file if not already selected
      const currentFile = files[focusedIndex];
      if (!currentFile.is_directory && !selectedFiles.has(currentFile.name)) {
        selectedFiles.add(currentFile.name);
      }

      // Then move to next and select it
      const nextIndex = (focusedIndex + 1) % files.length;
      setFocusedIndex(nextIndex);

      const nextFile = files[nextIndex];
      if (!nextFile.is_directory) {
        selectedFiles.add(nextFile.name);
      }

      setSelectedFiles(new Set(selectedFiles));

      // Scroll into view
      setTimeout(() => {
        const fileElement = document.querySelector(`[data-file-index="${nextIndex}"]`);
        fileElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
  } else {
    // ... existing non-shift navigation ...
  }
}
```

#### 2. ArrowUp with Shift (Table/List View)
Apply same logic:
1. Select anchor file if not selected
2. Move to previous index
3. Select previous file

#### 3. ArrowDown with Shift (Grid View)
Same pattern but calculate next index using grid columns:
```typescript
const nextIndex = (focusedIndex + cols) % files.length;
```

#### 4. ArrowUp with Shift (Grid View)
Same pattern but calculate previous index using grid columns:
```typescript
const nextIndex = ((focusedIndex - cols) + files.length) % files.length;
```

#### 5. ArrowLeft with Shift (Grid View)
Same pattern, move left by 1:
```typescript
const nextIndex = ((focusedIndex - 1) + files.length) % files.length;
```

#### 6. ArrowRight with Shift (Grid View)
Same pattern, move right by 1:
```typescript
const nextIndex = (focusedIndex + 1) % files.length;
```

## Testing Checklist

- [ ] Highlight file at index 0, press Shift+Down → Both index 0 and 1 selected
- [ ] Highlight file at index 2, press Shift+Up → Both index 2 and 1 selected
- [ ] Continue holding Shift and pressing arrows → All files in range selected
- [ ] Works in table view
- [ ] Works in list view
- [ ] Works in grid view (all 4 directions)
- [ ] Skips directories (only selects files)
- [ ] If anchor is a directory, it's skipped but next file is selected
- [ ] Release Shift, press arrow → Normal navigation (no selection)
- [ ] Start new shift-selection from different anchor → Works correctly

## Edge Cases

1. **Anchor is a directory**: Don't select it, but select next file when moving
2. **All items between anchor and target are directories**: No selection happens
3. **Anchor already selected**: Don't duplicate, just continue selecting forward/backward
4. **Wrap-around at list boundaries**: Continue selecting after wrapping

## Files Modified

- `src/App.tsx` - Arrow key handlers in handleKeyDown function (lines ~908-978)
