//! Thumbnails and the preview pane. Phone previews come over ADB; Mac
//! thumbnails are read locally. List view does not request these.

use base64::{Engine as _, engine::general_purpose};
use crate::adb::get_adb_command;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri_plugin_shell::ShellExt;


// Helper function to check if a file extension is an image
pub(crate) fn is_image_extension(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp")
}


// Helper function to check if a file extension is a video
pub(crate) fn is_video_extension(ext: &str) -> bool {
    matches!(ext, "mp4" | "avi" | "mov" | "mkv" | "webm" | "3gp" | "m4v")
}


// Helper function to check if a file extension is a text file
pub(crate) fn is_text_extension(ext: &str) -> bool {
    matches!(
        ext,
        "txt" | "log" | "json" | "xml" | "html" | "htm" | "css" | "js" | "jsx" |
        "ts" | "tsx" | "md" | "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg" |
        "sh" | "bash" | "zsh" | "fish" | "py" | "rb" | "java" | "c" | "cpp" |
        "h" | "hpp" | "rs" | "go" | "swift" | "kt" | "gradle" | "properties" |
        "csv" | "tsv" | "sql" | "gitignore" | "env" | "config"
    )
}


/// Max source file size for Icons thumbnails (phone pull + Mac local). Keep in
/// sync with `THUMBNAIL_MAX_MB` in `src/file-types.ts`.
pub(crate) const THUMBNAIL_MAX_BYTES: u64 = 50_000_000;

/// Longest edge of an Icons preview. Icons zoom will not draw a box larger
/// than this in device pixels, so the bigger thumbnail steps stay sharp.
/// Keep in sync with `THUMBNAIL_SOURCE_PX` in `src/lib/iconSize.ts`. The cache
/// file name includes the edge so a smaller preview from an older build is
/// not reused.
const THUMBNAIL_EDGE: u32 = 512;

fn thumb_cache_path(temp_dir: &std::path::Path, cache_key: &str) -> std::path::PathBuf {
    temp_dir.join(format!("thumb_{}px_{}.png", THUMBNAIL_EDGE, cache_key))
}

fn thumb_scale_filter() -> String {
    format!(
        "scale={edge}:{edge}:force_original_aspect_ratio=decrease",
        edge = THUMBNAIL_EDGE
    )
}


// Get thumbnail for an image or video file on the phone (ADB pull).
#[tauri::command]
pub(crate) async fn get_thumbnail(
    app: tauri::AppHandle,
    device_id: String,
    file_path: String,
    extension: String,
    file_size: String,
) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    if let Ok(size) = file_size.parse::<u64>() {
        if size > THUMBNAIL_MAX_BYTES {
            return Ok("size-too-large".to_string());
        }
    }

    // Create temp directory for thumbnails
    let temp_dir = std::env::temp_dir().join("droiddock_thumbnails");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    // Generate cache key from file path and device ID
    let cache_key = format!("{:x}", md5::compute(format!("{}:{}", device_id, file_path)));
    let cached_thumb_path = thumb_cache_path(&temp_dir, &cache_key);

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

    // A folder pulled earlier leaves a directory at this path. The next pull
    // copies into that directory, and the image reader reports "Is a directory"
    // (os error 21) instead of reading the photo.
    if temp_file.is_dir() {
        std::fs::remove_dir_all(&temp_file)
            .map_err(|e| format!("Failed to clear a previous thumbnail download: {}", e))?;
    }

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

    // adb pull of a phone folder creates a directory. Do not hand that to the
    // image reader — it fails with "Is a directory" — and do not leave the
    // copied tree in the temp folder.
    if !file_metadata.is_file() {
        if file_metadata.is_dir() {
            let _ = std::fs::remove_dir_all(&temp_file);
            return Err("That phone item is a folder, so it has no photo preview.".to_string());
        }
        let _ = std::fs::remove_file(&temp_file);
        return Err("Could not read that phone item for a preview.".to_string());
    }

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

        let thumbnail = img.thumbnail(THUMBNAIL_EDGE, THUMBNAIL_EDGE);

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
        let scale = thumb_scale_filter();
        let ffmpeg_output = shell
            .command("ffmpeg")
            .args([
                "-i", temp_file.to_str().unwrap(),
                "-ss", "00:00:01",
                "-vframes", "1",
                "-vf", &scale,
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

#[tauri::command]
pub(crate) async fn get_local_thumbnail(
    app: tauri::AppHandle,
    file_path: String,
    extension: String,
) -> Result<String, String> {
    let path = std::path::Path::new(&file_path);
    let meta = fs::metadata(path).map_err(|e| format!("Could not read file: {}", e))?;
    if !meta.is_file() {
        return Err("Not a file".to_string());
    }
    if meta.len() > THUMBNAIL_MAX_BYTES {
        return Ok("size-too-large".to_string());
    }

    let temp_dir = std::env::temp_dir().join("droiddock_thumbnails");
    fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let cache_key = format!(
        "{:x}",
        md5::compute(format!("local:{}:{}", file_path, mtime))
    );
    let cached_thumb_path = thumb_cache_path(&temp_dir, &cache_key);
    if cached_thumb_path.exists() {
        let thumb_bytes = fs::read(&cached_thumb_path)
            .map_err(|e| format!("Failed to read cached thumbnail: {}", e))?;
        let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);
        return Ok(format!("data:image/png;base64,{}", base64_string));
    }

    let ext_lower = extension.to_lowercase().trim_start_matches('.').to_string();
    if is_image_extension(&ext_lower) {
        let img = image::ImageReader::open(path)
            .map_err(|e| format!("Failed to open image: {}", e))?
            .with_guessed_format()
            .map_err(|e| format!("Failed to guess image format: {}", e))?
            .decode()
            .map_err(|e| format!("Failed to decode image: {}", e))?;
        let thumbnail = img.thumbnail(THUMBNAIL_EDGE, THUMBNAIL_EDGE);
        thumbnail
            .save(&cached_thumb_path)
            .map_err(|e| format!("Failed to save thumbnail: {}", e))?;
        let thumb_bytes = fs::read(&cached_thumb_path)
            .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
        let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);
        return Ok(format!("data:image/png;base64,{}", base64_string));
    }

    if is_video_extension(&ext_lower) {
        let shell = app.shell();
        let ffmpeg_check = shell.command("ffmpeg").args(["-version"]).output().await;
        if ffmpeg_check.is_err() {
            return Ok("video-placeholder".to_string());
        }
        let scale = thumb_scale_filter();
        let ffmpeg_output = shell
            .command("ffmpeg")
            .args([
                "-i",
                &file_path,
                "-ss",
                "00:00:01",
                "-vframes",
                "1",
                "-vf",
                &scale,
                "-y",
                cached_thumb_path.to_str().unwrap_or(""),
            ])
            .output()
            .await;
        if let Ok(output) = ffmpeg_output {
            if output.status.success() && cached_thumb_path.exists() {
                let thumb_bytes = fs::read(&cached_thumb_path)
                    .map_err(|e| format!("Failed to read thumbnail: {}", e))?;
                let base64_string = general_purpose::STANDARD.encode(&thumb_bytes);
                return Ok(format!("data:image/png;base64,{}", base64_string));
            }
        }
        return Ok("video-placeholder".to_string());
    }

    Err("Unsupported file type".to_string())
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
pub(crate) async fn preview_file(
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

