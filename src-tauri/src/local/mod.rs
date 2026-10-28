//! This Mac folder: list, search, storage, folder picker, and Finder reveal.
//! Permission errors stay worded for the Allow access screen.

use crate::model::{FileEntry, StorageInfo};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri_plugin_shell::ShellExt;


/// Mac custom/built-in presets should hide deleted folders but still show TCC-blocked
/// Desktop/Documents/Downloads (Grant access handles open). True when metadata says
/// directory, or when access is denied (likely still a real folder). False when missing
/// or clearly not a directory.
#[tauri::command]
pub(crate) fn local_path_is_dir(path: String) -> bool {
    let root = std::path::Path::new(&path);
    match fs::metadata(root) {
        Ok(meta) => meta.is_dir(),
        Err(err) if io_permission_denied(&err) => true,
        Err(_) => false,
    }
}


/// Context “New folder” on This Mac needs a local mkdir. Create one directory under
/// parent (name only). Does not create parents, or replace an existing file/folder.
#[tauri::command]
pub(crate) fn create_local_folder(parent_path: String, name: String) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Enter a folder name.".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\0') || trimmed == "." || trimmed == ".." {
        return Err("That folder name is not allowed.".to_string());
    }
    let full = std::path::Path::new(&parent_path).join(trimmed);
    if full.exists() {
        return Err(format!("“{}” already exists.", trimmed));
    }
    fs::create_dir(&full).map_err(|e| local_fs_error_message(&full.to_string_lossy(), e))?;
    Ok(full.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn get_local_storage_info(path: String) -> Result<StorageInfo, String> {
    local_storage_info_for_path(&path)
}


pub(crate) fn local_storage_info_for_path(path: &str) -> Result<StorageInfo, String> {
    use std::ffi::CString;
    use std::mem::MaybeUninit;

    let c_path =
        CString::new(path).map_err(|_| "That Mac folder path cannot be read for free space.".to_string())?;
    let mut raw = MaybeUninit::<libc::statvfs>::uninit();
    let rc = unsafe { libc::statvfs(c_path.as_ptr(), raw.as_mut_ptr()) };
    if rc != 0 {
        return Err(format!(
            "Could not read free space for {}: {}",
            path,
            std::io::Error::last_os_error()
        ));
    }
    let stat = unsafe { raw.assume_init() };
    let block = if stat.f_frsize > 0 {
        stat.f_frsize as u64
    } else {
        stat.f_bsize as u64
    };
    if block == 0 {
        return Err("Could not read free space for that Mac folder.".to_string());
    }
    let total_bytes = stat.f_blocks as u64 * block;
    let free_bytes = stat.f_bavail as u64 * block;
    let used_bytes = total_bytes.saturating_sub(stat.f_bfree as u64 * block);
    let percentage_used = if total_bytes > 0 {
        (used_bytes as f64 / total_bytes as f64) * 100.0
    } else {
        0.0
    };
    Ok(StorageInfo {
        total_bytes,
        used_bytes,
        free_bytes,
        percentage_used,
    })
}


/// Mac context menu and post-download “Show in Finder” both need Finder. Open a
/// folder so its contents show, or select a file with `open -R` so Finder highlights
/// it (plain `open` would launch the default app). This does not copy, rename, or
/// change DroidDock’s current folder.
#[tauri::command]
pub(crate) async fn reveal_in_finder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let shell = app.shell();
    let is_dir = std::path::Path::new(&path).is_dir();
    let output = if is_dir {
        shell.command("open").args([&path]).output().await
    } else {
        shell.command("open").args(["-R", &path]).output().await
    }
    .map_err(|e| format!("Could not open in Finder: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Could not open in Finder: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}


/// When one folder is blocked, some people prefer Full Disk Access so Desktop /
/// Documents / Downloads all work without picking each folder. Open System Settings at
/// Privacy → Full Disk Access (tries current Ventura+ URL, then the older Security
/// preference URL). Does not turn Full Disk Access on — the person still adds DroidDock
/// there.
#[tauri::command]
pub(crate) fn open_mac_full_disk_access_settings() -> Result<(), String> {
    let urls = [
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles",
        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
    ];
    for url in urls {
        match std::process::Command::new("/usr/bin/open").arg(url).status() {
            Ok(status) if status.success() => return Ok(()),
            Ok(_) => continue,
            Err(e) => return Err(format!("Could not open System Settings: {}", e)),
        }
    }
    Err("Could not open Full Disk Access in System Settings.".to_string())
}


/// The Mac start folder must skip a path macOS will not list (TCC on Desktop,
/// Documents, or Downloads). This helper is only that check. Return true when
/// `read_dir` succeeds on `path`. Does not choose among candidates, explain the error,
/// or grant access.
pub(crate) fn folder_is_listable(path: &std::path::Path) -> bool {
    fs::read_dir(path).is_ok()
}


/// macOS TCC often returns EPERM (os error 1) / "Operation not permitted"
/// rather than a normal PermissionDenied kind.
pub(crate) fn io_permission_denied(err: &std::io::Error) -> bool {
    matches!(err.kind(), std::io::ErrorKind::PermissionDenied)
        || err.raw_os_error() == Some(1)
        || {
            let detail = err.to_string();
            detail.contains("Operation not permitted")
                || detail.contains("os error 1")
                || detail.contains("Permission denied")
        }
}


pub(crate) fn io_not_a_directory(err: &std::io::Error) -> bool {
    err.kind() == std::io::ErrorKind::NotADirectory
        || err.to_string().to_lowercase().contains("not a directory")
}


pub(crate) fn local_fs_error_message(path: &str, err: std::io::Error) -> String {
    if io_permission_denied(&err) {
        format!(
            "PERMISSION_DENIED:macOS blocked “{}”. Grant access to this folder so DroidDock can open it — same idea as Finder asking for access.",
            path
        )
    } else {
        format!("Failed to read {}: {}", path, err)
    }
}


/// `Path::is_dir()` is false when metadata fails (including macOS TCC on Documents /
/// Desktop / Downloads). Double-click into a real folder then showed “Not a folder” and
/// an empty list even when Finder had files. Open with `read_dir` and map EPERM to the
/// Grant-access error. Does not grant TCC itself.
pub(crate) fn open_local_dir(path: &str) -> Result<fs::ReadDir, String> {
    match fs::read_dir(std::path::Path::new(path)) {
        Ok(rd) => Ok(rd),
        Err(e) if io_not_a_directory(&e) => Err(format!("Not a folder: {}", path)),
        Err(e) => Err(local_fs_error_message(path, e)),
    }
}


/// MacOS TCC blocks Desktop / Documents / Downloads until the person picks the folder
/// in an Open panel (or grants Full Disk Access). Returning an unreadable Downloads
/// path made the Mac pane look broken. Return the first listable candidate among
/// Downloads, home, Documents, Desktop. Prefers Downloads when macOS already allows it.
/// Does not grant TCC itself — that requires `pick_mac_folder` or System Settings.
#[tauri::command]
pub(crate) fn default_mac_folder() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let candidates = [
        format!("{}/Downloads", home),
        home.clone(),
        format!("{}/Documents", home),
        format!("{}/Desktop", home),
    ];
    for candidate in candidates {
        let path = std::path::Path::new(&candidate);
        if path.is_dir() && folder_is_listable(path) {
            return candidate;
        }
    }
    home
}


/// Mac place marks (HOME / DESK / DOC / DL) need the real home path, same idea as phone
/// ALL / CAM / SCR / DL. Return `$HOME` (or `/tmp` if unset). Does not check TCC or
/// pick a listable start folder (`default_mac_folder`).
#[tauri::command]
pub(crate) fn mac_home_folder() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string())
}


