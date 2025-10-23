use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose};

// Global state to store custom ADB path
static ADB_PATH: Mutex<Option<String>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
pub struct AdbDevice {
    pub id: String,
    pub status: String,
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

        // Resize to thumbnail size (100x100 maintaining aspect ratio)
        let thumbnail = img.thumbnail(100, 100);

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
                "-vf", "scale=100:100:force_original_aspect_ratio=decrease",
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
    let devices: Vec<AdbDevice> = stdout
        .lines()
        .skip(1) // Skip "List of devices attached" header
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                Some(AdbDevice {
                    id: parts[0].to_string(),
                    status: parts[1].to_string(),
                })
            } else {
                None
            }
        })
        .collect();

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_devices,
            list_files,
            detect_storage_path,
            check_adb,
            set_adb_path,
            get_current_adb_path,
            get_thumbnail,
            delete_file,
            search_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
