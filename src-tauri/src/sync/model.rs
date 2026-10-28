//! Folder-sync payloads, saved sync configs, and the scan progress reporter.
//! JSON field names match the sync dialog. Does not compare or copy files.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, UNIX_EPOCH};
use tauri::Emitter;
use tauri::Manager;


// ========================
// Folder Sync Types
// ========================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SyncDirection {
    PhoneToComputer,
    ComputerToPhone,
    BothWays,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncOptions {
    pub local_path: String,
    pub device_path: String,
    pub direction: SyncDirection,
    pub recursive: bool,
    pub delete_missing: bool,
    pub match_mode: String,
    #[serde(default)]
    pub file_patterns: Vec<String>,
    #[serde(default = "default_true")]
    pub allow_copy: bool,
    #[serde(default = "default_true")]
    pub allow_update: bool,
    #[serde(default = "default_true")]
    pub allow_rename: bool,
}


pub(crate) fn default_true() -> bool {
    true
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileMetadata {
    pub relative_path: String,
    pub size: u64,
    pub modified_time: u64,
    pub is_directory: bool,
    pub md5_hash: Option<String>,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncAction {
    pub file_path: String,
    pub action_type: String,
    pub direction: String,
    pub size: u64,
    pub reason: String,
    pub rename_from: Option<String>,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SyncPreview {
    pub actions: Vec<SyncAction>,
    pub total_transfer_bytes: u64,
    pub copy_count: u32,
    pub update_count: u32,
    pub delete_count: u32,
    pub skip_count: u32,
    pub rename_count: u32,
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncProgress {
    pub current_file: String,
    pub completed_count: u32,
    pub total_count: u32,
    pub completed_bytes: u64,
    pub total_bytes: u64,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    pub success_count: u32,
    pub copied_count: u32,
    pub updated_count: u32,
    pub renamed_count: u32,
    pub deleted_count: u32,
    pub skip_count: u32,
    pub error_count: u32,
    pub errors: Vec<String>,
}


// Successful actions by type. success_count is always the sum of the per-type counts.
#[derive(Debug, Default)]
pub(crate) struct SyncTally {
    pub(crate) success_count: u32,
    pub(crate) copied_count: u32,
    pub(crate) updated_count: u32,
    pub(crate) renamed_count: u32,
    pub(crate) deleted_count: u32,
}


impl SyncTally {
    /// Count one finished sync action. Unknown types are ignored so a new
    /// action string cannot inflate success_count without a matching bucket.
    pub(crate) fn record_success(&mut self, action_type: &str) {
        match action_type {
            "copy" => self.copied_count += 1,
            "update" => self.updated_count += 1,
            "rename" => self.renamed_count += 1,
            "delete" => self.deleted_count += 1,
            _ => return,
        }
        self.success_count += 1;
    }
}


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedSync {
    pub id: String,
    pub name: String,
    pub options: SyncOptions,
}


pub(crate) fn saved_syncs_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(data_dir.join("saved_syncs.json"))
}


pub(crate) fn read_saved_syncs_file(app: &tauri::AppHandle) -> Result<Vec<SavedSync>, String> {
    let path = saved_syncs_path(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read saved syncs: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse saved syncs: {}", e))
}


pub(crate) fn write_saved_syncs_file(app: &tauri::AppHandle, syncs: &[SavedSync]) -> Result<(), String> {
    let path = saved_syncs_path(app)?;
    let content = serde_json::to_string_pretty(syncs)
        .map_err(|e| format!("Failed to serialize saved syncs: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write saved syncs: {}", e))
}


#[tauri::command]
pub(crate) async fn list_saved_syncs(app: tauri::AppHandle) -> Result<Vec<SavedSync>, String> {
    read_saved_syncs_file(&app)
}


#[tauri::command]
pub(crate) async fn save_sync_config(
    app: tauri::AppHandle,
    id: Option<String>,
    name: String,
    options: SyncOptions,
) -> Result<SavedSync, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() {
        return Err("Sync name cannot be empty".to_string());
    }
    let mut syncs = read_saved_syncs_file(&app)?;
    static ID_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let saved_id = id.unwrap_or_else(|| {
        let ms = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let seq = ID_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        format!("{}-{}", ms, seq)
    });
    let saved = SavedSync {
        id: saved_id.clone(),
        name: trimmed_name,
        options,
    };
    if let Some(pos) = syncs.iter().position(|s| s.id == saved_id) {
        syncs[pos] = saved.clone();
    } else {
        syncs.push(saved.clone());
    }
    write_saved_syncs_file(&app, &syncs)?;
    Ok(saved)
}


#[tauri::command]
pub(crate) async fn delete_saved_sync(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut syncs = read_saved_syncs_file(&app)?;
    syncs.retain(|s| s.id != id);
    write_saved_syncs_file(&app, &syncs)
}


// Progress reported while scanning either side of a sync, before any actions are computed.
// `phase` is "listing" (done = items seen so far, total unknown) or "hashing" (done / total files hashed).
#[derive(Debug, Serialize, Clone)]
pub struct ScanProgress {
    pub side: String,
    pub phase: String,
    pub done: u32,
    pub total: Option<u32>,
}


pub(crate) const SCAN_PROGRESS_INTERVAL: Duration = Duration::from_millis(150);


pub(crate) fn should_emit_scan_progress(last: Option<std::time::Instant>, now: std::time::Instant, interval: Duration) -> bool {
    match last {
        None => true,
        Some(last) => now.duration_since(last) >= interval,
    }
}


pub(crate) fn count_newlines(bytes: &[u8]) -> u32 {
    bytes.iter().filter(|&&b| b == b'\n').count() as u32
}


// Throttled emitter for `sync-scan-progress`. With no window it is a no-op, which the
// standalone list_* commands use.
pub struct ScanReporter {
    window: Option<tauri::Window>,
    last_emit: Option<std::time::Instant>,
}


impl ScanReporter {
    pub(crate) fn none() -> Self {
        ScanReporter { window: None, last_emit: None }
    }

    pub(crate) fn new(window: tauri::Window) -> Self {
        ScanReporter { window: Some(window), last_emit: None }
    }

    // Emits at most once per SCAN_PROGRESS_INTERVAL so huge scans don't flood the UI.
    pub(crate) fn report(&mut self, side: &str, phase: &str, done: u32, total: Option<u32>) {
        let now = std::time::Instant::now();
        if should_emit_scan_progress(self.last_emit, now, SCAN_PROGRESS_INTERVAL) {
            self.emit(side, phase, done, total);
        }
    }

    // Always emits, so the UI shows the final count of a phase.
    pub(crate) fn report_final(&mut self, side: &str, phase: &str, done: u32, total: Option<u32>) {
        self.emit(side, phase, done, total);
    }

    fn emit(&mut self, side: &str, phase: &str, done: u32, total: Option<u32>) {
        self.last_emit = Some(std::time::Instant::now());
        if let Some(window) = &self.window {
            let _ = window.emit(
                "sync-scan-progress",
                ScanProgress { side: side.to_string(), phase: phase.to_string(), done, total },
            );
        }
    }
}

