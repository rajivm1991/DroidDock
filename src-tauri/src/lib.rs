use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use std::time::{UNIX_EPOCH, Duration};
use std::collections::HashMap;
use tauri::Emitter;

// Global state to store custom ADB path
static ADB_PATH: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
pub struct AdbDevice {
    pub id: String,
    pub status: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub permissions: String,
    pub size: String,
    pub date: String,
    pub is_directory: bool,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub percentage_used: f64,
}

// Try to find ADB in common locations
fn find_adb_path() -> Option<String> {
    let common_paths = vec![
        "/opt/homebrew/bin/adb",           // Homebrew on Apple Silicon
        "/usr/local/bin/adb",              // Homebrew on Intel
        "/opt/local/bin/adb",              // MacPorts
        "~/Library/Android/sdk/platform-tools/adb",  // Android Studio
        "~/Android/Sdk/platform-tools/adb",          // Alternative Android Studio
    ];

    for path_str in common_paths {
        let expanded_path = if path_str.starts_with("~/") {
            if let Some(home) = std::env::var("HOME").ok() {
                path_str.replacen("~", &home, 1)
            } else {
                continue;
            }
        } else {
            path_str.to_string()
        };

        let path = PathBuf::from(&expanded_path);
        if path.exists() {
            return Some(expanded_path);
        }
    }

    None
}

// Get the ADB command to use (custom path or just "adb")
fn get_adb_command() -> String {
    // Check if we have a custom path stored
    if let Ok(guard) = ADB_PATH.lock() {
        if let Some(ref path) = *guard {
            return path.clone();
        }
    }

    // Try to find ADB in common locations
    if let Some(path) = find_adb_path() {
        // Store it for future use
        if let Ok(mut guard) = ADB_PATH.lock() {
            *guard = Some(path.clone());
        }
        return path;
    }

    // Fall back to just "adb" (hope it's in PATH)
    "adb".to_string()
}

// Helper function to check if a file extension is an image
fn is_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp")
}

// Helper function to check if a file extension is a video
fn is_video_extension(ext: &str) -> bool {
    matches!(ext, "mp4" | "avi" | "mov" | "mkv" | "webm" | "3gp" | "m4v")
}

// Helper function to check if a file extension is a text file
fn is_text_extension(ext: &str) -> bool {
    matches!(
        ext,
        "txt" | "log" | "json" | "xml" | "html" | "htm" | "css" | "js" | "jsx" |
        "ts" | "tsx" | "md" | "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg" |
        "sh" | "bash" | "zsh" | "fish" | "py" | "rb" | "java" | "c" | "cpp" |
        "h" | "hpp" | "rs" | "go" | "swift" | "kt" | "gradle" | "properties" |
        "csv" | "tsv" | "sql" | "gitignore" | "env" | "config"
    )
}

// Get thumbnail for an image or video file
#[tauri::command]
async fn get_thumbnail(
    app: tauri::AppHandle,
    device_id: String,
    file_path: String,
    extension: String,
    file_size: String,
) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Skip thumbnails for files larger than 50MB to avoid long transfers
    if let Ok(size) = file_size.parse::<u64>() {
        if size > 50_000_000 {
            return Ok("size-too-large".to_string());
        }
    }

    // Create temp directory for thumbnails
    let temp_dir = std::env::temp_dir().join("droiddock_thumbnails");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Generate cache key from file path and device ID
    let cache_key = format!("{:x}", md5::compute(format!("{}:{}", device_id, file_path)));
    let cached_thumb_path = temp_dir.join(format!("thumb_{}.png", cache_key));

    // Check if thumbnail already exists in cache
    if cached_thumb_path.exists() {
        let thumb_bytes = std::fs::read(&cached_thumb_path)
            .map_err(|e| format!("Failed to read cached thumbnail: {}", e))?;
        let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);
        return Ok(format!("data:image/png;base64,{}", base64_string));
    }

    // Generate unique filename for temporary file
    let safe_filename = format!("{}_{}", cache_key, file_path.split('/').last().unwrap_or("file"));
    let temp_file = temp_dir.join(&safe_filename);

    // Pull file from Android device to temp location
    // Note: Don't escape quotes when using .args() - arguments are passed directly without shell interpretation
    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "pull", &file_path, temp_file.to_str().unwrap()])
        .output()
        .await
        .map_err(|e| format!("Failed to pull file from device: {}", e))?;

    if !output.status.success() {
        return Err(format!("ADB pull failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    // Validate that the file was actually pulled and has content
    if !temp_file.exists() {
        return Err("File was not pulled from device".to_string());
    }

    let file_metadata = std::fs::metadata(&temp_file)
        .map_err(|e| format!("Failed to read pulled file metadata: {}", e))?;

    if file_metadata.len() == 0 {
        let _ = std::fs::remove_file(&temp_file);
        return Err("Pulled file is empty (0 bytes)".to_string());
    }

    // For small files (< 100 bytes), might be corrupted
    if file_metadata.len() < 100 {
        let _ = std::fs::remove_file(&temp_file);
        return Err(format!("Pulled file too small ({} bytes), possibly corrupted", file_metadata.len()));
    }

    let ext_lower = extension.to_lowercase();

    // Generate thumbnail based on file type
    if is_image_extension(&ext_lower) {
        // Use with_guessed_format() to detect the actual format from file content
        // This handles files with mismatched extensions (e.g., .jpg files that are actually PNG)
        let img = image::ImageReader::open(&temp_file)
            .map_err(|e| {
                let _ = std::fs::remove_file(&temp_file);
                format!("Failed to open image (pulled {} bytes): {}", file_metadata.len(), e)
            })?
            .with_guessed_format()
            .map_err(|e| {
                let _ = std::fs::remove_file(&temp_file);
                format!("Failed to guess image format: {}", e)
            })?
            .decode()
            .map_err(|e| {
                let _ = std::fs::remove_file(&temp_file);
                format!("Failed to decode image (pulled {} bytes, expected size {}): {}. File may be corrupted or incomplete.",
                    file_metadata.len(), file_size, e)
            })?;

        // Resize to thumbnail size (256x256 maintaining aspect ratio)
        let thumbnail = img.thumbnail(256, 256);

        // Save thumbnail to cache
        thumbnail.save(&cached_thumb_path)
            .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

        // Convert to base64 for easy transfer to frontend
        let thumb_bytes = std::fs::read(&cached_thumb_path)
            .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
        let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);

        // Clean up original file
        let _ = std::fs::remove_file(&temp_file);

        // Return data URL
        Ok(format!("data:image/png;base64,{}", base64_string))

    } else if is_video_extension(&ext_lower) {
        // For videos, try to extract a frame using ffmpeg if available
        // First check if ffmpeg is installed
        let ffmpeg_check = shell
            .command("ffmpeg")
            .args(["-version"])
            .output()
            .await;

        if ffmpeg_check.is_err() {
            // Clean up and return placeholder
            let _ = std::fs::remove_file(&temp_file);
            return Ok("video-placeholder".to_string());
        }

        // Extract first frame at 1 second
        let ffmpeg_output = shell
            .command("ffmpeg")
            .args([
                "-i", temp_file.to_str().unwrap(),
                "-ss", "00:00:01",
                "-vframes", "1",
                "-vf", "scale=256:256:force_original_aspect_ratio=decrease",
                "-y",
                cached_thumb_path.to_str().unwrap()
            ])
            .output()
            .await;

        // Clean up original video file
        let _ = std::fs::remove_file(&temp_file);

        if let Ok(output) = ffmpeg_output {
            if output.status.success() && cached_thumb_path.exists() {
                let thumb_bytes = std::fs::read(&cached_thumb_path)
                    .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
                let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);
                return Ok(format!("data:image/png;base64,{}", base64_string));
            }
        }

        // If ffmpeg fails, return placeholder
        Ok("video-placeholder".to_string())

    } else {
        // Unsupported file type
        let _ = std::fs::remove_file(&temp_file);
        Err("Unsupported file type".to_string())
    }
}

