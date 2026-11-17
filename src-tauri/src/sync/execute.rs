//! Preview a sync plan, then carry it out. Deletes on the phone still
//! refuse critical system paths. Does not show the copy conflict dialogs.

use std::collections::HashMap;
use crate::adb::get_adb_command;
use crate::phone::is_critical_system_path;
use crate::platform::set_creation_time;
use super::model::*;
use super::plan::*;
use super::scan::*;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;


// Preview sync: compute what would happen without executing
#[tauri::command]
pub(crate) async fn preview_sync(
    app: tauri::AppHandle,
    window: tauri::Window,
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

    let mut reporter = ScanReporter::new(window);
    let local_files = scan_local_files(options.local_path.clone(), recursive, options.match_mode.clone(), patterns.clone(), &mut reporter)?;
    let device_files = scan_device_files(
        app,
        device_id,
        options.device_path.clone(),
        recursive,
        options.match_mode.clone(),
        patterns,
        missing_phone_folder_is_ok(&options.direction),
        &mut reporter,
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

    let actions = filter_sync_actions(
        compute_sync_actions(&local_files, &device_files, &options.direction, options.delete_missing, &options.match_mode),
        options.allow_copy,
        options.allow_update,
        options.allow_rename,
        options.delete_missing,
    );

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
pub(crate) async fn execute_sync(
    app: tauri::AppHandle,
    window: tauri::Window,
    device_id: String,
    options: SyncOptions,
) -> Result<SyncResult, String> {
    if is_critical_system_path(&options.device_path) {
        return Err(format!("Cannot sync to critical system path: {}", options.device_path));
    }

    let patterns = normalize_patterns(&options.file_patterns, &options.device_path);
    // Force recursive when patterns contain path separators
    let recursive = options.recursive || patterns.iter().any(|p| p.contains('/'));

    let mut reporter = ScanReporter::new(window.clone());
    let local_files = scan_local_files(options.local_path.clone(), recursive, options.match_mode.clone(), patterns.clone(), &mut reporter)?;
    let device_files = scan_device_files(
        app.clone(),
        device_id.clone(),
        options.device_path.clone(),
        recursive,
        options.match_mode.clone(),
        patterns,
        missing_phone_folder_is_ok(&options.direction),
        &mut reporter,
    ).await?;

    let actions = filter_sync_actions(
        compute_sync_actions(&local_files, &device_files, &options.direction, options.delete_missing, &options.match_mode),
        options.allow_copy,
        options.allow_update,
        options.allow_rename,
        options.delete_missing,
    );

    // Build timestamp lookup maps for preserving file modification times
    let device_mtime_map: HashMap<String, u64> = device_files.iter()
        .map(|f| (f.relative_path.clone(), f.modified_time))
        .collect();
    let local_mtime_map: HashMap<String, u64> = local_files.iter()
        .map(|f| (f.relative_path.clone(), f.modified_time))
        .collect();

    let total_count = actions.len() as u32;
    let total_bytes: u64 = actions
        .iter()
        .filter(|a| a.action_type == "copy" || a.action_type == "update")
        .map(|a| a.size)
        .sum();

    let mut tally = SyncTally::default();
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
                                // Set creation/birth time on macOS to match the source file
                                let _ = set_creation_time(&std::path::PathBuf::from(&local_file), mtime);
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

                    const MAX_PUSH_ATTEMPTS: u32 = 3;
                    let mut push_result = Err("Push not attempted".to_string());
                    for attempt in 1..=MAX_PUSH_ATTEMPTS {
                        let output = shell
                            .command(&adb_cmd)
                            .args(["-s", &device_id, "push", local_file.to_str().unwrap_or(""), &device_file])
                            .output()
                            .await;

                        push_result = match output {
                            Ok(o) if o.status.success() => Ok(()),
                            Ok(o) => Err(format!("Push failed: {}", String::from_utf8_lossy(&o.stderr))),
                            Err(e) => Err(format!("Push error: {}", e)),
                        };

                        if push_result.is_ok() || attempt == MAX_PUSH_ATTEMPTS {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500 * attempt as u64)).await;
                    }

                    match push_result {
                        Ok(()) => {
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
                        Err(e) => Err(e),
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
                tally.record_success(&action.action_type);
                if action.action_type == "copy" || action.action_type == "update" {
                    completed_bytes += action.size;
                }
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
        success_count: tally.success_count,
        copied_count: tally.copied_count,
        updated_count: tally.updated_count,
        renamed_count: tally.renamed_count,
        deleted_count: tally.deleted_count,
        skip_count,
        error_count,
        errors,
    })
}

