//! Copy one file either way, with cancel, progress events, and a temp
//! sibling so a failed copy does not destroy the file already at the destination.

use std::collections::HashSet;
use std::sync::Mutex;
use crate::adb::get_adb_command;
use crate::model::DestConflict;
use crate::phone::{phone_path_kind, unique_device_path};
use crate::platform::set_creation_time;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;


// Build "name (n).ext" for keep-both downloads.
pub(crate) fn numbered_file_name(file_name: &str, n: u32) -> String {
    let path = std::path::Path::new(file_name);
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_name);
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{} ({}).{}", stem, n, ext),
        None => format!("{} ({})", stem, n),
    }
}


// First non-existing "name (n).ext" sibling of `path`; `path` itself if free.
pub(crate) fn unique_local_path(path: &std::path::Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let parent = path.parent().unwrap_or_else(|| std::path::Path::new(""));
    let file_name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file");
    let mut n = 1u32;
    loop {
        let candidate = parent.join(numbered_file_name(file_name, n));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}


/// Replace used to write straight over the original, so a cancel or a failed copy left
/// the person with neither the old nor the new file. A hidden sibling name used while
/// bytes are in flight. `.name.droiddock-<nanos>.part` in the same folder, so the final
/// rename stays on one volume (atomic on the Mac; a plain `mv` on the phone). Does not
/// create the file or clean it up — callers own that.
pub(crate) fn temp_sibling_name(file_name: &str) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(".{}.droiddock-{}.part", file_name, nanos)
}


pub(crate) fn local_path_kind(path: &std::path::Path) -> &'static str {
    match fs::metadata(path) {
        Ok(meta) if meta.is_dir() => "directory",
        Ok(_) => "file",
        Err(_) => "missing",
    }
}


/// Check Mac destination paths for name conflicts (cheap; no ADB).
#[tauri::command]
pub(crate) fn check_local_destinations(paths: Vec<String>) -> Vec<DestConflict> {
    paths
        .into_iter()
        .map(|path| {
            let kind = local_path_kind(std::path::Path::new(&path)).to_string();
            DestConflict { path, kind }
        })
        .collect()
}


/// Replace-folder on This Mac must clear the existing folder before copy. Delete a file
/// or directory tree on the Mac. Does not touch the phone or move to Trash (permanent
/// remove, like overwrite).
#[tauri::command]
pub(crate) fn remove_local_path(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Could not remove folder: {}", e))?;
    } else {
        fs::remove_file(p).map_err(|e| format!("Could not remove file: {}", e))?;
    }
    Ok(())
}


// Transfer progress
//
// `adb pull` and `adb push` used to run to completion with `.output().await`. The UI
// could only say "Downloading 3 of 12: name" and closing that line did not stop the
// copy. Uploads showed no progress at all. Spawn adb, and while it runs emit
// `transfer-byte-progress` about five times a second. The React queue turns those
// events into overall percent, per-file bars, speed, elapsed time, and time left. The
// browser stays usable because the copy is just another command, not a modal. Cancel:
// the frontend calls `cancel_transfer` with the in-flight file id. This set is checked
// on each tick. The child is killed and a partial download is deleted so a cancelled
// pull does not leave a truncated file behind. Pause is handled in the UI between
// files: the current adb call is allowed to finish, then the queue waits. That matches
// Transmit, which pauses the queue rather than a single socket.
pub(crate) static TRANSFER_CANCEL: std::sync::LazyLock<Mutex<HashSet<String>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashSet::new()));


/// Byte update for one file. `transfer_id` matches the id the UI assigned
/// when it queued the file, so several files can share one listener.
#[derive(Clone, Serialize)]
pub(crate) struct TransferByteProgress {
    transfer_id: String,
    bytes: u64,
    total: u64,
}


/// Mark an in-flight transfer so `run_adb_with_progress` stops it.
/// Files still queued are cancelled by the UI without calling this.
#[tauri::command]
pub(crate) fn cancel_transfer(transfer_id: String) {
    if let Ok(mut set) = TRANSFER_CANCEL.lock() {
        set.insert(transfer_id);
    }
}


