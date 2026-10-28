//! Walk the Mac folder and the phone folder before a sync, including
//! optional content hashes and file-pattern filters.

use std::collections::HashMap;
use crate::adb::get_adb_command;
use crate::model::FileEntry;
use crate::phone::parse_ls_line;
use super::model::*;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;


pub(crate) fn compute_local_md5(path: &std::path::Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut context = md5::Context::new();
    let mut buffer = [0u8; 8192];
    loop {
        let bytes_read = file.read(&mut buffer).ok()?;
        if bytes_read == 0 {
            break;
        }
        context.consume(&buffer[..bytes_read]);
    }
    Some(format!("{:x}", context.compute()))
}


/// Returns true if a file/directory should be excluded from sync operations.
pub(crate) fn is_sync_excluded(name: &str) -> bool {
    // macOS AppleDouble resource fork files (e.g. "._IMG001.jpg")
    if name.starts_with("._") {
        return true;
    }
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
pub(crate) fn normalize_patterns(patterns: &[String], device_path: &str) -> Vec<String> {
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


pub(crate) fn matches_any_pattern(rel_path: &str, patterns: &[String]) -> bool {
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
pub(crate) fn list_local_files(path: String, recursive: bool, match_mode: String, file_patterns: Vec<String>) -> Result<Vec<FileMetadata>, String> {
    scan_local_files(path, recursive, match_mode, file_patterns, &mut ScanReporter::none())
}


pub(crate) fn scan_local_files(
    path: String,
    recursive: bool,
    match_mode: String,
    file_patterns: Vec<String>,
    reporter: &mut ScanReporter,
) -> Result<Vec<FileMetadata>, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("Local path does not exist: {}", path));
    }

    let mut result = Vec::new();
    // Every entry visited, including ones the patterns filter out, so the counter keeps moving on big trees
    let mut visited: u32 = 0;

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
            visited += 1;
            reporter.report("computer", "listing", visited, None);

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

            result.push(FileMetadata {
                relative_path: rel_path,
                size: metadata.len(),
                modified_time,
                is_directory: metadata.is_dir(),
                md5_hash: None,
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

            visited += 1;
            reporter.report("computer", "listing", visited, None);

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

            result.push(FileMetadata {
                relative_path: name,
                size: metadata.len(),
                modified_time,
                is_directory: metadata.is_dir(),
                md5_hash: None,
            });
        }
    }
    reporter.report_final("computer", "listing", visited, None);

    // Hash in a second pass, once the file count is known, so progress can show done / total
    if match_mode == "content" {
        let total = result.iter().filter(|f| !f.is_directory).count() as u32;
        let mut hashed: u32 = 0;
        for file in result.iter_mut().filter(|f| !f.is_directory) {
            file.md5_hash = compute_local_md5(&root.join(&file.relative_path));
            hashed += 1;
            reporter.report("computer", "hashing", hashed, Some(total));
        }
        reporter.report_final("computer", "hashing", hashed, Some(total));
    }

    Ok(result)
}


// List files on the Android device for sync
#[tauri::command]
pub(crate) async fn list_device_files_for_sync(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
    recursive: bool,
    match_mode: String,
    file_patterns: Vec<String>,
) -> Result<Vec<FileMetadata>, String> {
    scan_device_files(app, device_id, path, recursive, match_mode, file_patterns, &mut ScanReporter::none()).await
}


// Hash device files one adb call at a time, reporting done / total as it goes.
// `full_paths` maps each relative path to the absolute device path to hash.
pub(crate) async fn hash_device_files(
    app: &tauri::AppHandle,
    device_id: &str,
    files: &mut [FileMetadata],
    full_paths: &HashMap<String, String>,
    reporter: &mut ScanReporter,
) {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let total = files.iter().filter(|f| !f.is_directory).count() as u32;
    let mut hashed: u32 = 0;

    for file in files.iter_mut().filter(|f| !f.is_directory) {
        if let Some(full_path) = full_paths.get(&file.relative_path) {
            let escaped_file = full_path.replace("'", "'\\''");
            let md5_cmd = format!("md5sum '{}' 2>/dev/null", escaped_file);
            let md5_output = shell
                .command(&adb_cmd)
                .args(["-s", device_id, "shell", &md5_cmd])
                .output()
                .await
                .ok();
            file.md5_hash = md5_output.and_then(|o| {
                let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
                out.split_whitespace().next().map(|s| s.to_string())
            });
        }
        hashed += 1;
        reporter.report("phone", "hashing", hashed, Some(total));
    }
    reporter.report_final("phone", "hashing", hashed, Some(total));
}


pub(crate) async fn scan_device_files(
    app: tauri::AppHandle,
    device_id: String,
    path: String,
    recursive: bool,
    match_mode: String,
    file_patterns: Vec<String>,
    reporter: &mut ScanReporter,
) -> Result<Vec<FileMetadata>, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();
    let escaped_path = path.replace("'", "'\\''");

    let mut result = Vec::new();
    // relative path -> absolute device path, used by the hashing pass
    let mut full_paths: HashMap<String, String> = HashMap::new();

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
        // Lines streamed so far across all scan_dirs, for the live "items found" count
        let mut listed_before: u32 = 0;
        for scan_dir in &scan_dirs {
            let escaped_scan_dir = scan_dir.replace("'", "'\\''");
            let find_stat_command = format!(
                "find '{}' -mindepth 1 \\( -type f -o -type d \\) -exec stat -c '%s|%Y|%F|%n' {{}} + 2>/dev/null",
                escaped_scan_dir
            );

            let (mut rx, _child) = shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &find_stat_command])
                .spawn()
                .map_err(|e| format!("Failed to list device files: {}", e))?;

            // Stream stdout instead of waiting for the whole listing, so the UI can show a live count
            let mut stdout_bytes: Vec<u8> = Vec::new();
            let mut dir_lines: u32 = 0;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(chunk) => {
                        dir_lines += count_newlines(&chunk);
                        stdout_bytes.extend_from_slice(&chunk);
                        reporter.report("phone", "listing", listed_before + dir_lines, None);
                    }
                    CommandEvent::Error(e) => return Err(format!("Failed to list device files: {}", e)),
                    CommandEvent::Terminated(_) => break,
                    _ => {}
                }
            }
            listed_before += dir_lines;
            reporter.report_final("phone", "listing", listed_before, None);

            let stdout = String::from_utf8_lossy(&stdout_bytes);

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

                if !is_dir {
                    full_paths.insert(rel_path.clone(), file_path.to_string());
                }

                result.push(FileMetadata {
                    relative_path: rel_path,
                    size,
                    modified_time: mtime,
                    is_directory: is_dir,
                    md5_hash: None,
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

        let entry_total = entries.len() as u32;
        for (index, entry) in entries.iter().enumerate() {
            reporter.report("phone", "listing", index as u32 + 1, Some(entry_total));

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

            if !entry.is_directory {
                full_paths.insert(entry.name.clone(), file_full_path.clone());
            }

            result.push(FileMetadata {
                relative_path: entry.name.clone(),
                size,
                modified_time: mtime,
                is_directory: entry.is_directory,
                md5_hash: None,
            });
        }
        reporter.report_final("phone", "listing", entry_total, Some(entry_total));
    }

    // Hash in a second pass, once the file count is known, so progress can show done / total
    if match_mode == "content" {
        hash_device_files(&app, &device_id, &mut result, &full_paths, reporter).await;
    }

    Ok(result)
}

