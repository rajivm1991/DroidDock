# Fix JPG File Preview "Unsupported" Error

## Problem Statement
File preview is showing "Cannot preview jpg file type" error even though JPG is listed as a supported image format. This suggests the file extension detection or matching logic is failing.

## Root Cause Analysis

The issue likely stems from one of these areas:

1. **Extension Detection in Frontend**: The `extension` field may not be properly set or formatted when passed to the backend
2. **Extension Matching Logic**: The backend `is_image_extension()` function may not be matching due to:
   - Case sensitivity issues (JPG vs jpg)
   - Dot prefix handling (`.jpg` vs `jpg`)
   - Missing extension in the match list

3. **File Type Logic**: The backend may be returning `unsupported` before checking image/text types

## Investigation Steps

1. **Check Frontend Extension Passing**:
   - Verify `file.extension` value in `handlePreview()` function
   - Check if extension includes dot prefix
   - Confirm extension is being passed to `invoke("preview_file")`

2. **Check Backend Extension Processing**:
   - Review `preview_file()` command in `src-tauri/src/lib.rs`
   - Verify the extension stripping logic: `.strip_prefix(".")`
   - Check `to_lowercase()` conversion
   - Confirm `is_image_extension()` includes `"jpg"` and `"jpeg"`

3. **Add Debugging**:
   - Log the extension value at multiple points
   - Log the result of `is_image_extension()` and `is_text_extension()`

## Implementation Plan

### Step 1: Add Debugging to Frontend (src/App.tsx)

In the `handlePreview()` function, add console logging:

```typescript
async function handlePreview() {
  // ... existing code ...

  console.log("File preview debug:", {
    fileName: file.name,
    extension: file.extension,
    devicePath: devicePath
  });

  try {
    const preview: FilePreview = await invoke("preview_file", {
      deviceId: selectedDevice,
      devicePath: devicePath,
      extension: file.extension,
    });

    console.log("Preview result:", preview);
    // ... rest of code ...
  }
}
```

### Step 2: Fix Backend Extension Processing (src-tauri/src/lib.rs)

Review and enhance the extension processing logic in `preview_file()`:

```rust
// Current code around line 920-930
let ext = extension
    .as_ref()
    .and_then(|e| e.strip_prefix("."))
    .unwrap_or("")
    .to_lowercase();

// Add debug logging
eprintln!("Preview file debug - extension param: {:?}", extension);
eprintln!("Preview file debug - processed ext: {}", ext);

let is_image = is_image_extension(&ext);
let is_text = is_text_extension(&ext);

eprintln!("Preview file debug - is_image: {}, is_text: {}", is_image, is_text);
```

### Step 3: Verify is_image_extension() Function

Ensure the function includes both "jpg" and "jpeg":

```rust
fn is_image_extension(ext: &str) -> bool {
    matches!(
        ext,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "svg" | "ico"
    )
}
```

### Step 4: Handle Edge Cases

Consider these scenarios:
- Extension might be `None` for some files
- Extension might already be lowercase or uppercase
- Extension might or might not have a dot prefix

Update the extension processing to be more robust:

```rust
let ext = extension
    .as_ref()
    .map(|e| {
        let trimmed = e.trim();
        if trimmed.starts_with('.') {
            &trimmed[1..]
        } else {
            trimmed
        }
    })
    .unwrap_or("")
    .to_lowercase();
```

### Step 5: Test Scenarios

After implementing fixes, test:
1. ✅ JPG files (uppercase and lowercase)
2. ✅ JPEG files
3. ✅ PNG files
4. ✅ Files with and without dot prefix in extension
5. ✅ Files with no extension
6. ✅ Text files (TXT, JSON, MD)

## Expected Outcome

After the fix:
- JPG/JPEG files should preview correctly with base64-encoded image display
- Extension matching should be case-insensitive
- Debug logs should help identify any remaining edge cases
- Error message should only appear for truly unsupported file types

## Files to Modify

1. `src/App.tsx` - Add debug logging to `handlePreview()`
2. `src-tauri/src/lib.rs` - Fix extension processing in `preview_file()` and verify `is_image_extension()`

## Testing Commands

```bash
# Build and run with debug output visible
npm run tauri dev

# Check Rust logs in terminal
# Try previewing various image files
# Check browser console for frontend logs
```
