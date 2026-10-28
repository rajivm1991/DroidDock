//! Shared shapes the UI receives from phone, Mac, and transfer commands.
//! Field names are the invoke contract. This module does not talk to ADB.

use serde::{Deserialize, Serialize};


#[derive(Debug, Serialize, Deserialize)]
pub struct AdbDevice {
    pub id: String,
    pub status: String,
    pub model: String,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub permissions: String,
    pub size: String,
    pub date: String,
    pub is_directory: bool,
    pub extension: Option<String>,
}


#[derive(Debug, Serialize, Deserialize)]
pub struct StorageInfo {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub percentage_used: f64,
}


/// Transfer conflict UI needs to know whether a destination path is free, a file, or a
/// folder before Copy starts (and again per file when asking). `DestConflict` +
/// local/phone batch checks + keep-both naming on phone. Classify each path as missing
/// / file / directory. Does not compare sizes, mtimes, or hashes (Folder Sync covers
/// that).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DestConflict {
    pub path: String,
    /// "missing" | "file" | "directory" | "unknown" (phone answer unreadable)
    pub kind: String,
}