pub(crate) fn transfer_cancelled(transfer_id: &str) -> bool {
    TRANSFER_CANCEL
        .lock()
        .map(|set| set.contains(transfer_id))
        .unwrap_or(false)
}


pub(crate) fn clear_transfer_cancel(transfer_id: &str) {
    if let Ok(mut set) = TRANSFER_CANCEL.lock() {
        set.remove(transfer_id);
    }
}


/// Cancel pressed while a row was still Preparing (stat, name checks, Keep-both probes)
/// was lost — the command cleared the flag when it reached adb, so that file copied
/// anyway. A checkpoint used between prepare steps and before commit.
/// `Err("Cancelled")` once `cancel_transfer` has marked this id. The flag is never
/// cleared at the start of a transfer, only after the command ends (`download_file` /
/// `upload_file` wrappers). Ids are unique per job (`<direction>-<job
/// timestamp>-<row>`), so a late cancel for an old row can never match a later job.
/// Does not delete anything; callers remove their own temp file.
pub(crate) fn ensure_not_cancelled(transfer_id: &str) -> Result<(), String> {
    if transfer_cancelled(transfer_id) {
        Err("Cancelled".to_string())
    } else {
        Ok(())
    }
}


pub(crate) fn last_percent(text: &str) -> Option<u64> {
    let idx = text.rfind('%')?;
    let bytes = text.as_bytes();
    let mut start = idx;
    while start > 0 && bytes[start - 1].is_ascii_digit() {
        start -= 1;
    }
    if start == idx {
        return None;
    }
    text[start..idx].parse().ok()
}


pub(crate) fn emit_transfer_progress(app: &tauri::AppHandle, transfer_id: &str, bytes: u64, total: u64) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(
            "transfer-byte-progress",
            TransferByteProgress {
                transfer_id: transfer_id.to_string(),
                bytes,
                total,
            },
        );
    }
}


