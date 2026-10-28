//! Backend commands for DroidDock. Feature modules own the ADB, phone,
//! Mac, transfer, and sync work. This file only wires the Tauri app and
//! the command list the UI calls. Command behavior is unchanged from when
//! it all lived in this file.

mod adb;
mod local;
mod media;
mod model;
mod phone;
mod platform;
mod setup;
mod sync;
mod transfer;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            adb::get_devices,
            phone::list_files,
            phone::detect_storage_path,
            adb::check_adb,
            adb::set_adb_path,
            adb::validate_adb_path,
            adb::pick_adb_location,
            setup::probe_adb_setup,
            setup::install_adb_tools,
            adb::get_current_adb_path,
            media::get_thumbnail,
            media::get_local_thumbnail,
            phone::delete_file,
            phone::create_phone_folder,
            local::create_local_folder,
            phone::rename_file,
            phone::search_files,
            phone::get_storage_info,
            local::get_local_storage_info,
            transfer::download_file,
            phone::list_files_recursive,
            local::reveal_in_finder,
            local::open_mac_full_disk_access_settings,
            transfer::upload_file,
            transfer::cancel_transfer,
            transfer::check_local_destinations,
            phone::check_phone_destinations,
            transfer::remove_local_path,
            phone::phone_tree_has_pruned_dirs,
            media::preview_file,
            sync::list_local_files,
            local::list_local_directory,
            local::search_local_files,
            local::list_local_files_under,
            phone::phone_path_exists,
            local::local_path_is_dir,
            local::default_mac_folder,
            local::mac_home_folder,
            local::pick_mac_folder,
            sync::list_device_files_for_sync,
            sync::preview_sync,
            sync::execute_sync,
            sync::list_saved_syncs,
            sync::save_sync_config,
            sync::delete_saved_sync
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::Duration;
    use crate::local::{format_unix_date, list_local_directory, open_local_dir};
    use crate::sync::{
        compute_sync_actions, compute_sync_actions_by_content, count_newlines,
        filter_sync_actions, matches_any_pattern, normalize_patterns, should_emit_scan_progress,
        FileMetadata, SyncDirection, SyncTally,
    };
    use crate::transfer::numbered_file_name;


    #[test]
    fn unix_epoch_formats_as_new_years_day() {
        assert_eq!(format_unix_date(0), "1970-01-01");
    }

    /// Tutorial `images` folders often use names like `1. foo.png`; listing must keep
    /// those rows (and not treat the folder as missing via is_dir).
    #[test]
    fn list_local_directory_keeps_spaced_image_names() {
        let root = std::env::temp_dir().join(format!(
            "droiddock-list-local-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temp dir");
        fs::write(root.join("1. connect_to_server.png"), b"png").expect("write");
        fs::create_dir(root.join("nested")).expect("nested dir");
        let listed =
            list_local_directory(root.to_string_lossy().to_string(), false).expect("list");
        let _ = fs::remove_dir_all(&root);
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|e| e.name == "1. connect_to_server.png" && !e.is_directory));
        assert!(listed.iter().any(|e| e.name == "nested" && e.is_directory));
    }

    #[test]
    fn open_local_dir_rejects_a_file_as_not_a_folder() {
        let file = std::env::temp_dir().join(format!(
            "droiddock-not-dir-{}",
            std::process::id()
        ));
        fs::write(&file, b"x").expect("write");
        let err = open_local_dir(&file.to_string_lossy()).expect_err("file is not a dir");
        let _ = fs::remove_file(&file);
        assert!(err.starts_with("Not a folder:"), "{err}");
    }

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

    // Helper to create a FileMetadata for testing
    fn make_file(path: &str, size: u64, mtime: u64, md5: Option<&str>) -> FileMetadata {
        FileMetadata {
            relative_path: path.to_string(),
            size,
            modified_time: mtime,
            is_directory: false,
            md5_hash: md5.map(|s| s.to_string()),
        }
    }

    // ========================
    // compute_sync_actions tests (filename-based)
    // ========================

    #[test]
    fn test_sync_phone_to_computer_copy_new_file() {
        let local = vec![];
        let device = vec![make_file("photo.jpg", 1000, 100, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, false, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "copy");
        assert_eq!(actions[0].file_path, "photo.jpg");
        assert!(actions[0].direction.contains("Computer"));
    }

    #[test]
    fn test_sync_computer_to_phone_copy_new_file() {
        let local = vec![make_file("doc.pdf", 2000, 200, None)];
        let device = vec![];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::ComputerToPhone, false, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "copy");
        assert_eq!(actions[0].file_path, "doc.pdf");
        assert!(actions[0].direction.contains("Phone"));
    }

    #[test]
    fn test_sync_update_newer_file() {
        let local = vec![make_file("file.txt", 100, 50, None)];
        let device = vec![make_file("file.txt", 200, 100, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, false, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "update");
    }

    #[test]
    fn test_sync_no_action_when_identical() {
        let local = vec![make_file("file.txt", 100, 100, None)];
        let device = vec![make_file("file.txt", 100, 100, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, false, "filename");
        assert_eq!(actions.len(), 0);
    }

    #[test]
    fn test_sync_delete_missing_phone_to_computer() {
        let local = vec![make_file("old.txt", 100, 50, None)];
        let device = vec![];
        // delete_missing=true: local file not on device → delete locally
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, true, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "delete");
        assert!(actions[0].direction.contains("Computer"));
    }

    #[test]
    fn test_sync_no_delete_when_flag_off() {
        let local = vec![make_file("old.txt", 100, 50, None)];
        let device = vec![];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, false, "filename");
        assert_eq!(actions.len(), 0);
    }

    #[test]
    fn test_sync_delete_missing_computer_to_phone() {
        let local = vec![];
        let device = vec![make_file("orphan.txt", 100, 50, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::ComputerToPhone, true, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "delete");
        assert!(actions[0].direction.contains("Phone"));
    }

    #[test]
    fn test_sync_both_ways_copies_unique_files() {
        let local = vec![make_file("local_only.txt", 100, 50, None)];
        let device = vec![make_file("device_only.txt", 200, 60, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::BothWays, false, "filename");
        assert_eq!(actions.len(), 2);
        let types: Vec<&str> = actions.iter().map(|a| a.action_type.as_str()).collect();
        assert!(types.contains(&"copy"));
    }

    #[test]
    fn test_sync_both_ways_conflict_newer_wins() {
        let local = vec![make_file("file.txt", 100, 200, None)];
        let device = vec![make_file("file.txt", 200, 100, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::BothWays, false, "filename");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "update");
        // Local is newer (mtime 200 > 100), should push to phone
        assert!(actions[0].direction.contains("Phone"));
    }

    // ========================
    // compute_sync_actions_by_content tests (MD5-based)
    // ========================

    #[test]
    fn test_content_sync_identical_files_no_action() {
        let local = vec![make_file("file.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("file.txt", 100, 50, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        assert_eq!(actions.len(), 0);
    }

    #[test]
    fn test_content_sync_rename_detection() {
        // Same hash, different path → rename
        let local = vec![make_file("old_name.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("new_name.txt", 100, 60, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "rename");
        assert!(actions[0].rename_from.is_some());
    }

    #[test]
    fn test_content_sync_copy_unique_file() {
        let local = vec![];
        let device = vec![make_file("new.txt", 100, 50, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "copy");
        assert!(actions[0].direction.contains("Computer"));
    }

    #[test]
    fn test_content_sync_delete_missing() {
        let local = vec![make_file("orphan.txt", 100, 50, Some("abc123"))];
        let device = vec![];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, true);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "delete");
    }

    #[test]
    fn test_content_sync_no_delete_when_flag_off() {
        let local = vec![make_file("orphan.txt", 100, 50, Some("abc123"))];
        let device = vec![];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        assert_eq!(actions.len(), 0);
    }

    #[test]
    fn test_content_sync_both_ways_rename_uses_newer() {
        let local = vec![make_file("a.txt", 100, 200, Some("abc123"))];
        let device = vec![make_file("b.txt", 100, 100, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::BothWays, false);
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "rename");
        // Local is newer, so device should be renamed to match local
        assert!(actions[0].direction.contains("Phone"));
        assert_eq!(actions[0].file_path, "a.txt");
    }

    // ========================
    // filter_sync_actions tests
    // ========================

    #[test]
    fn test_filter_drops_copy_when_disallowed() {
        let device = vec![make_file("new.txt", 100, 50, None)];
        let actions = compute_sync_actions(&[], &device, &SyncDirection::PhoneToComputer, false, "filename");
        let filtered = filter_sync_actions(actions, false, true, true, false);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_filter_drops_update_when_disallowed() {
        let local = vec![make_file("file.txt", 100, 50, None)];
        let device = vec![make_file("file.txt", 200, 100, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, false, "filename");
        let filtered = filter_sync_actions(actions, true, false, true, false);
        assert!(filtered.is_empty());
    }

    #[test]
    fn test_filter_keeps_everything_when_all_allowed() {
        let local = vec![make_file("changed.txt", 100, 50, None), make_file("orphan.txt", 100, 50, None)];
        let device = vec![make_file("changed.txt", 200, 100, None), make_file("new.txt", 100, 50, None)];
        let actions = compute_sync_actions(&local, &device, &SyncDirection::PhoneToComputer, true, "filename");
        let expected = actions.len();
        let filtered = filter_sync_actions(actions, true, true, true, true);
        assert_eq!(filtered.len(), expected);
        assert_eq!(expected, 3);
    }

    #[test]
    fn test_filter_delete_unaffected_by_other_flags() {
        let local = vec![make_file("orphan.txt", 100, 50, None)];
        let actions = compute_sync_actions(&local, &[], &SyncDirection::PhoneToComputer, true, "filename");
        let filtered = filter_sync_actions(actions, false, false, false, true);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].action_type, "delete");
    }

    #[test]
    fn test_filter_keeps_rename_when_allowed() {
        let local = vec![make_file("old_name.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("new_name.txt", 100, 60, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        let filtered = filter_sync_actions(actions, true, true, true, false);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].action_type, "rename");
    }

    #[test]
    fn test_filter_rename_becomes_copy_when_disallowed() {
        let local = vec![make_file("old_name.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("new_name.txt", 100, 60, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        let filtered = filter_sync_actions(actions, true, true, false, false);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].action_type, "copy");
        assert_eq!(filtered[0].file_path, "new_name.txt");
        assert!(filtered[0].direction.contains("Computer"));
        assert!(filtered[0].rename_from.is_none());
        assert_eq!(filtered[0].size, 100);
    }

    #[test]
    fn test_filter_rename_becomes_copy_and_delete_with_delete_missing() {
        let local = vec![make_file("old_name.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("new_name.txt", 100, 60, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, true);
        let filtered = filter_sync_actions(actions, true, true, false, true);
        assert_eq!(filtered.len(), 2);
        let copy = filtered.iter().find(|a| a.action_type == "copy").unwrap();
        assert_eq!(copy.file_path, "new_name.txt");
        let delete = filtered.iter().find(|a| a.action_type == "delete").unwrap();
        assert_eq!(delete.file_path, "old_name.txt");
        assert!(delete.direction.contains("Computer"));
        assert!(delete.direction.starts_with('\u{2716}'));
    }

    #[test]
    fn test_filter_rename_to_phone_deletes_on_phone() {
        let local = vec![make_file("a.txt", 100, 200, Some("abc123"))];
        let device = vec![make_file("b.txt", 100, 100, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::ComputerToPhone, true);
        let filtered = filter_sync_actions(actions, true, true, false, true);
        let copy = filtered.iter().find(|a| a.action_type == "copy").unwrap();
        assert_eq!(copy.file_path, "a.txt");
        assert!(copy.direction.contains("Phone"));
        let delete = filtered.iter().find(|a| a.action_type == "delete").unwrap();
        assert_eq!(delete.file_path, "b.txt");
        assert!(delete.direction.contains("Phone"));
    }

    #[test]
    fn test_filter_rename_disallowed_and_copy_disallowed_drops_converted_copy() {
        let local = vec![make_file("old_name.txt", 100, 50, Some("abc123"))];
        let device = vec![make_file("new_name.txt", 100, 60, Some("abc123"))];
        let actions = compute_sync_actions_by_content(&local, &device, &SyncDirection::PhoneToComputer, false);
        let filtered = filter_sync_actions(actions, false, true, false, false);
        assert!(filtered.is_empty());
    }

    // ========================
    // SyncTally tests
    // ========================

    #[test]
    fn test_tally_counts_each_action_type() {
        let mut tally = SyncTally::default();
        for t in ["copy", "copy", "copy", "update", "update", "rename", "delete"] {
            tally.record_success(t);
        }
        assert_eq!(tally.copied_count, 3);
        assert_eq!(tally.updated_count, 2);
        assert_eq!(tally.renamed_count, 1);
        assert_eq!(tally.deleted_count, 1);
        assert_eq!(tally.success_count, 7);
    }

    #[test]
    fn test_tally_success_count_equals_sum_of_types() {
        let mut tally = SyncTally::default();
        for t in ["copy", "update", "rename", "delete", "copy"] {
            tally.record_success(t);
        }
        assert_eq!(
            tally.success_count,
            tally.copied_count + tally.updated_count + tally.renamed_count + tally.deleted_count
        );
    }

    // ========================
    // scan progress throttle tests
    // ========================

    #[test]
    fn test_should_emit_first_report() {
        assert!(should_emit_scan_progress(None, std::time::Instant::now(), Duration::from_millis(150)));
    }

    #[test]
    fn test_should_not_emit_within_interval() {
        let last = std::time::Instant::now();
        let now = last + Duration::from_millis(50);
        assert!(!should_emit_scan_progress(Some(last), now, Duration::from_millis(150)));
    }

    #[test]
    fn test_should_emit_after_interval() {
        let last = std::time::Instant::now();
        let now = last + Duration::from_millis(150);
        assert!(should_emit_scan_progress(Some(last), now, Duration::from_millis(150)));
    }

    #[test]
    fn test_count_newlines() {
        assert_eq!(count_newlines(b""), 0);
        assert_eq!(count_newlines(b"a|b\nc|d\ne"), 2);
    }

    #[test]
    fn test_numbered_file_name_with_extension() {
        assert_eq!(numbered_file_name("photo.jpg", 1), "photo (1).jpg");
        assert_eq!(numbered_file_name("photo.jpg", 12), "photo (12).jpg");
    }

    #[test]
    fn test_numbered_file_name_without_extension() {
        assert_eq!(numbered_file_name("README", 3), "README (3)");
    }

    #[test]
    fn test_numbered_file_name_dotfile() {
        // ".nomedia" has no stem/extension split we care about; Path::file_stem
        // returns ".nomedia", so the counter goes at the end.
        assert_eq!(numbered_file_name(".nomedia", 1), ".nomedia (1)");
    }
}