// Get list of connected ADB devices
#[tauri::command]
async fn get_devices(app: tauri::AppHandle) -> Result<Vec<AdbDevice>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    let output = shell
        .command(&adb_cmd)
        .args(["devices"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb command: {}", e))?;

    if !output.status.success() {
        return Err(format!("ADB command failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut devices: Vec<AdbDevice> = stdout
        .lines()
        .skip(1) // Skip "List of devices attached" header
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                Some(AdbDevice {
                    id: parts[0].to_string(),
                    status: parts[1].to_string(),
                    model: String::new(),
                })
            } else {
                None
            }
        })
        .collect();

    // Query each device for its friendly model name
    for device in &mut devices {
        if device.status != "device" {
            continue;
        }

        let brand = shell
            .command(&adb_cmd)
            .args(["-s", &device.id, "shell", "getprop ro.product.brand"])
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let model = shell
            .command(&adb_cmd)
            .args(["-s", &device.id, "shell", "getprop ro.product.model"])
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        device.model = match (brand.is_empty(), model.is_empty()) {
            (false, false) => format!("{} {}", brand, model),
            (false, true) => brand,
            (true, false) => model,
            (true, true) => String::new(),
        };
    }

    Ok(devices)
}

// List files in a directory on the Android device
#[tauri::command]
async fn list_files(app: tauri::AppHandle, device_id: String, path: String) -> Result<Vec<FileEntry>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Escape single quotes in path and wrap in quotes to handle spaces
    let escaped_path = path.replace("'", "'\\''");
    let shell_command = format!("ls -la '{}'", escaped_path);

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &shell_command])
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb command: {}", e))?;

    if !output.status.success() {
        return Err(format!("ADB ls command failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<FileEntry> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter(|line| !line.starts_with("total"))
        .filter_map(|line| parse_ls_line(line))
        .collect();

    Ok(files)
}

// Parse a single line of ls -la output
// Android's ls -la format: permissions owner group size date time name
// Example: drwxrwx--- root sdcard_rw 2025-02-01 06:31 .NightPearl
fn parse_ls_line(line: &str) -> Option<FileEntry> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 7 {
        return None;
    }

    let permissions = parts[0].to_string();
    let is_directory = permissions.starts_with('d');

    // Find the time field (contains ':')
    let time_idx = parts.iter().position(|p| p.contains(':'))?;

    // Name is everything after the time
    if time_idx + 1 >= parts.len() {
        return None;
    }

    let name = parts[time_idx + 1..].join(" ");

    // Skip . and .. entries
    if name == "." || name == ".." || name.is_empty() {
        return None;
    }

    // Date is one position before time
    let date_part = if time_idx > 0 {
        parts[time_idx - 1]
    } else {
        ""
    };

    let time_part = parts[time_idx];
    let date = format!("{} {}", date_part, time_part);

    // Size is two positions before time (at time_idx - 2)
    let size = if time_idx >= 2 {
        parts[time_idx - 2].to_string()
    } else {
        "0".to_string()
    };

    // Extract file extension
    let extension = if !is_directory {
        name.rsplit('.').next()
            .filter(|ext| ext.len() <= 10 && ext.len() > 0 && ext != &name)
            .map(|ext| ext.to_lowercase())
    } else {
        None
    };

    Some(FileEntry {
        name,
        permissions,
        size,
        date,
        is_directory,
        extension,
    })
}

// Detect the primary storage path for an Android device
#[tauri::command]
async fn detect_storage_path(app: tauri::AppHandle, device_id: String) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Try 1: Get EXTERNAL_STORAGE environment variable
    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", "echo $EXTERNAL_STORAGE"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb command: {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() && path != "$EXTERNAL_STORAGE" {
            // Verify the path exists
            let verify_output = shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &format!("test -d '{}' && echo exists", path)])
                .output()
                .await
                .ok();

            if let Some(verify) = verify_output {
                if String::from_utf8_lossy(&verify.stdout).contains("exists") {
                    // Resolve symlink to get actual path
                    let resolve_output = shell
                        .command(&adb_cmd)
                        .args(["-s", &device_id, "shell", &format!("readlink -f '{}'", path)])
                        .output()
                        .await
                        .ok();

                    if let Some(resolved) = resolve_output {
                        let resolved_path = String::from_utf8_lossy(&resolved.stdout).trim().to_string();
                        if !resolved_path.is_empty() {
                            return Ok(resolved_path);
                        }
                    }

                    // If readlink fails, use path as-is
                    return Ok(path);
                }
            }
        }
    }

    // Try 2: Check common symlinks (/sdcard usually points to the right place)
    let sdcard_paths = vec!["/sdcard", "/mnt/sdcard", "/storage/self/primary"];

    for sdcard_path in sdcard_paths {
        let output = shell
            .command(&adb_cmd)
            .args(["-s", &device_id, "shell", &format!("test -d '{}' && echo exists", sdcard_path)])
            .output()
            .await
            .ok();

        if let Some(verify) = output {
            if String::from_utf8_lossy(&verify.stdout).contains("exists") {
                // Resolve symlink to get actual path
                let resolve_output = shell
                    .command(&adb_cmd)
                    .args(["-s", &device_id, "shell", &format!("readlink -f '{}'", sdcard_path)])
                    .output()
                    .await
                    .ok();

                if let Some(resolved) = resolve_output {
                    let resolved_path = String::from_utf8_lossy(&resolved.stdout).trim().to_string();
                    if !resolved_path.is_empty() {
                        return Ok(resolved_path);
                    }
                }

                // If readlink fails, just use the path as-is
                return Ok(sdcard_path.to_string());
            }
        }
    }

    // Try 3: Default to /storage/emulated/0 (most common path)
    Ok("/storage/emulated/0".to_string())
}

// Check if ADB is available
#[tauri::command]
async fn check_adb(app: tauri::AppHandle) -> Result<bool, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    let output = shell
        .command(&adb_cmd)
        .args(["version"])
        .output()
        .await
        .map_err(|_| "ADB is not installed or not in PATH".to_string())?;

    Ok(output.status.success())
}

// Set custom ADB path
#[tauri::command]
fn set_adb_path(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    if !path_buf.exists() {
        return Err("ADB executable not found at specified path".to_string());
    }

    if let Ok(mut guard) = ADB_PATH.lock() {
        *guard = Some(path);
        Ok(())
    } else {
        Err("Failed to set ADB path".to_string())
    }
}

// Get current ADB path (for display purposes)
#[tauri::command]
fn get_current_adb_path() -> String {
    get_adb_command()
}

// Delete a file or directory on the Android device
#[tauri::command]
async fn delete_file(
    app: tauri::AppHandle,
    device_id: String,
    file_path: String,
    is_directory: bool,
) -> Result<(), String> {
    // Safety check: prevent deletion of critical system directories
    let critical_paths = vec![
        "/",
        "/system",
        "/data",
        "/vendor",
        "/boot",
        "/proc",
        "/sys",
        "/dev",
    ];

    if critical_paths.contains(&file_path.as_str()) {
        return Err(format!("Cannot delete critical system path: {}", file_path));
    }

    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Escape single quotes in path
    let escaped_path = file_path.replace("'", "'\\''");

    // Use rm -r for directories, rm for files
    let rm_command = if is_directory {
        format!("rm -r '{}'", escaped_path)
    } else {
        format!("rm '{}'", escaped_path)
    };

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &rm_command])
        .output()
        .await
        .map_err(|e| format!("Failed to execute delete command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Permission denied") {
            return Err(format!("Permission denied: Cannot delete {}", file_path));
        } else if stderr.contains("Directory not empty") {
            return Err(format!("Directory not empty: {}", file_path));
        } else if stderr.contains("No such file") {
            return Err(format!("File not found: {}", file_path));
        } else {
            return Err(format!("Delete failed: {}", stderr));
        }
    }

    Ok(())
}