/// Runs an adb pull or push and emits byte progress for `transfer_id`. Downloads
/// measure the destination file on disk, which grows while `adb pull` writes it.
/// Uploads have no local file to watch, so we periodically `stat` the path on the phone
/// and cache that size between polls. Both directions also parse the "45%" text adb
/// prints. Progress is monotonic: a tick that cannot measure yet must not emit 0 after
/// a real reading (that made upload bars jump to empty every few hundred ms).
/// `remote_device` is `(device id, device path)` and is set for uploads only.
pub(crate) async fn run_adb_with_progress(
    app: &tauri::AppHandle,
    args: Vec<&str>,
    transfer_id: &str,
    total: u64,
    local_file: Option<&std::path::Path>,
    remote_device: Option<(&str, &str)>,
) -> Result<(), String> {
    let adb_cmd = get_adb_command();
    let (mut rx, child) = app
        .shell()
        .command(&adb_cmd)
        .args(args)
        .spawn()
        .map_err(|e| format!("Failed to start transfer: {}", e))?;
    // `kill` takes ownership, so the child sits in an Option until cancel.
    let mut child = Some(child);

    let mut progress_text: Vec<u8> = Vec::new();
    let mut stderr: Vec<u8> = Vec::new();
    let mut exit_code: Option<i32> = None;
    let mut last_remote_stat = std::time::Instant::now() - Duration::from_secs(10);
    let mut cached_remote_bytes = 0u64;
    let mut best_bytes = 0u64;
    let mut last_emitted_bytes = 0u64;
    let mut last_emit_at = std::time::Instant::now() - Duration::from_secs(1);

    loop {
        if transfer_cancelled(transfer_id) {
            if let Some(child) = child.take() {
                let _ = child.kill();
            }
            if let Some(path) = local_file {
                let _ = fs::remove_file(path);
            }
            return Err("Cancelled".to_string());
        }

        let event = tokio::time::timeout(Duration::from_millis(150), rx.recv()).await;
        match event {
            Ok(Some(CommandEvent::Stdout(chunk))) => {
                progress_text.extend_from_slice(&chunk);
            }
            Ok(Some(CommandEvent::Stderr(chunk))) => {
                stderr.extend_from_slice(&chunk);
                progress_text.extend_from_slice(&chunk);
            }
            Ok(Some(CommandEvent::Error(err))) => {
                return Err(format!("Transfer failed: {}", err));
            }
            Ok(Some(CommandEvent::Terminated(payload))) => {
                exit_code = payload.code;
                break;
            }
            Ok(None) => break,
            // CommandEvent is non-exhaustive across tauri-plugin-shell versions.
            Ok(Some(_)) => {}
            Err(_) => {}
        }

        let mut sample = 0u64;
        if let Some(path) = local_file {
            if let Ok(meta) = fs::metadata(path) {
                sample = meta.len();
            }
        }
        if let Some((device_id, device_path)) = remote_device {
            // Polling every tick is slow; without a cache, ticks between stats used to
            // emit 0 and the UI bar snapped empty.
            if last_remote_stat.elapsed() >= Duration::from_millis(350) {
                last_remote_stat = std::time::Instant::now();
                let (remote_size, _) = device_file_stat(app, device_id, device_path).await;
                if let Some(remote_size) = remote_size {
                    cached_remote_bytes = cached_remote_bytes.max(remote_size);
                }
            }
            sample = sample.max(cached_remote_bytes);
        }
        if total > 0 {
            if let Ok(text) = std::str::from_utf8(&progress_text) {
                if let Some(pct) = last_percent(text) {
                    let from_pct = total.saturating_mul(pct.min(100)) / 100;
                    sample = sample.max(from_pct);
                }
            }
        }

        best_bytes = best_bytes.max(sample);
        let emit_bytes = if total > 0 {
            best_bytes.min(total)
        } else {
            best_bytes
        };

        // Emit when we advance, or at least ~4×/s so speed/ETA stay alive.
        let advanced = emit_bytes > last_emitted_bytes;
        if advanced || last_emit_at.elapsed() >= Duration::from_millis(250) {
            emit_transfer_progress(app, transfer_id, emit_bytes, total);
            last_emitted_bytes = emit_bytes;
            last_emit_at = std::time::Instant::now();
        }
    }

    if transfer_cancelled(transfer_id) {
        return Err("Cancelled".to_string());
    }

    if exit_code.unwrap_or(0) != 0 {
        let text = String::from_utf8_lossy(&stderr);
        if text.contains("does not exist") {
            return Err("File not found".to_string());
        } else if text.contains("Permission denied") {
            return Err("Permission denied".to_string());
        } else if text.contains("Read-only file system") {
            return Err("Read-only file system".to_string());
        }
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err("Transfer failed".to_string());
        }
        return Err(format!("Transfer failed: {}", trimmed));
    }

    let final_bytes = local_file
        .and_then(|path| fs::metadata(path).ok())
        .map(|meta| meta.len())
        .unwrap_or(total)
        .max(best_bytes)
        .max(total);
    emit_transfer_progress(app, transfer_id, final_bytes, total.max(final_bytes));
    Ok(())
}