/// Picking a folder in NSOpenPanel is how macOS grants folder access for this app
/// (debug binary and release .app). The plugin dialog also works, but a dedicated
/// picker carries consumer copy about Allow access. Directory-only Open panel; optional
/// starting directory; returns path. Does not list the folder (caller calls
/// `list_local_directory`), or write security-scoped bookmarks yet (session grant from
/// the panel is enough to start).
#[tauri::command]
pub(crate) async fn pick_mac_folder(
    app: tauri::AppHandle,
    starting_path: Option<String>,
) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let start = starting_path;
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(pick_mac_folder_macos(start.as_deref()));
        })
        .map_err(|e| format!("Could not open the folder picker: {e}"))?;
        rx.recv()
            .map_err(|_| "The folder picker did not finish.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, starting_path);
        Err("Choosing a Mac folder this way is only available on Mac.".to_string())
    }
}


#[cfg(target_os = "macos")]
pub(crate) fn pick_mac_folder_macos(starting_path: Option<&str>) -> Result<Option<String>, String> {
    use crate::adb::finder_shows_all_files;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::{NSString, NSURL};

    let mtm = MainThreadMarker::new()
        .ok_or_else(|| "Folder picker must run on the main thread.".to_string())?;
    let panel = NSOpenPanel::openPanel(mtm);
    let title = NSString::from_str("Choose a Mac folder");
    let message = NSString::from_str(
        "Pick the folder to show beside your phone. macOS uses this choice to allow DroidDock to read that folder.",
    );
    let prompt = NSString::from_str("Grant access");
    panel.setCanChooseFiles(false);
    panel.setCanChooseDirectories(true);
    panel.setAllowsMultipleSelection(false);
    panel.setCanCreateDirectories(true);
    panel.setShowsHiddenFiles(finder_shows_all_files());
    panel.setTitle(Some(&title));
    panel.setMessage(Some(&message));
    panel.setPrompt(Some(&prompt));
    if let Some(start) = starting_path {
        if !start.is_empty() {
            let url = NSURL::fileURLWithPath(&NSString::from_str(start));
            panel.setDirectoryURL(Some(&url));
        }
    }
    let response = panel.runModal();
    if response != NSModalResponseOK {
        return Ok(None);
    }
    let url = panel.URL().ok_or_else(|| "No folder was selected.".to_string())?;
    let path = url
        .path()
        .ok_or_else(|| "Could not read that folder path.".to_string())?;
    Ok(Some(path.to_string()))
}