// Rename a file or directory on the Android device
#[tauri::command]
async fn rename_file(
    app: tauri::AppHandle,
    device_id: String,
    old_path: String,
    new_name: String,
) -> Result<(), String> {
    // Validate new name doesn't contain path separators
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("Invalid name: cannot contain path separators".to_string());
    }

    // Validate new name is not empty
    if new_name.trim().is_empty() {
        return Err("Invalid name: cannot be empty".to_string());
    }

    // Safety check: prevent renaming critical system directories
    let critical_paths = vec![
        "/",
        "/system",
        "/data",
        "/vendor",
        "/boot",
        "/proc",
        "/sys",
        "/dev",
    ];

    if critical_paths.contains(&old_path.as_str()) {
        return Err(format!("Cannot rename critical system path: {}", old_path));
    }

    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Build the new path by replacing the filename
    let parent_path = old_path.rsplit_once('/').map(|(parent, _)| parent).unwrap_or("");
    let new_path = if parent_path.is_empty() {
        format!("/{}", new_name)
    } else {
        format!("{}/{}", parent_path, new_name)
    };

    // Escape single quotes in paths
    let escaped_old_path = old_path.replace("'", "'\\''");
    let escaped_new_path = new_path.replace("'", "'\\''");

    // Use mv command to rename
    let mv_command = format!("mv '{}' '{}'", escaped_old_path, escaped_new_path);

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &mv_command])
        .output()
        .await
        .map_err(|e| format!("Failed to execute rename command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Permission denied") {
            return Err(format!("Permission denied: Cannot rename {}", old_path));
        } else if stderr.contains("File exists") || stderr.contains("already exists") {
            return Err(format!("A file or folder named '{}' already exists", new_name));
        } else if stderr.contains("No such file") {
            return Err(format!("File not found: {}", old_path));
        } else {
            return Err(format!("Rename failed: {}", stderr));
        }
    }

    Ok(())
}

// Search for files on the Android device
#[tauri::command]
async fn search_files(
    app: tauri::AppHandle,
    device_id: String,
    search_path: String,
    pattern: String,
    recursive: bool,
) -> Result<Vec<FileEntry>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Escape single quotes in path and pattern
    let escaped_path = search_path.replace("'", "'\\''");
    let escaped_pattern = pattern.replace("'", "'\\''");

    // Build find command
    // Use -iname for case-insensitive search
    // Exclude Android/data and Android/obb but keep Android/media
    // Redirect stderr to /dev/null to suppress permission denied errors
    let max_depth_arg = if recursive { "" } else { "-maxdepth 1" };
    let exclusions = if recursive {
        // Only add exclusions for recursive searches
        r#"\( -path '*/Android/data' -o -path '*/Android/obb' \) -prune -o"#
    } else {
        ""
    };
    let find_command = format!(
        "find '{}' {} {} -iname '*{}*' -exec ls -ld {{}} \\; 2>/dev/null",
        escaped_path, max_depth_arg, exclusions, escaped_pattern
    );

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &find_command])
        .output()
        .await
        .map_err(|e| format!("Failed to execute search command: {}", e))?;

    // Don't check exit status - find returns non-zero if it encounters permission errors
    // but we've redirected stderr to /dev/null and want to process whatever results we got
    let stdout = String::from_utf8_lossy(&output.stdout);
    let files: Vec<FileEntry> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| parse_ls_line(line))
        .collect();

    Ok(files)
}

// Get storage information from the Android device
#[tauri::command]
async fn get_storage_info(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
) -> Result<StorageInfo, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Escape single quotes in path
    let escaped_path = path.replace("'", "'\\''");

    // Use df command to get storage stats for the given path
    let df_command = format!("df '{}'", escaped_path);

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &df_command])
        .output()
        .await
        .map_err(|e| format!("Failed to get storage info: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Storage info failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse df output - format varies but typically:
    // Filesystem     1K-blocks    Used Available Use% Mounted on
    // /dev/block/... 123456789 45678901 77777888  37% /storage/emulated

    for line in stdout.lines().skip(1) {
        // Skip header
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 4 {
            // Try to parse the size fields (in KB typically)
            if let (Ok(total_kb), Ok(used_kb), Ok(free_kb)) = (
                parts[1].parse::<u64>(),
                parts[2].parse::<u64>(),
                parts[3].parse::<u64>(),
            ) {
                let total_bytes = total_kb * 1024;
                let used_bytes = used_kb * 1024;
                let free_bytes = free_kb * 1024;
                let percentage_used = if total_bytes > 0 {
                    (used_bytes as f64 / total_bytes as f64) * 100.0
                } else {
                    0.0
                };

                return Ok(StorageInfo {
                    total_bytes,
                    used_bytes,
                    free_bytes,
                    percentage_used,
                });
            }
        }
    }

    Err("Failed to parse storage information".to_string())
}

// Download a file from the Android device to the local filesystem
#[tauri::command]
async fn download_file(
    app: tauri::AppHandle,
    device_id: String,
    device_path: String,
    local_path: String,
    skip_existing: bool,
) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // First, get the file's modification time from the device
    let escaped_path = device_path.replace("'", "'\\''");
    let stat_command = format!("stat -c %Y '{}'", escaped_path);

    let stat_output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &stat_command])
        .output()
        .await
        .ok();

    let mtime = stat_output
        .and_then(|output| {
            String::from_utf8_lossy(&output.stdout)
                .trim()
                .parse::<u64>()
                .ok()
        });

    // Skip transfer when duplicate handling is enabled and destination already exists.
    let local_file_path = std::path::Path::new(&local_path);
    if skip_existing && local_file_path.exists() {
        return Ok("skipped".to_string());
    }

    // Use adb pull to download the file
    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "pull", &device_path, &local_path])
        .output()
        .await
        .map_err(|e| format!("Failed to download file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("does not exist") {
            return Err(format!("File not found: {}", device_path));
        } else if stderr.contains("Permission denied") {
            return Err(format!("Permission denied: {}", device_path));
        } else {
            return Err(format!("Download failed: {}", stderr));
        }
    }

    // Set the modification time on the downloaded file to match the source
    if let Some(timestamp) = mtime {
        if local_file_path.exists() {
            let mtime_system = UNIX_EPOCH + Duration::from_secs(timestamp);
            let file = fs::File::open(local_file_path)
                .map_err(|e| format!("Failed to open downloaded file: {}", e))?;

            file.set_modified(mtime_system)
                .map_err(|e| format!("Failed to set modification time: {}", e))?;
        }
    }

    Ok("downloaded".to_string())
}

// Upload a file from the local filesystem to the Android device
#[tauri::command]
async fn upload_file(
    app: tauri::AppHandle,
    device_id: String,
    local_path: String,
    device_path: String,
) -> Result<(), String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Verify local file exists
    if !std::path::Path::new(&local_path).exists() {
        return Err(format!("Local file not found: {}", local_path));
    }

    // Use adb push to upload the file
    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "push", &local_path, &device_path])
        .output()
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("Permission denied") {
            return Err(format!("Permission denied: {}", device_path));
        } else if stderr.contains("Read-only file system") {
            return Err(format!("Read-only file system: {}", device_path));
        } else {
            return Err(format!("Upload failed: {}", stderr));
        }
    }

    // Preserve the local file's modification time on the device
    let local_path_obj = std::path::Path::new(&local_path);
    if let Ok(metadata) = local_path_obj.metadata() {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                let mtime = duration.as_secs();
                let escaped_path = device_path.replace("'", "'\\''");
                let touch_cmd = format!("touch -d @{} '{}'", mtime, escaped_path);
                let _ = shell
                    .command(&adb_cmd)
                    .args(["-s", &device_id, "shell", &touch_cmd])
                    .output()
                    .await;
            }
        }
    }

    Ok(())
}

// Response type for file preview
#[derive(Debug, Serialize, Deserialize)]
pub struct FilePreview {
    pub file_type: String,  // "image", "text", or "unsupported"
    pub content: String,    // base64 for images, text content for text files
    pub size: u64,          // file size in bytes
}

