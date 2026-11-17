//! Phone folder commands over ADB (list, search, rename, delete, storage).
//! Critical Android paths are refused. Does not copy bytes; that is transfer.

use std::collections::HashMap;
use crate::adb::get_adb_command;
use crate::transfer::numbered_file_name;
use crate::model::{DestConflict, FileEntry, StorageInfo};
use tauri_plugin_shell::ShellExt;


pub(crate) fn is_critical_system_path(path: &str) -> bool {
    const CRITICAL_PATHS: [&str; 8] = [
        "/",
        "/system",
        "/data",
        "/vendor",
        "/boot",
        "/proc",
        "/sys",
        "/dev",
    ];

    let mut normalized = path.trim().to_string();
    while normalized.len() > 1 && normalized.ends_with('/') {
        normalized.pop();
    }

    if normalized.is_empty() {
        return false;
    }

    CRITICAL_PATHS.iter().any(|critical| {
        if let Some(remainder) = normalized.strip_prefix(critical) {
            remainder.is_empty() || remainder.starts_with('/')
        } else {
            false
        }
    })
}


pub(crate) async fn phone_path_kind(
    app: &tauri::AppHandle,
    device_id: &str,
    path: &str,
) -> Result<&'static str, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let escaped = path.replace('\'', "'\\''");
    let output = shell
        .command(&adb_cmd)
        .args([
            "-s",
            device_id,
            "shell",
            &format!(
                "if [ -d '{}' ]; then echo directory; elif [ -e '{}' ]; then echo file; else echo missing; fi",
                escaped, escaped
            ),
        ])
        .output()
        .await
        .map_err(|e| format!("Could not check phone path: {}", e))?;
    // An empty or garbled adb reply used to read as "missing", which let Copy overwrite
    // without asking. Only an exact answer counts.
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(match text.trim() {
        "directory" => "directory",
        "file" => "file",
        "missing" => "missing",
        _ => "unknown",
    })
}