/// Choosing a download folder in a dialog every time hid the Mac. The pane lists a real
/// folder so Download can drop files there, and so files on the Mac can be sent to the
/// phone without a separate picker. `list_local_files` stays the sync scanner. This one
/// is a single level, shaped like the phone listing (name, size in bytes, directory
/// flag). :is_dir()` / skip on metadata errors: under Documents, a failed stat used to
/// look like “Not a folder” or drop every child, so double-click showed empty even when
/// Finder had files (e.g. tutorial `images` with spaced PNG names). Prefer `read_dir` +
/// `file_type()`; keep rows when size/date stat fails. Permission errors use the
/// `PERMISSION_DENIED:` prefix for the Mac pane UI.
#[tauri::command]
pub(crate) fn list_local_directory(path: String, show_hidden: bool) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();
    for entry in open_local_dir(&path)? {
        let entry = entry.map_err(|e| local_fs_error_message(&path, e))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let file_type = entry.file_type().ok();
        let metadata = entry.metadata().ok();
        let is_directory = match file_type {
            Some(ft) if ft.is_dir() => true,
            Some(ft) if ft.is_symlink() => metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            Some(ft) if ft.is_file() => false,
            Some(_) => metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
            None => metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false),
        };
        let (size, date) = match metadata {
            Some(m) => {
                let modified = m
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs())
                    .unwrap_or(0);
                (m.len().to_string(), format_unix_date(modified))
            }
            None => ("0".to_string(), String::new()),
        };
        let extension = std::path::Path::new(&name)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_string());
        entries.push(FileEntry {
            name,
            permissions: String::new(),
            size,
            date,
            is_directory,
            extension,
        });
    }
    entries.sort_by(|a, b| {
        b.is_directory
            .cmp(&a.is_directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}


#[derive(Serialize)]
pub(crate) struct LocalListedFile {
    absolute_path: String,
    relative_path: String,
    size: u64,
}


/// Mac pane “Search subfolders” mirrors phone search without ADB. Walk under `path`,
/// match names containing `pattern` (case-insensitive), return FileEntry rows (name =
/// path relative to the search root). Does not follow symlinks, or search outside
/// `path`.
#[tauri::command]
pub(crate) fn search_local_files(
    path: String,
    pattern: String,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    let needle = pattern.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let root = PathBuf::from(&path);
    // Same TCC pitfall as list_local_directory — do not use Path::is_dir().
    open_local_dir(&path)?;
    let mut matches = Vec::new();
    for entry in walkdir::WalkDir::new(&root).follow_links(false).into_iter() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        if !name.to_lowercase().contains(&needle) {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| format!("Path error: {}", e))?
            .to_string_lossy()
            .replace('\\', "/");
        if rel.is_empty() {
            continue;
        }
        if !show_hidden && rel.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        let extension = std::path::Path::new(&name)
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_string());
        matches.push(FileEntry {
            name: rel,
            permissions: String::new(),
            size: if metadata.is_dir() {
                "0".to_string()
            } else {
                metadata.len().to_string()
            },
            date: format_unix_date(modified),
            is_directory: metadata.is_dir(),
            extension,
        });
        if matches.len() >= 500 {
            break;
        }
    }
    Ok(matches)
}


/// "To phone" and a drag from the Mac pane must send the files inside a folder, not the
/// folder name alone. The sync scanner returns a different shape and applies sync
/// filters, so the pane should not reuse it. Walks one Mac folder and returns each
/// file's absolute path, path relative to that folder, and size in bytes. Hidden names
/// are skipped unless `show_hidden` is set. Symlinks are not followed. Does not return
/// directories, and does not cap the walk. A huge folder blocks until the walk
/// finishes; the UI waits before it opens the queue. relative paths use `/` even if a
/// name contained a backslash, which is enough for the phone path we join later.
#[tauri::command]
pub(crate) fn list_local_files_under(path: String, show_hidden: bool) -> Result<Vec<LocalListedFile>, String> {
    let root = PathBuf::from(&path);
    // Same TCC pitfall as list_local_directory — do not use Path::is_dir().
    open_local_dir(&path)?;
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&root).follow_links(false).into_iter() {
        let entry = entry.map_err(|e| format!("Failed to read {}: {}", path, e))?;
        if entry.file_type().is_dir() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map_err(|e| format!("Path error: {}", e))?
            .to_string_lossy()
            .replace('\\', "/");
        if rel.is_empty() {
            continue;
        }
        if !show_hidden && rel.split('/').any(|part| part.starts_with('.')) {
            continue;
        }
        let size = entry.metadata().map(|meta| meta.len()).unwrap_or(0);
        files.push(LocalListedFile {
            absolute_path: entry.path().to_string_lossy().to_string(),
            relative_path: rel,
            size,
        });
    }
    Ok(files)
}


/// Calendar date from a unix timestamp, without adding the chrono crate.
/// The phone listing already shows dates as text, so the Mac pane matches that.
pub(crate) fn format_unix_date(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", year, m, d)
}

