# Fix: Preview Fails for Files with Spaces in Path

## Problem
File preview fails with error "Failed to get file information" when the file path or filename contains spaces.

Example failing path:
```
/storage/emulated/0/DCIM-H/School/MS-2017-00388 Yandhenla Bhutia.jpg
```

Error from frontend:
```
Preview error: "Failed to get file information"
```

## Root Cause

In `src-tauri/src/lib.rs`, the `preview_file` function uses the `stat` command to get file size:

```rust
let stat_output = shell
    .command(&adb_cmd)
    .args(["-s", &device_id, "shell", "stat", "-c", "%s", &device_path])
    .output()
    .await
```

The problem: `device_path` is passed as a separate argument, but when the shell processes it, spaces in the path cause it to be interpreted as multiple arguments.

For example, this path:
```
/storage/emulated/0/DCIM-H/School/MS-2017-00388 Yandhenla Bhutia.jpg
```

Gets interpreted as:
```
stat -c %s /storage/emulated/0/DCIM-H/School/MS-2017-00388 Yandhenla Bhutia.jpg
                                                          ^
                                                          shell thinks this is a separate argument
```

## Solution

Escape single quotes in the path and wrap the entire path in single quotes when passing to the shell command:

```rust
// Escape single quotes in path
let escaped_path = device_path.replace("'", "'\\''");
let stat_command = format!("stat -c %s '{}'", escaped_path);

let stat_output = shell
    .command(&adb_cmd)
    .args(["-s", &device_id, "shell", &stat_command])
    .output()
    .await
```

This approach:
1. Escapes any single quotes in the path (replace `'` with `'\''`)
2. Wraps the entire path in single quotes
3. Passes the complete command as a single shell string

This is the same pattern already used successfully elsewhere in the codebase (see `list_files`, `delete_file`, `rename_file`, `search_files`, etc.).

## Implementation

### Location: `src-tauri/src/lib.rs` - `preview_file` function (around line 910-916)

### Current Code (INCORRECT)
```rust
// Get file size first
let stat_output = shell
    .command(&adb_cmd)
    .args(["-s", &device_id, "shell", "stat", "-c", "%s", &device_path])
    .output()
    .await
    .map_err(|e| format!("Failed to get file size: {}", e))?;

if !stat_output.status.success() {
    return Err("Failed to get file information".to_string());
}
```

### Fixed Code (CORRECT)
```rust
// Get file size first
// Escape single quotes in path and wrap in quotes to handle spaces
let escaped_path = device_path.replace("'", "'\\''");
let stat_command = format!("stat -c %s '{}'", escaped_path);

let stat_output = shell
    .command(&adb_cmd)
    .args(["-s", &device_id, "shell", &stat_command])
    .output()
    .await
    .map_err(|e| format!("Failed to get file size: {}", e))?;

if !stat_output.status.success() {
    return Err("Failed to get file information".to_string());
}
```

## Testing Checklist

- [ ] Preview file with spaces in filename: `My Photo.jpg`
- [ ] Preview file with spaces in directory path: `/DCIM/My Photos/image.jpg`
- [ ] Preview file with spaces in both: `/My Folder/My Photo.jpg`
- [ ] Preview file with single quotes in path: `John's Photo.jpg`
- [ ] Preview file with multiple consecutive spaces: `My  Photo  2024.jpg`
- [ ] Preview file with special characters and spaces: `Photo #1 (2024).jpg`
- [ ] Preview file without spaces (regression test): `photo.jpg`
- [ ] Preview continues to work for all supported image formats
- [ ] Preview continues to work for all supported text formats

## Files Modified

- `src-tauri/src/lib.rs` - `preview_file` function (line ~910-916)

## Related Issues

This fix uses the same escaping pattern already established in the codebase:
- `list_files` (line 319): `format!("ls -la '{}'", escaped_path)`
- `delete_file` (line 560-566): `format!("rm -r '{}'", escaped_path)`
- `rename_file` (line 638-642): `format!("mv '{}' '{}'", escaped_old_path, escaped_new_path)`
- `search_files` (line 680-696): `format!("find '{}' ... ", escaped_path)`
- `get_storage_info` (line 732): `format!("df '{}'", escaped_path)`
- `download_file` (line 797): `format!("stat -c %Y '{}'", escaped_path)`

The `preview_file` function should follow this same pattern for consistency.