/// Batch-classify phone destination paths (chunked ADB shell).
#[tauri::command]
pub(crate) async fn check_phone_destinations(
    app: tauri::AppHandle,
    device_id: String,
    paths: Vec<String>,
) -> Result<Vec<DestConflict>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let mut results = Vec::with_capacity(paths.len());
    const CHUNK: usize = 40;
    for (chunk_start, chunk) in paths.chunks(CHUNK).enumerate() {
        let script = chunk
            .iter()
            .enumerate()
            .map(|(i, path)| {
                let idx = chunk_start * CHUNK + i;
                let escaped = path.replace('\'', "'\\''");
                format!(
                    "if [ -d '{}' ]; then echo 'd:{}'; elif [ -e '{}' ]; then echo 'f:{}'; else echo 'm:{}'; fi",
                    escaped, idx, escaped, idx, idx
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        let output = shell
            .command(&adb_cmd)
            .args(["-s", &device_id, "shell", &script])
            .output()
            .await
            .map_err(|e| format!("Could not check phone paths: {}", e))?;
        let mut kinds: HashMap<usize, &str> = HashMap::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("d:") {
                if let Ok(i) = rest.parse::<usize>() {
                    kinds.insert(i, "directory");
                }
            } else if let Some(rest) = line.strip_prefix("f:") {
                if let Ok(i) = rest.parse::<usize>() {
                    kinds.insert(i, "file");
                }
            } else if let Some(rest) = line.strip_prefix("m:") {
                if let Ok(i) = rest.parse::<usize>() {
                    kinds.insert(i, "missing");
                }
            }
        }
        for (i, path) in chunk.iter().enumerate() {
            let idx = chunk_start * CHUNK + i;
            // No line for this path (adb hiccup, truncated output): the UI
            // must ask instead of assuming the name is free.
            let kind = kinds.get(&idx).copied().unwrap_or("unknown").to_string();
            results.push(DestConflict {
                path: path.clone(),
                kind,
            });
        }
    }
    Ok(results)
}


/// First free "name (n).ext" on the phone (or the path itself if free).
/// An unreadable answer is an error, not "free" — Keep both must never land
/// on a name that may already be taken.
pub(crate) async fn unique_device_path(
    app: &tauri::AppHandle,
    device_id: &str,
    path: &str,
) -> Result<String, String> {
    let unreadable = || "Could not check names on the phone. Reconnect and try again.".to_string();
    match phone_path_kind(app, device_id, path).await? {
        "missing" => return Ok(path.to_string()),
        "unknown" => return Err(unreadable()),
        _ => {}
    }
    let (parent, file_name) = match path.rsplit_once('/') {
        Some((p, name)) => (p, name),
        None => ("", path),
    };
    let mut n = 1u32;
    loop {
        let candidate_name = numbered_file_name(file_name, n);
        let candidate = if parent.is_empty() {
            candidate_name.clone()
        } else {
            format!("{}/{}", parent, candidate_name)
        };
        match phone_path_kind(app, device_id, &candidate).await? {
            "missing" => return Ok(candidate),
            "unknown" => return Err(unreadable()),
            _ => {}
        }
        n += 1;
        if n > 10_000 {
            return Err("Could not find a free name on the phone".to_string());
        }
    }
}


/// Replace folders on This Mac wipes the old copy, but phone → Mac expansion
/// (`list_files_recursive`) prunes Android/data and Android/obb, so those never come
/// back. The confirmation must say so only when it applies. True when an Android/data
/// or Android/obb folder sits under `path`. Does not list or copy anything; an adb
/// failure is an Err so the UI can keep the warning (safer than hiding it).
#[tauri::command]
pub(crate) async fn phone_tree_has_pruned_dirs(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
) -> Result<bool, String> {
    let escaped = path.replace('\'', "'\\''");
    let script = format!(
        "find '{}' \\( -path '*/Android/data' -o -path '*/Android/obb' \\) -prune -print 2>/dev/null | head -n 1; echo DD_DONE",
        escaped
    );
    let output = app
        .shell()
        .command(get_adb_command())
        .args(["-s", &device_id, "shell", &script])
        .output()
        .await
        .map_err(|e| format!("Could not check that phone folder: {}", e))?;
    let text = String::from_utf8_lossy(&output.stdout);
    if !text.contains("DD_DONE") {
        return Err("Could not check that phone folder.".to_string());
    }
    Ok(text
        .lines()
        .map(|line| line.trim())
        .any(|line| !line.is_empty() && line != "DD_DONE"))
}


// List files in a directory on the Android device
#[tauri::command]
pub(crate) async fn list_files(app: tauri::AppHandle, device_id: String, path: String) -> Result<Vec<FileEntry>, String> {
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


/// Text after the whitespace-separated token at `token_idx`, exactly as printed:
/// one separator is skipped, nothing else is trimmed except the line ending.
fn name_after_token(line: &str, token_idx: usize) -> Option<String> {
    let mut rest = line;
    for _ in 0..=token_idx {
        rest = rest.trim_start();
        let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
        rest = &rest[end..];
    }
    let mut chars = rest.chars();
    chars.next()?; // the single separator after the time column
    let name = chars.as_str().trim_end_matches(['\r', '\n']);
    Some(name.to_string())
}


// Parse a single line of ls -la output
// Android's ls -la format: permissions owner group size date time name
// Example: drwxrwx--- root sdcard_rw 2025-02-01 06:31 .NightPearl
pub(crate) fn parse_ls_line(line: &str) -> Option<FileEntry> {
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

    // Take the name from the raw line: re-joining split tokens collapsed runs of spaces
    // (and dropped leading/trailing ones), so the path no longer matched the real file.
    let name = name_after_token(line, time_idx)?;

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


/// Place marks hide folders that are not on the phone; listing every candidate is
/// heavier than a directory test. ADB `test -d` for one absolute phone path. Does not
/// list contents or create the folder.
#[tauri::command]
pub(crate) async fn phone_path_exists(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
) -> Result<bool, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let escaped = path.replace('\'', "'\\''");
    let output = shell
        .command(&adb_cmd)
        .args([
            "-s",
            &device_id,
            "shell",
            &format!("test -d '{}' && echo exists", escaped),
        ])
        .output()
        .await
        .map_err(|e| format!("Could not check that phone folder: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).contains("exists"))
}


/// Where the primary shared storage lives differs by Android version and maker. Checked
/// in order; the first that resolves to a listable directory wins. `$EXTERNAL_STORAGE`
/// is tried before these (handled in `detect_storage_path`).
/// - `/sdcard`, `/storage/self/primary`: symlinks present on nearly every device.
/// - `/storage/emulated/0`: the real path on Android 4.2+ (user 0).
/// - `/mnt/sdcard`, `/mnt/user/0/primary`, `/mnt/shell/emulated/0`: older or some
///   vendor layouts.
/// - `/storage/emulated/legacy`, `/storage/sdcard0`, `/storage/sdcard`, `/mnt/sdcard0`:
///   Android 4.x and some Samsung / Sony / Huawei builds.
/// - `/storage/internal`, `/storage/emulated/{id}`: ROMs that rename the volume, or a
///   work profile / secondary user as the active user.
const STORAGE_CANDIDATES: &[&str] = &[
    "/sdcard",
    "/storage/self/primary",
    "/storage/emulated/0",
    "/mnt/sdcard",
    "/mnt/user/0/primary",
    "/mnt/shell/emulated/0",
    "/storage/emulated/legacy",
    "/storage/sdcard0",
    "/storage/sdcard",
    "/mnt/sdcard0",
    "/storage/internal",
];

/// Shell-side probe for one candidate. Prints the usable path, or nothing. Resolves
/// symlinks with `readlink -f` when the phone has it (old toolbox builds do not), then
/// accepts the resolved path only if the shell can actually list it, else falls back to
/// the unresolved name when that one lists (e.g. `/sdcard` resolving to a
/// shell-unreadable `/data/media/0`). The listing output is discarded on the phone;
/// only the path comes back.
fn storage_probe_script(candidate: &str) -> String {
    let c = candidate.replace('\'', "'\\''");
    format!(
        "p='{c}'; r=$(readlink -f \"$p\" 2>/dev/null); \
         for x in \"$r\" \"$p\"; do \
           if [ -n \"$x\" ] && [ -d \"$x\" ] && ls \"$x/\" >/dev/null 2>&1; then echo \"$x\"; exit 0; fi; \
         done"
    )
}

async fn probe_storage_candidate(
    app: &tauri::AppHandle,
    device_id: &str,
    candidate: &str,
) -> Option<String> {
    let output = app
        .shell()
        .command(get_adb_command())
        .args(["-s", device_id, "shell", &storage_probe_script(candidate)])
        .output()
        .await
        .ok()?;
    let path = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if path.starts_with('/') && path.len() > 1 {
        Some(path)
    } else {
        None
    }
}

// Detect the primary storage path for an Android device
#[tauri::command]
pub(crate) async fn detect_storage_path(app: tauri::AppHandle, device_id: String) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Try 1: the phone's own idea of external storage.
    let env_output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", "echo $EXTERNAL_STORAGE"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute adb command: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_output.stdout).trim().to_string();
    if env_path.starts_with('/') {
        if let Some(path) = probe_storage_candidate(&app, &device_id, &env_path).await {
            return Ok(path);
        }
    }

    // Try 2: known locations, first one that resolves to a listable folder.
    for candidate in STORAGE_CANDIDATES {
        if let Some(path) = probe_storage_candidate(&app, &device_id, candidate).await {
            return Ok(path);
        }
    }

    // Try 3: default to /storage/emulated/0 (most common path)
    Ok("/storage/emulated/0".to_string())
}


/// Context “New folder” on the phone pane needs a mkdir over ADB. `mkdir` one directory
/// under an existing parent (name only, no `/`). Does not create nested paths in one
/// shot, or overwrite an existing name.
#[tauri::command]
pub(crate) async fn create_phone_folder(
    app: tauri::AppHandle,
    device_id: String,
    parent_path: String,
    name: String,
) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Enter a folder name.".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\0') || trimmed == "." || trimmed == ".." {
        return Err("That folder name is not allowed.".to_string());
    }
    let parent = parent_path.trim_end_matches('/');
    let full = if parent.is_empty() || parent == "/" {
        format!("/{}", trimmed)
    } else {
        format!("{}/{}", parent, trimmed)
    };
    if is_critical_system_path(&full) {
        return Err("Cannot create a folder there.".to_string());
    }
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let escaped = full.replace('\'', "'\\''");
    let exists = shell
        .command(&adb_cmd)
        .args([
            "-s",
            &device_id,
            "shell",
            &format!("test -e '{}' && echo exists", escaped),
        ])
        .output()
        .await
        .map_err(|e| format!("Could not check that folder: {}", e))?;
    if String::from_utf8_lossy(&exists.stdout).contains("exists") {
        return Err(format!("“{}” already exists.", trimmed));
    }
    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &format!("mkdir '{}'", escaped)])
        .output()
        .await
        .map_err(|e| format!("Could not create folder: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Could not create folder: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(full)
}


// Delete a file or directory on the Android device
#[tauri::command]
pub(crate) async fn delete_file(
    app: tauri::AppHandle,
    device_id: String,
    file_path: String,
    is_directory: bool,
) -> Result<(), String> {
    if is_critical_system_path(&file_path) {
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
pub(crate) async fn rename_file(
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

    if is_critical_system_path(&old_path) {
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
pub(crate) async fn search_files(
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
pub(crate) async fn get_storage_info(
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


// List all files (not directories) under a device path, recursively.
#[tauri::command]
pub(crate) async fn list_files_recursive(
    app: tauri::AppHandle,
    device_id: String,
    device_path: String,
) -> Result<Vec<String>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    let escaped_path = device_path.replace("'", "'\\''");
    // Exclude Android/data and Android/obb but keep Android/media.
    // Redirect stderr to /dev/null to suppress permission denied errors.
    let exclusions = r#"\( -path '*/Android/data' -o -path '*/Android/obb' \) -prune -o"#;
    let find_command = format!(
        "find '{}' {} -type f -print 2>/dev/null",
        escaped_path, exclusions
    );

    let output = shell
        .command(&adb_cmd)
        .args(["-s", &device_id, "shell", &find_command])
        .output()
        .await
        .map_err(|e| format!("Failed to list folder contents: {}", e))?;

    // Don't check exit status - find returns non-zero if it encounters permission errors
    // but we've redirected stderr to /dev/null and want to process whatever results we got
    let files = String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(|line| line.trim_end_matches('\r').to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(files)
}



#[cfg(test)]
mod parse_ls_tests {
    use super::parse_ls_line;

    #[test]
    fn keeps_repeated_leading_and_trailing_spaces_in_names() {
        let e = parse_ls_line("-rw-rw---- 1 u0_a373 media_rw 12345 2026-10-28 01:09 A  B [1080p] + C .mkv").unwrap();
        assert_eq!(e.name, "A  B [1080p] + C .mkv");
        let e = parse_ls_line("-rw-rw---- 1 u0_a373 media_rw 12345 2026-10-28 01:09  lead and trail ").unwrap();
        assert_eq!(e.name, " lead and trail ");
        assert_eq!(e.size, "12345");
        assert_eq!(e.date, "2026-10-28 01:09");
    }

    #[test]
    fn plain_names_and_old_toolbox_dates_still_parse() {
        let e = parse_ls_line("drwxrws--- 3 u0_a373 media_rw 3452 2026-10-28 01:09 DCIM").unwrap();
        assert!(e.is_directory);
        assert_eq!(e.name, "DCIM");
        let e = parse_ls_line("-rw-r--r-- root root 1024 2015-01-01 10:00 a.txt\r").unwrap();
        assert_eq!(e.name, "a.txt");
    }
}