// Preview a file from the Android device
#[tauri::command]
async fn preview_file(
    app: tauri::AppHandle,
    device_id: String,
    device_path: String,
    extension: Option<String>,
) -> Result<FilePreview, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Define max file size for preview (10MB for text, 50MB for images)
    const MAX_TEXT_SIZE: u64 = 10 * 1024 * 1024;
    const MAX_IMAGE_SIZE: u64 = 50 * 1024 * 1024;

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

    let size_str = String::from_utf8_lossy(&stat_output.stdout).trim().to_string();
    let file_size: u64 = size_str.parse()
        .map_err(|_| "Failed to parse file size".to_string())?;

    // Determine file type - handle extension with or without dot prefix
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

    // Add debug logging (using eprintln! for simplicity in debug builds)
    // Note: For larger applications, consider using the 'log' crate
    #[cfg(debug_assertions)]
    {
        eprintln!("Preview file debug - extension param: {:?}", extension);
        eprintln!("Preview file debug - processed ext: {}", ext);
    }

    let is_image = is_image_extension(&ext);
    let is_text = is_text_extension(&ext);

    #[cfg(debug_assertions)]
    {
        eprintln!("Preview file debug - is_image: {}, is_text: {}", is_image, is_text);
    }

    if !is_image && !is_text {
        return Ok(FilePreview {
            file_type: "unsupported".to_string(),
            content: String::new(),
            size: file_size,
        });
    }

    // Check file size limits
    if is_text && file_size > MAX_TEXT_SIZE {
        return Err(format!(
            "Text file too large to preview ({} MB). Maximum size is 10 MB.",
            file_size / (1024 * 1024)
        ));
    }

    if is_image && file_size > MAX_IMAGE_SIZE {
        return Err(format!(
            "Image file too large to preview ({} MB). Maximum size is 50 MB.",
            file_size / (1024 * 1024)
        ));
    }

    // Create a temp file to store the pulled file
    let temp_file = tempfile::NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let temp_path = temp_file.path().to_str()
        .ok_or("Failed to get temp file path")?;

    // Pull the file from the device
    let pull_output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "pull", &device_path, temp_path])
        .output()
        .await
        .map_err(|e| format!("Failed to pull file: {}", e))?;

    if !pull_output.status.success() {
        let stderr = String::from_utf8_lossy(&pull_output.stderr);
        return Err(format!("Failed to pull file: {}", stderr));
    }

    // Read and process the file based on type
    if is_image {
        // Read image file and convert to base64
        let image_bytes = fs::read(temp_path)
            .map_err(|e| format!("Failed to read image file: {}", e))?;
        let base64_content = general_purpose::STANDARD.encode(&image_bytes);

        Ok(FilePreview {
            file_type: "image".to_string(),
            content: base64_content,
            size: file_size,
        })
    } else {
        // Read text file
        let text_content = fs::read_to_string(temp_path)
            .map_err(|e| format!("Failed to read text file: {}", e))?;

        // Limit text content to reasonable size for display
        // Use char-based truncation to avoid panicking on multi-byte UTF-8 characters
        let display_content = if text_content.len() > 500_000 {
            let truncated: String = text_content.chars().take(500_000).collect();
            format!(
                "{}\n\n... (truncated, showing first 500KB of {} KB file)",
                truncated,
                text_content.len() / 1024
            )
        } else {
            text_content
        };

        Ok(FilePreview {
            file_type: "text".to_string(),
            content: display_content,
            size: file_size,
        })
    }
}

// ========================
// Folder Sync Types
// ========================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SyncDirection {
    PhoneToComputer,
    ComputerToPhone,
    BothWays,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncOptions {
    pub local_path: String,
    pub device_path: String,
    pub direction: SyncDirection,
    pub recursive: bool,
    pub delete_missing: bool,
    pub match_mode: String,
    #[serde(default)]
    pub file_patterns: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMetadata {
    pub relative_path: String,
    pub size: u64,
    pub modified_time: u64,
    pub is_directory: bool,
    pub md5_hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncAction {
    pub file_path: String,
    pub action_type: String,
    pub direction: String,
    pub size: u64,
    pub reason: String,
    pub rename_from: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncPreview {
    pub actions: Vec<SyncAction>,
    pub total_transfer_bytes: u64,
    pub copy_count: u32,
    pub update_count: u32,
    pub delete_count: u32,
    pub skip_count: u32,
    pub rename_count: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncProgress {
    pub current_file: String,
    pub completed_count: u32,
    pub total_count: u32,
    pub completed_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success_count: u32,
    pub skip_count: u32,
    pub error_count: u32,
    pub errors: Vec<String>,
}

fn compute_local_md5(path: &std::path::Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!("{:x}", md5::compute(&bytes)))
}

/// Returns true if a file/directory should be excluded from sync operations.
fn is_sync_excluded(name: &str) -> bool {
    matches!(
        name,
        ".DS_Store"
            | ".Spotlight-V100"
            | ".Trashes"
            | ".fseventsd"
            | ".TemporaryItems"
            | "Thumbs.db"
            | "desktop.ini"
            | ".thumbnails"
            | ".thumbdata3"
            | ".thumbdata4"
            | ".nomedia"
    )
}

/// Normalize file patterns: strip device_path prefix and append /**/* for bare directories.
fn normalize_patterns(patterns: &[String], device_path: &str) -> Vec<String> {
    if patterns.is_empty() {
        return Vec::new();
    }
    let prefix = device_path.trim_end_matches('/');
    patterns.iter().map(|p| {
        // Strip device path prefix if present (user may paste absolute paths)
        let stripped = if p.starts_with(prefix) {
            p[prefix.len()..].trim_start_matches('/').to_string()
        } else {
            p.trim_start_matches('/').to_string()
        };
        // Strip trailing slash
        let stripped = stripped.trim_end_matches('/').to_string();
        // If pattern has no glob characters, treat as directory: append /**/*
        if !stripped.contains('*') && !stripped.contains('?') && !stripped.contains('[') {
            format!("{}/**/*", stripped)
        } else {
            stripped
        }
    }).collect()
}

fn matches_any_pattern(rel_path: &str, patterns: &[String]) -> bool {
    if patterns.is_empty() {
        return true;
    }
    let options = glob::MatchOptions {
        case_sensitive: true,
        require_literal_separator: false,
        require_literal_leading_dot: false,
    };
    patterns.iter().any(|p| {
        glob::Pattern::new(p)
            .map(|pat| pat.matches_with(rel_path, options))
            .unwrap_or(false)
    })
}

// List files on the local Mac filesystem for sync
#[tauri::command]
fn list_local_files(path: String, recursive: bool, match_mode: String, file_patterns: Vec<String>) -> Result<Vec<FileMetadata>, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("Local path does not exist: {}", path));
    }

    let mut result = Vec::new();

    if recursive {
        for entry in walkdir::WalkDir::new(&root)
            .min_depth(1)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_str().unwrap_or("");
                !is_sync_excluded(name)
            })
            .filter_map(|e| e.ok())
        {
            let rel_path = entry.path().strip_prefix(&root)
                .map_err(|e| format!("Path error: {}", e))?
                .to_string_lossy()
                .to_string();

            if rel_path.is_empty() {
                continue;
            }

            let metadata = entry.metadata()
                .map_err(|e| format!("Failed to read metadata for {}: {}", rel_path, e))?;

            // Skip directories when filtering by patterns (only match files)
            if !metadata.is_dir() && !matches_any_pattern(&rel_path, &file_patterns) {
                continue;
            }

            let modified_time = metadata.modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let md5_hash = if match_mode == "content" && !metadata.is_dir() {
                compute_local_md5(entry.path())
            } else {
                None
            };

            result.push(FileMetadata {
                relative_path: rel_path,
                size: metadata.len(),
                modified_time,
                is_directory: metadata.is_dir(),
                md5_hash,
            });
        }
    } else {
        let entries = fs::read_dir(&root)
            .map_err(|e| format!("Failed to read directory {}: {}", path, e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let metadata = entry.metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();

            if is_sync_excluded(&name) {
                continue;
            }

            if !metadata.is_dir() && !matches_any_pattern(&name, &file_patterns) {
                continue;
            }

            let modified_time = metadata.modified()
                .unwrap_or(UNIX_EPOCH)
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let md5_hash = if match_mode == "content" && !metadata.is_dir() {
                compute_local_md5(&root.join(&name))
            } else {
                None
            };

            result.push(FileMetadata {
                relative_path: name,
                size: metadata.len(),
                modified_time,
                is_directory: metadata.is_dir(),
                md5_hash,
            });
        }
    }

    Ok(result)
}

