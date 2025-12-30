# PR #41 Review Comments - Fix Implementation

## Overview
Address review comments from Copilot on PR #41 (file preview feature).

## Issues to Fix

### 1. CLAUDE.md - Incorrect Model Identifiers
**File**: `CLAUDE.md`
**Issue**: Using incorrect model names `github-copilot/claude-haiku-4.5` and `github-copilot/claude-sonnet-4.5`
**Fix**: Update to correct model identifiers:
- `github-copilot/claude-haiku-4.5` → `github-copilot/claude-3.5-haiku`
- `github-copilot/claude-sonnet-4.5` → `github-copilot/claude-3.5-sonnet`

### 2. src/App.tsx - Direct Set Mutation (React Anti-pattern)
**File**: `src/App.tsx`
**Location**: Line 1868-1871 in `handlePreviewNavigation`
**Issue**: Directly mutating `selectedFiles` Set before calling `setSelectedFiles`
```typescript
selectedFiles.clear();
selectedFiles.add(newFile.name);
setSelectedFiles(new Set(selectedFiles));
```
**Fix**: Create new Set without mutating existing state:
```typescript
setSelectedFiles(new Set([newFile.name]));
```

### 3. src-tauri/src/lib.rs - Production Debug Logging
**File**: `src-tauri/src/lib.rs`
**Location**: Lines 944-951 in `preview_file` function
**Issue**: `eprintln!` debug statements will clutter production logs
**Fix**: Wrap debug logging in `#[cfg(debug_assertions)]` blocks:
```rust
#[cfg(debug_assertions)]
{
    eprintln!("Preview file debug - extension param: {:?}", extension);
    eprintln!("Preview file debug - processed ext: {}", ext);
}

let is_image = is_image_extension(&ext);
let is_text = is_text_extension(&ext);

#[cfg(debug_assertions)]
{
    eprintln!(
        "Preview file debug - is_image: {}, is_text: {}",
        is_image, is_text
    );
}
```

### 4. src/App.tsx - Console.log Statements
**File**: `src/App.tsx`
**Locations**:
- Line 1746-1750 in `handlePreview`
- Line 1767 in `handlePreview` (console.log for preview result)
- Line 1776 in `handlePreview` (console.error)
- Line 1907 in `handlePreviewNavigation` (console.error)

**Issue**: Console logs should not be committed to production code
**Fix**: Remove all console.log and console.error statements related to preview debugging

### 5. src/App.tsx - Stale Closure in handlePreviewNavigation
**File**: `src/App.tsx`
**Location**: Line 1779-1913
**Issue**: `handlePreviewNavigation` function references state variables and could lead to stale closures
**Fix**: Wrap function with `useCallback` hook with proper dependencies:
```typescript
const handlePreviewNavigation = useCallback(async (key: string) => {
  // ... existing implementation
}, [selectedDevice, focusedIndex, viewMode, files, searchResults, searchMode, currentPath]);
```

Also need to wrap `handlePreview` similarly since it's referenced in keyboard handlers.

## Implementation Steps

1. **Fix CLAUDE.md**: Update model identifier strings
2. **Fix Set mutation**: Replace 3 lines with single `setSelectedFiles(new Set([newFile.name]))`
3. **Fix Rust debug logs**: Add `#[cfg(debug_assertions)]` guards around eprintln statements
4. **Remove console logs**: Delete or comment out all console.log/error in preview functions
5. **Add useCallback hooks**: Wrap `handlePreview` and `handlePreviewNavigation` with useCallback
6. **Test**: Ensure preview functionality still works after changes

## Testing
- Preview files with Space key
- Navigate preview with arrow keys
- Check console for unwanted logs
- Verify no React warnings about stale closures
- Build TypeScript: `npm run build`
- Build Rust: `cd src-tauri && cargo build`
