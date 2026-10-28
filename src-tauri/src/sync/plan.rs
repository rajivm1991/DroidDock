//! Decide copy, update, rename, and delete actions from two file lists.
//! Filename mode uses size and time; content mode uses MD5.

use std::collections::HashMap;
use super::model::*;


// Compute sync actions from two file lists
pub(crate) fn compute_sync_actions(
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
pub(crate) fn compute_sync_actions_by_content(
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


// Apply the per-action-type toggles to a computed action list.
// Delete is governed by `delete_missing` in the diff itself, so it is never filtered here.
// A disallowed rename is downgraded to a copy under the new name (plus a delete of the old name when
// `delete_missing` is on), which matches what filename matching produces for a renamed file.
pub(crate) fn filter_sync_actions(
    actions: Vec<SyncAction>,
    allow_copy: bool,
    allow_update: bool,
    allow_rename: bool,
    delete_missing: bool,
) -> Vec<SyncAction> {
    let mut expanded: Vec<SyncAction> = Vec::with_capacity(actions.len());
    for action in actions {
        if action.action_type == "rename" && !allow_rename {
            if let Some(old_path) = action.rename_from.clone() {
                if delete_missing {
                    expanded.push(SyncAction {
                        file_path: old_path,
                        action_type: "delete".to_string(),
                        direction: action.direction.replace('\u{2192}', "\u{2716}"),
                        size: action.size,
                        reason: "Old name of a renamed file, will be deleted".to_string(),
                        rename_from: None,
                    });
                }
                expanded.push(SyncAction {
                    action_type: "copy".to_string(),
                    reason: "Rename disabled, file copied under its new name".to_string(),
                    rename_from: None,
                    ..action
                });
                continue;
            }
        }
        expanded.push(action);
    }

    expanded
        .into_iter()
        .filter(|a| match a.action_type.as_str() {
            "copy" => allow_copy,
            "update" => allow_update,
            _ => true,
        })
        .collect()
}