// List files on the Android device for sync
#[tauri::command]
async fn list_device_files_for_sync(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
    recursive: bool,
    match_mode: String,
    file_patterns: Vec<String>,
) -> Result<Vec<FileMetadata>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let escaped_path = path.replace("'", "'\\''");

    let mut result = Vec::new();

    if recursive {
        // When patterns are provided, only scan targeted directories instead of the entire root
        let scan_dirs: Vec<String> = if !file_patterns.is_empty() {
            // Extract directory prefixes from patterns (everything before the first glob character)
            let mut dirs: Vec<String> = file_patterns.iter().map(|p| {
                // Find the directory portion before any glob characters
                let glob_pos = p.find(|c: char| c == '*' || c == '?' || c == '[')
                    .unwrap_or(p.len());
                let dir_part = &p[..glob_pos];
                // Trim to last slash to get the directory
                let dir = if let Some(slash_pos) = dir_part.rfind('/') {
                    &dir_part[..slash_pos]
                } else {
                    ""
                };
                if dir.is_empty() {
                    path.clone()
                } else {
                    format!("{}/{}", path, dir)
                }
            }).collect();
            dirs.sort();
            dirs.dedup();
            // Remove directories that are subdirectories of other entries
            let mut filtered: Vec<String> = Vec::new();
            for dir in &dirs {
                if !filtered.iter().any(|parent| dir.starts_with(&format!("{}/", parent))) {
                    filtered.push(dir.clone());
                }
            }
            filtered
        } else {
            vec![path.clone()]
        };

        #[cfg(debug_assertions)]
        {
            eprintln!("[sync] scan_dirs: {:?}", scan_dirs);
            eprintln!("[sync] file_patterns for filtering: {:?}", file_patterns);
        }

        // Use find + stat in one command per scan_dir. Each output line is self-contained
        // using '|' as delimiter: size|mtime|type|full_path
        // This avoids the fragile batch-stat approach where one failed stat misaligns all subsequent entries.
        for scan_dir in &scan_dirs {
            let escaped_scan_dir = scan_dir.replace("'", "'\\''");
            let find_stat_command = format!(
                "find '{}' -mindepth 1 \\( -type f -o -type d \\) -exec stat -c '%s|%Y|%F|%n' {{}} + 2>/dev/null",
                escaped_scan_dir
            );

            let output = shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &find_stat_command])
                .output()
                .await
                .map_err(|e| format!("Failed to list device files: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout);

            #[cfg(debug_assertions)]
            eprintln!("[sync] find+stat returned {} lines for {}", stdout.lines().count(), scan_dir);

            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                // Parse: size|mtime|type|full_path
                let parts: Vec<&str> = line.splitn(4, '|').collect();
                if parts.len() < 4 {
                    continue;
                }

                let size = parts[0].parse::<u64>().unwrap_or(0);
                let mtime = parts[1].parse::<u64>().unwrap_or(0);
                let is_dir = parts[2].contains("directory");
                let file_path = parts[3];

                // Compute relative path
                let rel_path = if file_path.starts_with(&path) {
                    file_path[path.len()..].trim_start_matches('/').to_string()
                } else {
                    file_path.to_string()
                };

                if rel_path.is_empty() {
                    continue;
                }

                // Skip if any path component is excluded
                if rel_path.split('/').any(|part| is_sync_excluded(part)) {
                    continue;
                }

                // Apply glob pattern filtering (skip directories from filtering)
                if !is_dir && !matches_any_pattern(&rel_path, &file_patterns) {
                    continue;
                }

                let md5_hash = if match_mode == "content" && !is_dir {
                    let escaped_file = file_path.replace("'", "'\\''");
                    let md5_cmd = format!("md5sum '{}' 2>/dev/null", escaped_file);
                    let md5_output = shell
                        .command(&adb_cmd)
                        .args(["-s", &device_id, "shell", &md5_cmd])
                        .output()
                        .await
                        .ok();
                    md5_output.and_then(|o| {
                        let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        out.split_whitespace().next().map(|s| s.to_string())
                    })
                } else {
                    None
                };

                result.push(FileMetadata {
                    relative_path: rel_path,
                    size,
                    modified_time: mtime,
                    is_directory: is_dir,
                    md5_hash,
                });
            }
        }
        // Deduplicate results from overlapping scan_dirs
        result.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        result.dedup_by(|a, b| a.relative_path == b.relative_path);
    } else {
        // Flat listing: use ls -la and stat for mtime
        let ls_command = format!("ls -la '{}'", escaped_path);

        let output = shell
            .command(&adb_cmd)
            .args(["-s", &device_id, "shell", &ls_command])
            .output()
            .await
            .map_err(|e| format!("Failed to list device files: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let entries: Vec<FileEntry> = stdout
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter(|line| !line.starts_with("total"))
            .filter_map(|line| parse_ls_line(line))
            .collect();

        for entry in &entries {
            if is_sync_excluded(&entry.name) {
                continue;
            }

            if !entry.is_directory && !matches_any_pattern(&entry.name, &file_patterns) {
                continue;
            }

            let file_full_path = format!("{}/{}", path, entry.name);
            let escaped_file = file_full_path.replace("'", "'\\''");
            let stat_cmd = format!("stat -c '%s %Y' '{}' 2>/dev/null", escaped_file);

            let stat_output = shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &stat_cmd])
                .output()
                .await
                .ok();

            let (size, mtime) = if let Some(stat_out) = stat_output {
                let stat_str = String::from_utf8_lossy(&stat_out.stdout).trim().to_string();
                let parts: Vec<&str> = stat_str.split(' ').collect();
                if parts.len() >= 2 {
                    (
                        parts[0].parse::<u64>().unwrap_or(0),
                        parts[1].parse::<u64>().unwrap_or(0),
                    )
                } else {
                    (entry.size.parse::<u64>().unwrap_or(0), 0)
                }
            } else {
                (entry.size.parse::<u64>().unwrap_or(0), 0)
            };

            let md5_hash = if match_mode == "content" && !entry.is_directory {
                let md5_cmd = format!("md5sum '{}' 2>/dev/null", escaped_file);
                let md5_output = shell
                    .command(&adb_cmd)
                    .args(["-s", &device_id, "shell", &md5_cmd])
                    .output()
                    .await
                    .ok();
                md5_output.and_then(|o| {
                    let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    out.split_whitespace().next().map(|s| s.to_string())
                })
            } else {
                None
            };

            result.push(FileMetadata {
                relative_path: entry.name.clone(),
                size,
                modified_time: mtime,
                is_directory: entry.is_directory,
                md5_hash,
            });
        }
    }

    Ok(result)
}