pub(crate) async fn device_file_stat(
    app: &tauri::AppHandle,
    device_id: &str,
    device_path: &str,
) -> (Option<u64>, Option<u64>) {
    let adb_cmd = get_adb_command();
    let escaped_path = device_path.replace("'", "'\\''");
    let stat_command = format!("stat -c '%s %Y' '{}'", escaped_path);
    let output = app
        .shell()
        .command(&adb_cmd)
        .args(["-s", device_id, "shell", &stat_command])
        .output()
        .await
        .ok();
    let Some(output) = output else {
        return (None, None);
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut parts = text.split_whitespace();
    let size = parts.next().and_then(|v| v.parse().ok());
    let mtime = parts.next().and_then(|v| v.parse().ok());
    (size, mtime)
}


/// `adb pull` used to write over the original, and a cancel then deleted that path —
/// Replace + Cancel destroyed the old file. Pull into a hidden sibling
/// (`temp_sibling_name`), then rename onto the final name only after adb succeeds.
/// Replace renames over a file (atomic on one volume); Skip / Keep both re-check the
/// name at commit time. Cancel / failure removes only the temp file; the destination is
/// untouched. Cancel is honoured from the moment the row starts (see
/// `ensure_not_cancelled`); the cancel flag is cleared only when this returns. Does not
/// merge folders (UI handles folder policy before the queue runs), or ever rename over
/// a folder (that stays a "Type mismatch" error).
#[tauri::command]
pub(crate) async fn download_file(
    app: tauri::AppHandle,
    device_id: String,
    device_path: String,
    local_path: String,
    conflict_mode: String,
    transfer_id: Option<String>,
) -> Result<String, String> {
    let transfer_key = transfer_id.unwrap_or_else(|| format!("download-{}", local_path));
    let result = download_file_impl(
        &app,
        &device_id,
        &device_path,
        &local_path,
        &conflict_mode,
        &transfer_key,
    )
    .await;
    clear_transfer_cancel(&transfer_key);
    result
}


pub(crate) async fn download_file_impl(
    app: &tauri::AppHandle,
    device_id: &str,
    device_path: &str,
    local_path: &str,
    conflict_mode: &str,
    transfer_key: &str,
) -> Result<String, String> {
    let (remote_size, mtime) = device_file_stat(app, device_id, device_path).await;
    ensure_not_cancelled(transfer_key)?;

    // Resolve the destination according to the chosen conflict mode.
    let requested_path = std::path::PathBuf::from(local_path);
    let dest_kind = local_path_kind(&requested_path);
    let target_path = match conflict_mode {
        "skip" => {
            if dest_kind != "missing" {
                return Ok("skipped".to_string());
            }
            requested_path.clone()
        }
        "keepBoth" => unique_local_path(&requested_path),
        // "replace" and anything unknown: pull over the requested path.
        _ => {
            if dest_kind == "directory" {
                return Err(format!(
                    "Type mismatch: a folder named that already exists on This Mac ({})",
                    local_path
                ));
            }
            requested_path.clone()
        }
    };

    // Nested relative paths (folder downloads) need their parent dirs.
    let parent = target_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    fs::create_dir_all(&parent)
        .map_err(|e| format!("Failed to create destination folder: {}", e))?;
    let target_file_name = target_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid destination path".to_string())?
        .to_string();
    let temp_path = parent.join(temp_sibling_name(&target_file_name));
    let temp_path_str = temp_path
        .to_str()
        .ok_or_else(|| "Invalid destination path".to_string())?
        .to_string();

    ensure_not_cancelled(transfer_key)?;
    let total = remote_size.unwrap_or(0);
    emit_transfer_progress(app, transfer_key, 0, total);
    // `local_file` is the temp path: on cancel run_adb_with_progress deletes
    // only that, never the existing destination.
    if let Err(err) = run_adb_with_progress(
        app,
        vec!["-s", device_id, "pull", device_path, &temp_path_str],
        transfer_key,
        total,
        Some(temp_path.as_path()),
        None,
    )
    .await
    {
        let _ = fs::remove_file(&temp_path);
        return Err(if err == "File not found" {
            format!("File not found: {}", device_path)
        } else if err == "Permission denied" {
            format!("Permission denied: {}", device_path)
        } else {
            err
        });
    }

    // A cancel that landed after the last byte still wins: drop the temp file,
    // keep whatever was at the destination.
    if let Err(err) = ensure_not_cancelled(transfer_key) {
        let _ = fs::remove_file(&temp_path);
        return Err(err);
    }

    // Commit: decide the final name now that the bytes are safely on disk.
    let final_path = match conflict_mode {
        "skip" => {
            if local_path_kind(&target_path) != "missing" {
                let _ = fs::remove_file(&temp_path);
                return Ok("skipped".to_string());
            }
            target_path.clone()
        }
        "keepBoth" => unique_local_path(&target_path),
        _ => {
            if local_path_kind(&target_path) == "directory" {
                let _ = fs::remove_file(&temp_path);
                return Err(format!(
                    "Type mismatch: a folder named that already exists on This Mac ({})",
                    local_path
                ));
            }
            target_path.clone()
        }
    };
    if let Err(e) = fs::rename(&temp_path, &final_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Could not finish saving the file: {}", e));
    }
    let renamed = final_path != requested_path;

    // Set the modification time on the downloaded file to match the source
    if let Some(timestamp) = mtime {
        if final_path.exists() {
            let mtime_system = UNIX_EPOCH + Duration::from_secs(timestamp);
            let file = fs::File::open(&final_path)
                .map_err(|e| format!("Failed to open downloaded file: {}", e))?;

            file.set_modified(mtime_system)
                .map_err(|e| format!("Failed to set modification time: {}", e))?;

            // Set creation/birth time on macOS to match the source file
            let _ = set_creation_time(&final_path, timestamp);
        }
    }

    Ok(if renamed {
        "renamed".to_string()
    } else {
        "downloaded".to_string()
    })
}


/// Mac → phone used to always overwrite; Copy now shares skip / replace / keep-both
/// with downloads. `conflict_mode` (`skip` | `replace` | `keepBoth`) and a result
/// label. Resolve the phone path, create parent dirs, push to a hidden temp sibling,
/// then commit with one guarded shell `mv`, restore mtime. Replace commits only if the
/// name is not a folder (`mv` onto a folder would move the file *inside* it). Skip /
/// Keep both commit only if the name is still free; Keep both picks the next `name (n)`
/// if it was taken meanwhile. An unreadable existence answer ("unknown") never counts
/// as free. Cancel / failure removes the temp file only — the original stays. Cancel is
/// honoured from the moment the row starts (see `ensure_not_cancelled`); the cancel
/// flag is cleared only when this returns. Does not merge folder trees (UI rewrites
/// paths / deletes before the queue). Returns "skipped", "renamed", or "uploaded".
#[tauri::command]
pub(crate) async fn upload_file(
    app: tauri::AppHandle,
    device_id: String,
    local_path: String,
    device_path: String,
    conflict_mode: String,
    transfer_id: Option<String>,
) -> Result<String, String> {
    let transfer_key = transfer_id.unwrap_or_else(|| format!("upload-{}", local_path));
    let result = upload_file_impl(
        app,
        device_id,
        local_path,
        device_path,
        conflict_mode,
        transfer_key.clone(),
    )
    .await;
    clear_transfer_cancel(&transfer_key);
    result
}


pub(crate) async fn upload_file_impl(
    app: tauri::AppHandle,
    device_id: String,
    local_path: String,
    device_path: String,
    conflict_mode: String,
    transfer_key: String,
) -> Result<String, String> {
    let shell = app.shell();
    let adb_cmd = get_adb_command();

    // Verify local file exists
    let local = std::path::Path::new(&local_path);
    if !local.exists() {
        return Err(format!("Local file not found: {}", local_path));
    }
    let total = fs::metadata(local).map(|meta| meta.len()).unwrap_or(0);

    let dest_kind = phone_path_kind(&app, &device_id, &device_path).await?;
    ensure_not_cancelled(&transfer_key)?;

    let target_path = match conflict_mode.as_str() {
        "skip" => {
            if dest_kind != "missing" {
                return Ok("skipped".to_string());
            }
            device_path.clone()
        }
        "keepBoth" => {
            if dest_kind == "file" || dest_kind == "directory" {
                unique_device_path(&app, &device_id, &device_path).await?
            } else {
                // missing, or unknown: the commit step re-checks the name.
                device_path.clone()
            }
        }
        // "replace" and unknown modes: commit over a file, never a folder.
        _ => {
            if dest_kind == "directory" {
                return Err(format!(
                    "Type mismatch: a folder named that already exists on the phone ({})",
                    device_path
                ));
            }
            device_path.clone()
        }
    };
    let replace_mode = conflict_mode != "skip" && conflict_mode != "keepBoth";
    ensure_not_cancelled(&transfer_key)?;

    let (parent, target_name) = match target_path.rsplit_once('/') {
        Some((p, name)) => (p.to_string(), name.to_string()),
        None => (String::new(), target_path.clone()),
    };
    if !parent.is_empty() {
        let escaped = parent.replace('\'', "'\\''");
        let mkdir_cmd = format!("mkdir -p '{}'", escaped);
        let _ = shell
            .command(&adb_cmd)
            .args(["-s", &device_id, "shell", &mkdir_cmd])
            .output()
            .await;
    }
    let temp_name = temp_sibling_name(&target_name);
    let temp_path = if parent.is_empty() {
        temp_name
    } else {
        format!("{}/{}", parent, temp_name)
    };
    let remove_remote_temp = |path: String| {
        let shell = app.shell();
        let adb_cmd = adb_cmd.clone();
        let device_id = device_id.clone();
        async move {
            let escaped = path.replace('\'', "'\\''");
            let _ = shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &format!("rm -f '{}'", escaped)])
                .output()
                .await;
        }
    };

    ensure_not_cancelled(&transfer_key)?;
    emit_transfer_progress(&app, &transfer_key, 0, total);
    if let Err(err) = run_adb_with_progress(
        &app,
        vec!["-s", &device_id, "push", &local_path, &temp_path],
        &transfer_key,
        total,
        None,
        Some((device_id.as_str(), temp_path.as_str())),
    )
    .await
    {
        remove_remote_temp(temp_path.clone()).await;
        return Err(if err == "Permission denied" {
            format!("Permission denied: {}", target_path)
        } else if err == "Read-only file system" {
            format!("Read-only file system: {}", target_path)
        } else {
            err
        });
    }

    // A cancel that landed after the last byte still wins: drop the phone
    // temp file, keep whatever was at the destination.
    if let Err(err) = ensure_not_cancelled(&transfer_key) {
        remove_remote_temp(temp_path.clone()).await;
        return Err(err);
    }

    // Commit the temp file onto its final name with one guarded shell step.
    let commit = |final_path: String| {
        let shell = app.shell();
        let adb_cmd = adb_cmd.clone();
        let device_id = device_id.clone();
        let temp_escaped = temp_path.replace('\'', "'\\''");
        async move {
            let dest = final_path.replace('\'', "'\\''");
            let script = if replace_mode {
                format!(
                    "if [ -d '{d}' ]; then echo DD_TYPE; elif mv -f '{t}' '{d}'; then echo DD_OK; else echo DD_FAIL; fi",
                    d = dest,
                    t = temp_escaped
                )
            } else {
                format!(
                    "if [ -e '{d}' ] || [ -L '{d}' ]; then echo DD_EXISTS; elif mv '{t}' '{d}'; then echo DD_OK; else echo DD_FAIL; fi",
                    d = dest,
                    t = temp_escaped
                )
            };
            shell
                .command(&adb_cmd)
                .args(["-s", &device_id, "shell", &script])
                .output()
                .await
                .map(|out| String::from_utf8_lossy(&out.stdout).to_string())
                .unwrap_or_default()
        }
    };

    let mut final_path = target_path.clone();
    let mut reply = commit(final_path.clone()).await;
    if reply.contains("DD_EXISTS") {
        if conflict_mode == "skip" {
            remove_remote_temp(temp_path.clone()).await;
            return Ok("skipped".to_string());
        }
        // Keep both (or a name that was free at scan time): pick the next free name.
        final_path = match unique_device_path(&app, &device_id, &final_path).await {
            Ok(path) => path,
            Err(err) => {
                remove_remote_temp(temp_path.clone()).await;
                return Err(err);
            }
        };
        reply = commit(final_path.clone()).await;
    }
    if reply.contains("DD_TYPE") {
        remove_remote_temp(temp_path.clone()).await;
        return Err(format!(
            "Type mismatch: a folder named that already exists on the phone ({})",
            device_path
        ));
    }
    if !reply.contains("DD_OK") {
        remove_remote_temp(temp_path.clone()).await;
        return Err(format!(
            "Could not finish saving on the phone: {}",
            final_path
        ));
    }
    let renamed = final_path != device_path;
    let target_path = final_path;

    // Preserve the local file's modification time on the device
    let local_path_obj = std::path::Path::new(&local_path);
    if let Ok(metadata) = local_path_obj.metadata() {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                let mtime = duration.as_secs();
                let escaped_path = target_path.replace('\'', "'\\''");
                let touch_cmd = format!("touch -d @{} '{}'", mtime, escaped_path);
                let _ = shell
                    .command(&adb_cmd)
                    .args(["-s", &device_id, "shell", &touch_cmd])
                    .output()
                    .await;
            }
        }
    }

    Ok(if renamed {
        "renamed".to_string()
    } else {
        "uploaded".to_string()
    })
}

