use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;
use std::path::PathBuf;
use std::sync::Mutex;

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

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", "ls", "-la", &path])
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

    Some(FileEntry {
        name,
        permissions,
        size,
        date,
        is_directory,
    })
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_devices,
            list_files,
            check_adb,
            set_adb_path,
            get_current_adb_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