// Compute sync actions from two file lists
fn compute_sync_actions(
    local_files: &[FileMetadata],
    device_files: &[FileMetadata],
    direction: &SyncDirection,
    delete_missing: bool,
    match_mode: &str,
) -> Vec<SyncAction> {
    if match_mode == "content" {
        return compute_sync_actions_by_content(local_files, device_files, direction, delete_missing);
    }

    let local_map: HashMap<&str, &FileMetadata> = local_files
        .iter()
        .filter(|f| !f.is_directory)
        .map(|f| (f.relative_path.as_str(), f))
        .collect();

    let device_map: HashMap<&str, &FileMetadata> = device_files
        .iter()
        .filter(|f| !f.is_directory)
        .map(|f| (f.relative_path.as_str(), f))
        .collect();

    let mut actions = Vec::new();

    match direction {
        SyncDirection::PhoneToComputer => {
            // Source = device, Dest = local
            for (rel_path, dev_file) in &device_map {
                if let Some(local_file) = local_map.get(rel_path) {
                    if dev_file.size != local_file.size || dev_file.modified_time > local_file.modified_time {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "update".to_string(),
                            direction: "\u{2192} Computer".to_string(),
                            size: dev_file.size,
                            reason: "Device file is newer or different size".to_string(),
                            rename_from: None,
                        });
                    }
                } else {
                    actions.push(SyncAction {
                        file_path: rel_path.to_string(),
                        action_type: "copy".to_string(),
                        direction: "\u{2192} Computer".to_string(),
                        size: dev_file.size,
                        reason: "File only exists on device".to_string(),
                        rename_from: None,
                    });
                }
            }
            if delete_missing {
                for (rel_path, local_file) in &local_map {
                    if !device_map.contains_key(rel_path) {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "delete".to_string(),
                            direction: "\u{2716} Computer".to_string(),
                            size: local_file.size,
                            reason: "File not on device, will be deleted locally".to_string(),
                            rename_from: None,
                        });
                    }
                }
            }
        }
        SyncDirection::ComputerToPhone => {
            // Source = local, Dest = device
            for (rel_path, local_file) in &local_map {
                if let Some(dev_file) = device_map.get(rel_path) {
                    if local_file.size != dev_file.size || local_file.modified_time > dev_file.modified_time {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "update".to_string(),
                            direction: "\u{2192} Phone".to_string(),
                            size: local_file.size,
                            reason: "Local file is newer or different size".to_string(),
                            rename_from: None,
                        });
                    }
                } else {
                    actions.push(SyncAction {
                        file_path: rel_path.to_string(),
                        action_type: "copy".to_string(),
                        direction: "\u{2192} Phone".to_string(),
                        size: local_file.size,
                        reason: "File only exists locally".to_string(),
                        rename_from: None,
                    });
                }
            }
            if delete_missing {
                for (rel_path, dev_file) in &device_map {
                    if !local_map.contains_key(rel_path) {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "delete".to_string(),
                            direction: "\u{2716} Phone".to_string(),
                            size: dev_file.size,
                            reason: "File not on computer, will be deleted from device".to_string(),
                            rename_from: None,
                        });
                    }
                }
            }
        }
        SyncDirection::BothWays => {
            // Merge: files unique to one side get copied, conflicts resolved by mtime
            let mut all_paths: std::collections::HashSet<&str> = std::collections::HashSet::new();
            all_paths.extend(local_map.keys());
            all_paths.extend(device_map.keys());

            for rel_path in all_paths {
                match (local_map.get(rel_path), device_map.get(rel_path)) {
                    (Some(_local_file), None) => {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "copy".to_string(),
                            direction: "\u{2192} Phone".to_string(),
                            size: _local_file.size,
                            reason: "File only exists locally".to_string(),
                            rename_from: None,
                        });
                    }
                    (None, Some(_dev_file)) => {
                        actions.push(SyncAction {
                            file_path: rel_path.to_string(),
                            action_type: "copy".to_string(),
                            direction: "\u{2192} Computer".to_string(),
                            size: _dev_file.size,
                            reason: "File only exists on device".to_string(),
                            rename_from: None,
                        });
                    }
                    (Some(local_file), Some(dev_file)) => {
                        if local_file.size != dev_file.size || local_file.modified_time != dev_file.modified_time {
                            if local_file.modified_time >= dev_file.modified_time {
                                actions.push(SyncAction {
                                    file_path: rel_path.to_string(),
                                    action_type: "update".to_string(),
                                    direction: "\u{2192} Phone".to_string(),
                                    size: local_file.size,
                                    reason: "Local file is newer".to_string(),
                                    rename_from: None,
                                });
                            } else {
                                actions.push(SyncAction {
                                    file_path: rel_path.to_string(),
                                    action_type: "update".to_string(),
                                    direction: "\u{2192} Computer".to_string(),
                                    size: dev_file.size,
                                    reason: "Device file is newer".to_string(),
                                    rename_from: None,
                                });
                            }
                        }
                        // Same size and mtime → skip (no action needed)
                    }
                    (None, None) => {} // shouldn't happen
                }
            }
        }
    }

    actions.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    actions
}

// Content-based (MD5) sync action computation
fn compute_sync_actions_by_content(
    local_files: &[FileMetadata],
    device_files: &[FileMetadata],
    direction: &SyncDirection,
    delete_missing: bool,
) -> Vec<SyncAction> {
    use std::collections::HashSet;

    let mut actions = Vec::new();

    // Build hash -> files maps (only files with hashes)
    let mut local_by_hash: HashMap<&str, Vec<&FileMetadata>> = HashMap::new();
    for f in local_files.iter().filter(|f| !f.is_directory && f.md5_hash.is_some()) {
        local_by_hash.entry(f.md5_hash.as_ref().unwrap().as_str())
            .or_default().push(f);
    }
    let mut device_by_hash: HashMap<&str, Vec<&FileMetadata>> = HashMap::new();
    for f in device_files.iter().filter(|f| !f.is_directory && f.md5_hash.is_some()) {
        device_by_hash.entry(f.md5_hash.as_ref().unwrap().as_str())
            .or_default().push(f);
    }

    // Also build path maps for update detection
    let local_by_path: HashMap<&str, &FileMetadata> = local_files.iter()
        .filter(|f| !f.is_directory && f.md5_hash.is_some())
        .map(|f| (f.relative_path.as_str(), f))
        .collect();
    let device_by_path: HashMap<&str, &FileMetadata> = device_files.iter()
        .filter(|f| !f.is_directory && f.md5_hash.is_some())
        .map(|f| (f.relative_path.as_str(), f))
        .collect();

    let mut handled_local: HashSet<String> = HashSet::new();
    let mut handled_device: HashSet<String> = HashSet::new();

    // Collect all unique hashes
    let mut all_hashes: HashSet<&str> = HashSet::new();
    all_hashes.extend(local_by_hash.keys());
    all_hashes.extend(device_by_hash.keys());

    for hash in &all_hashes {
        let local_for_hash = local_by_hash.get(hash).cloned().unwrap_or_default();
        let device_for_hash = device_by_hash.get(hash).cloned().unwrap_or_default();

        if !local_for_hash.is_empty() && !device_for_hash.is_empty() {
            // Hash exists on both sides
            let lf = local_for_hash[0];
            let df = device_for_hash[0];
            handled_local.insert(lf.relative_path.clone());
            handled_device.insert(df.relative_path.clone());

            if lf.relative_path != df.relative_path {
                // Same content, different path → rename
                match direction {
                    SyncDirection::PhoneToComputer => {
                        // Source is device, so rename local to match device name
                        actions.push(SyncAction {
                            file_path: df.relative_path.clone(),
                            action_type: "rename".to_string(),
                            direction: "\u{2192} Computer".to_string(),
                            size: df.size,
                            reason: format!("Renamed: {} \u{2192} {}", lf.relative_path, df.relative_path),
                            rename_from: Some(lf.relative_path.clone()),
                        });
                    }
                    SyncDirection::ComputerToPhone => {
                        // Source is local, so rename device to match local name
                        actions.push(SyncAction {
                            file_path: lf.relative_path.clone(),
                            action_type: "rename".to_string(),
                            direction: "\u{2192} Phone".to_string(),
                            size: lf.size,
                            reason: format!("Renamed: {} \u{2192} {}", df.relative_path, lf.relative_path),
                            rename_from: Some(df.relative_path.clone()),
                        });
                    }
                    SyncDirection::BothWays => {
                        // Rename the older side to match the newer
                        if lf.modified_time >= df.modified_time {
                            actions.push(SyncAction {
                                file_path: lf.relative_path.clone(),
                                action_type: "rename".to_string(),
                                direction: "\u{2192} Phone".to_string(),
                                size: lf.size,
                                reason: format!("Renamed: {} \u{2192} {}", df.relative_path, lf.relative_path),
                                rename_from: Some(df.relative_path.clone()),
                            });
                        } else {
                            actions.push(SyncAction {
                                file_path: df.relative_path.clone(),
                                action_type: "rename".to_string(),
                                direction: "\u{2192} Computer".to_string(),
                                size: df.size,
                                reason: format!("Renamed: {} \u{2192} {}", lf.relative_path, df.relative_path),
                                rename_from: Some(lf.relative_path.clone()),
                            });
                        }
                    }
                }
            }
            // Same hash + same path → skip (identical, no action)

            // Mark additional files with same hash as handled
            for f in &local_for_hash { handled_local.insert(f.relative_path.clone()); }
            for f in &device_for_hash { handled_device.insert(f.relative_path.clone()); }
        } else if !local_for_hash.is_empty() {
            // Hash only on local side
            for lf in &local_for_hash {
                handled_local.insert(lf.relative_path.clone());
                match direction {
                    SyncDirection::ComputerToPhone | SyncDirection::BothWays => {
                        actions.push(SyncAction {
                            file_path: lf.relative_path.clone(),
                            action_type: "copy".to_string(),
                            direction: "\u{2192} Phone".to_string(),
                            size: lf.size,
                            reason: "File only exists locally".to_string(),
                            rename_from: None,
                        });
                    }
                    SyncDirection::PhoneToComputer => {
                        // Source is device, local-only file: delete if enabled
                        if delete_missing {
                            actions.push(SyncAction {
                                file_path: lf.relative_path.clone(),
                                action_type: "delete".to_string(),
                                direction: "\u{2716} Computer".to_string(),
                                size: lf.size,
                                reason: "File not on device, will be deleted locally".to_string(),
                                rename_from: None,
                            });
                        }
                    }
                }
            }
        } else {
            // Hash only on device side
            for df in &device_for_hash {
                handled_device.insert(df.relative_path.clone());
                match direction {
                    SyncDirection::PhoneToComputer | SyncDirection::BothWays => {
                        actions.push(SyncAction {
                            file_path: df.relative_path.clone(),
                            action_type: "copy".to_string(),
                            direction: "\u{2192} Computer".to_string(),
                            size: df.size,
                            reason: "File only exists on device".to_string(),
                            rename_from: None,
                        });
                    }
                    SyncDirection::ComputerToPhone => {
                        if delete_missing {
                            actions.push(SyncAction {
                                file_path: df.relative_path.clone(),
                                action_type: "delete".to_string(),
                                direction: "\u{2716} Phone".to_string(),
                                size: df.size,
                                reason: "File not on computer, will be deleted from device".to_string(),
                                rename_from: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // Handle files with same path but different hash (updates) that weren't matched above
    for (path, lf) in &local_by_path {
        if handled_local.contains(*path) { continue; }
        if let Some(df) = device_by_path.get(path) {
            if lf.md5_hash != df.md5_hash {
                handled_local.insert(path.to_string());
                handled_device.insert(path.to_string());
                match direction {
                    SyncDirection::PhoneToComputer => {
                        actions.push(SyncAction {
                            file_path: path.to_string(),
                            action_type: "update".to_string(),
                            direction: "\u{2192} Computer".to_string(),
                            size: df.size,
                            reason: "Device file has different content".to_string(),
                            rename_from: None,
                        });
                    }
                    SyncDirection::ComputerToPhone => {
                        actions.push(SyncAction {
                            file_path: path.to_string(),
                            action_type: "update".to_string(),
                            direction: "\u{2192} Phone".to_string(),
                            size: lf.size,
                            reason: "Local file has different content".to_string(),
                            rename_from: None,
                        });
                    }
                    SyncDirection::BothWays => {
                        if lf.modified_time >= df.modified_time {
                            actions.push(SyncAction {
                                file_path: path.to_string(),
                                action_type: "update".to_string(),
                                direction: "\u{2192} Phone".to_string(),
                                size: lf.size,
                                reason: "Local file is newer".to_string(),
                                rename_from: None,
                            });
                        } else {
                            actions.push(SyncAction {
                                file_path: path.to_string(),
                                action_type: "update".to_string(),
                                direction: "\u{2192} Computer".to_string(),
                                size: df.size,
                                reason: "Device file is newer".to_string(),
                                rename_from: None,
                            });
                        }
                    }
                }
            }
        }
    }

    actions.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    actions
}

// Preview sync: compute what would happen without executing
#[tauri::command]
async fn preview_sync(
    app: tauri::AppHandle,
    device_id: String,
    options: SyncOptions,
) -> Result<SyncPreview, String> {
    let patterns = normalize_patterns(&options.file_patterns, &options.device_path);
    // Force recursive when patterns contain path separators
    let recursive = options.recursive || patterns.iter().any(|p| p.contains('/'));

    #[cfg(debug_assertions)]
    {
        eprintln!("[sync] raw file_patterns: {:?}", options.file_patterns);
        eprintln!("[sync] normalized patterns: {:?}", patterns);
        eprintln!("[sync] recursive: {}", recursive);
    }

    let local_files = list_local_files(options.local_path.clone(), recursive, options.match_mode.clone(), patterns.clone())?;
    let device_files = list_device_files_for_sync(
        app,
        device_id,
        options.device_path.clone(),
        recursive,
        options.match_mode.clone(),
        patterns,
    ).await?;

    #[cfg(debug_assertions)]
    {
        eprintln!("[sync] local_files count: {}", local_files.len());
        eprintln!("[sync] device_files count: {}", device_files.len());
        if !device_files.is_empty() {
            eprintln!("[sync] first device file: {:?}", device_files[0].relative_path);
        }
        if !local_files.is_empty() {
            eprintln!("[sync] first local file: {:?}", local_files[0].relative_path);
        }
    }

    let actions = compute_sync_actions(&local_files, &device_files, &options.direction, options.delete_missing, &options.match_mode);

    let mut total_transfer_bytes: u64 = 0;
    let mut copy_count: u32 = 0;
    let mut update_count: u32 = 0;
    let mut delete_count: u32 = 0;
    let mut skip_count: u32 = 0;
    let mut rename_count: u32 = 0;

    for action in &actions {
        match action.action_type.as_str() {
            "copy" => {
                copy_count += 1;
                total_transfer_bytes += action.size;
            }
            "update" => {
                update_count += 1;
                total_transfer_bytes += action.size;
            }
            "delete" => {
                delete_count += 1;
            }
            "rename" => {
                rename_count += 1;
            }
            _ => {
                skip_count += 1;
            }
        }
    }

    Ok(SyncPreview {
        actions,
        total_transfer_bytes,
        copy_count,
        update_count,
        delete_count,
        skip_count,
        rename_count,
    })
}

// Execute sync: perform the actual file transfers
#[tauri::command]
async fn execute_sync(
    app: tauri::AppHandle,
    window: tauri::Window,
    device_id: String,
    options: SyncOptions,
) -> Result<SyncResult, String> {
    let patterns = normalize_patterns(&options.file_patterns, &options.device_path);
    // Force recursive when patterns contain path separators
    let recursive = options.recursive || patterns.iter().any(|p| p.contains('/'));

    let local_files = list_local_files(options.local_path.clone(), recursive, options.match_mode.clone(), patterns.clone())?;
    let device_files = list_device_files_for_sync(
        app.clone(),
        device_id.clone(),
        options.device_path.clone(),
        recursive,
        options.match_mode.clone(),
        patterns,
    ).await?;

    let actions = compute_sync_actions(&local_files, &device_files, &options.direction, options.delete_missing, &options.match_mode);

    // Build timestamp lookup maps for preserving file modification times
    let device_mtime_map: HashMap<String, u64> = device_files.iter()
        .map(|f| (f.relative_path.clone(), f.modified_time))
        .collect();
    let local_mtime_map: HashMap<String, u64> = local_files.iter()
        .map(|f| (f.relative_path.clone(), f.modified_time))
        .collect();

    let total_count = actions.len() as u32;
    let total_bytes: u64 = actions.iter().map(|a| a.size).sum();

    let mut success_count: u32 = 0;
    let mut skip_count: u32 = 0;
    let mut error_count: u32 = 0;
    let mut errors: Vec<String> = Vec::new();
    let mut completed_bytes: u64 = 0;

    let shell = app.shell();
    let adb_cmd = get_adb_command();

    for (i, action) in actions.iter().enumerate() {
        // Emit progress
        let _ = window.emit("sync-progress", SyncProgress {
            current_file: action.file_path.clone(),
            completed_count: i as u32,
            total_count,
            completed_bytes,
            total_bytes,
        });

        let result = match action.action_type.as_str() {
            "copy" | "update" => {
                if action.direction.contains("Computer") {
                    // Pull from device to local
                    let device_file = format!("{}/{}", options.device_path, action.file_path);
                    let local_file = PathBuf::from(&options.local_path).join(&action.file_path);

                    // Create parent directories
                    if let Some(parent) = local_file.parent() {
                        let _ = fs::create_dir_all(parent);
                    }

                    let output = shell
                        .command(&adb_cmd)
                        .args(["-s", &device_id, "pull", &device_file, local_file.to_str().unwrap_or("")])
                        .output()
                        .await;

                    match output {
                        Ok(o) if o.status.success() => {
                            // Restore the source file's modification time
                            if let Some(&mtime) = device_mtime_map.get(&action.file_path) {
                                let mtime_system = UNIX_EPOCH + Duration::from_secs(mtime);
                                if let Ok(file) = fs::File::open(&local_file) {
                                    let _ = file.set_modified(mtime_system);
                                }
                            }
                            Ok(())
                        }
                        Ok(o) => Err(format!("Pull failed: {}", String::from_utf8_lossy(&o.stderr))),
                        Err(e) => Err(format!("Pull error: {}", e)),
                    }
                } else if action.direction.contains("Phone") {
                    // Push from local to device
                    let local_file = PathBuf::from(&options.local_path).join(&action.file_path);
                    let device_file = format!("{}/{}", options.device_path, action.file_path);

                    // Create parent directory on device if needed
                    if let Some(parent) = PathBuf::from(&action.file_path).parent() {
                        let parent_str = parent.to_string_lossy();
                        if !parent_str.is_empty() {
                            let device_parent = format!("{}/{}", options.device_path, parent_str);
                            let escaped = device_parent.replace("'", "'\\''");
                            let mkdir_cmd = format!("mkdir -p '{}'", escaped);
                            let _ = shell
                                .command(&adb_cmd)
                                .args(["-s", &device_id, "shell", &mkdir_cmd])
                                .output()
                                .await;
                        }
                    }

                    let output = shell
                        .command(&adb_cmd)
                        .args(["-s", &device_id, "push", local_file.to_str().unwrap_or(""), &device_file])
                        .output()
                        .await;

                    match output {
                        Ok(o) if o.status.success() => {
                            // Restore the source file's modification time on the device
                            if let Some(&mtime) = local_mtime_map.get(&action.file_path) {
                                let escaped_path = device_file.replace("'", "'\\''");
                                let touch_cmd = format!("touch -d @{} '{}'", mtime, escaped_path);
                                let _ = shell
                                    .command(&adb_cmd)
                                    .args(["-s", &device_id, "shell", &touch_cmd])
                                    .output()
                                    .await;
                            }
                            Ok(())
                        }
                        Ok(o) => Err(format!("Push failed: {}", String::from_utf8_lossy(&o.stderr))),
                        Err(e) => Err(format!("Push error: {}", e)),
                    }
                } else {
                    Ok(()) // skip
                }
            }
            "delete" => {
                if action.direction.contains("Computer") {
                    // Delete local file
                    let local_file = PathBuf::from(&options.local_path).join(&action.file_path);
                    fs::remove_file(&local_file)
                        .map_err(|e| format!("Failed to delete local file: {}", e))
                } else if action.direction.contains("Phone") {
                    // Delete device file
                    let device_file = format!("{}/{}", options.device_path, action.file_path);
                    let escaped = device_file.replace("'", "'\\''");
                    let rm_cmd = format!("rm '{}'", escaped);

                    let output = shell
                        .command(&adb_cmd)
                        .args(["-s", &device_id, "shell", &rm_cmd])
                        .output()
                        .await;

                    match output {
                        Ok(o) if o.status.success() => Ok(()),
                        Ok(o) => Err(format!("Delete failed: {}", String::from_utf8_lossy(&o.stderr))),
                        Err(e) => Err(format!("Delete error: {}", e)),
                    }
                } else {
                    Ok(())
                }
            }
            "rename" => {
                if let Some(ref old_rel_path) = action.rename_from {
                    if action.direction.contains("Computer") {
                        // Rename local file
                        let old_local = PathBuf::from(&options.local_path).join(old_rel_path);
                        let new_local = PathBuf::from(&options.local_path).join(&action.file_path);
                        if let Some(parent) = new_local.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        fs::rename(&old_local, &new_local)
                            .map_err(|e| format!("Rename failed: {}", e))
                    } else if action.direction.contains("Phone") {
                        // Rename on device
                        let old_device = format!("{}/{}", options.device_path, old_rel_path);
                        let new_device = format!("{}/{}", options.device_path, action.file_path);
                        let escaped_old = old_device.replace("'", "'\\''");
                        let escaped_new = new_device.replace("'", "'\\''");
                        // Create parent dir on device if needed
                        if let Some(parent) = PathBuf::from(&action.file_path).parent() {
                            let parent_str = parent.to_string_lossy();
                            if !parent_str.is_empty() {
                                let device_parent = format!("{}/{}", options.device_path, parent_str);
                                let escaped = device_parent.replace("'", "'\\''");
                                let mkdir_cmd = format!("mkdir -p '{}'", escaped);
                                let _ = shell
                                    .command(&adb_cmd)
                                    .args(["-s", &device_id, "shell", &mkdir_cmd])
                                    .output()
                                    .await;
                            }
                        }
                        let mv_cmd = format!("mv '{}' '{}'", escaped_old, escaped_new);
                        let output = shell
                            .command(&adb_cmd)
                            .args(["-s", &device_id, "shell", &mv_cmd])
                            .output()
                            .await;
                        match output {
                            Ok(o) if o.status.success() => Ok(()),
                            Ok(o) => Err(format!("Rename failed: {}", String::from_utf8_lossy(&o.stderr))),
                            Err(e) => Err(format!("Rename error: {}", e)),
                        }
                    } else {
                        Ok(())
                    }
                } else {
                    Ok(())
                }
            }
            _ => {
                skip_count += 1;
                continue;
            }
        };

        match result {
            Ok(()) => {
                success_count += 1;
                completed_bytes += action.size;
            }
            Err(e) => {
                error_count += 1;
                errors.push(format!("{}: {}", action.file_path, e));
            }
        }
    }

    // Emit final progress
    let _ = window.emit("sync-progress", SyncProgress {
        current_file: "Done".to_string(),
        completed_count: total_count,
        total_count,
        completed_bytes,
        total_bytes,
    });

    Ok(SyncResult {
        success_count,
        skip_count,
        error_count,
        errors,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_devices,
            list_files,
            detect_storage_path,
            check_adb,
            set_adb_path,
            get_current_adb_path,
            get_thumbnail,
            delete_file,
            rename_file,
            search_files,
            get_storage_info,
            download_file,
            upload_file,
            preview_file,
            list_local_files,
            list_device_files_for_sync,
            preview_sync,
            execute_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_matches_any_pattern_with_spaces() {
        // Pattern with space in directory name
        let patterns = vec![
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/*".to_string(),
        ];

        // Should match a file directly in that directory
        assert!(matches_any_pattern(
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/IMG_001.jpg",
            &patterns,
        ));

        // Should NOT match a file in a different directory
        assert!(!matches_any_pattern(
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/Sent/VID_001.mp4",
            &patterns,
        ));
    }

    #[test]
    fn test_normalize_patterns_with_spaces() {
        // Bare directory with spaces → should get /**/* appended
        let patterns = vec![
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent".to_string(),
        ];
        let normalized = normalize_patterns(&patterns, "/sdcard");
        assert_eq!(
            normalized,
            vec!["Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/**/*"],
        );

        // Pattern with glob stays as-is
        let patterns2 = vec![
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/*".to_string(),
        ];
        let normalized2 = normalize_patterns(&patterns2, "/sdcard");
        assert_eq!(
            normalized2,
            vec!["Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/*"],
        );
    }

    #[test]
    fn test_matches_any_pattern_with_double_star_and_spaces() {
        // Normalized pattern from bare directory input
        let patterns = vec![
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/**/*".to_string(),
        ];

        // Should match a file in the directory
        assert!(matches_any_pattern(
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/IMG_001.jpg",
            &patterns,
        ));

        // Should match a file in a subdirectory
        assert!(matches_any_pattern(
            "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/Sent/2024/IMG_001.jpg",
            &patterns,
        ));
    }

    #[test]
    fn test_matches_empty_patterns_matches_all() {
        assert!(matches_any_pattern("any/path/file.txt", &vec![]));
    }
}
