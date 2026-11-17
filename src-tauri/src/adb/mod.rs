//! Where the `adb` binary lives and which phones are attached.
//! Custom path, common install locations, and a short model-name cache so
//! the device poll does not re-query every phone every tick.

use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use crate::model::AdbDevice;
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;


// Global state to store custom ADB path
pub(crate) static ADB_PATH: Mutex<Option<String>> = Mutex::new(None);


/// Cached friendly names from getprop so a 1s device poll does not re-shell
/// every phone every tick. Cleared for ids that disappear from `adb devices`.
pub(crate) static DEVICE_MODEL_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));


/// Where DroidDock puts the platform-tools it downloads itself during setup.
pub(crate) fn downloaded_platform_tools_dir(home: &str) -> PathBuf {
    PathBuf::from(home).join("Library/Application Support/DroidDock/platform-tools")
}


// Try to find ADB in common locations
pub(crate) fn find_adb_path() -> Option<String> {
    find_adb_path_in(
        &[
            "/opt/homebrew/bin/adb",           // Homebrew on Apple Silicon
            "/usr/local/bin/adb",              // Homebrew on Intel
            "/opt/local/bin/adb",              // MacPorts
        ],
        std::env::var("HOME").ok().as_deref(),
    )
}


/// `system_paths` are checked first, then the usual spots under `home`. The copy DroidDock
/// downloads comes last, so an adb the person already has always wins.
pub(crate) fn find_adb_path_in(system_paths: &[&str], home: Option<&str>) -> Option<String> {
    for path_str in system_paths {
        if PathBuf::from(path_str).exists() {
            return Some(path_str.to_string());
        }
    }
    let home = home?;
    for relative in [
        "Library/Android/sdk/platform-tools/adb",  // Android Studio
        "Android/Sdk/platform-tools/adb",          // Alternative Android Studio
    ] {
        let path = PathBuf::from(home).join(relative);
        if path.exists() {
            return Some(path.to_string_lossy().to_string());
        }
    }
    let downloaded = downloaded_platform_tools_dir(home).join("adb");
    if downloaded.exists() {
        return Some(downloaded.to_string_lossy().to_string());
    }
    None
}


#[cfg(test)]
mod find_adb_tests {
    use super::{downloaded_platform_tools_dir, find_adb_path_in};
    use std::fs;

    fn touch(path: &std::path::Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, "").unwrap();
    }

    #[test]
    fn finds_the_adb_that_droiddock_downloaded() {
        let home = tempfile::tempdir().unwrap();
        let home_str = home.path().to_str().unwrap();
        touch(&downloaded_platform_tools_dir(home_str).join("adb"));
        assert_eq!(
            find_adb_path_in(&[], Some(home_str)),
            Some(
                downloaded_platform_tools_dir(home_str)
                    .join("adb")
                    .to_string_lossy()
                    .to_string()
            )
        );
    }

    #[test]
    fn an_adb_the_person_already_has_wins_over_the_downloaded_one() {
        let home = tempfile::tempdir().unwrap();
        let home_str = home.path().to_str().unwrap();
        touch(&downloaded_platform_tools_dir(home_str).join("adb"));
        let system = home.path().join("system-adb");
        touch(&system);
        let system_str = system.to_str().unwrap();
        assert_eq!(
            find_adb_path_in(&[system_str], Some(home_str)),
            Some(system_str.to_string())
        );
    }

    #[test]
    fn still_finds_the_android_studio_adb() {
        let home = tempfile::tempdir().unwrap();
        let home_str = home.path().to_str().unwrap();
        let studio = home.path().join("Library/Android/sdk/platform-tools/adb");
        touch(&studio);
        assert_eq!(
            find_adb_path_in(&[], Some(home_str)),
            Some(studio.to_string_lossy().to_string())
        );
    }

    #[test]
    fn finds_nothing_when_nothing_is_installed() {
        let home = tempfile::tempdir().unwrap();
        assert_eq!(find_adb_path_in(&[], home.path().to_str()), None);
    }
}


// Get the ADB command to use (custom path or just "adb")
pub(crate) fn get_adb_command() -> String {
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


/// The UI polls this about once a second. Re-running getprop every tick would fight
/// transfers for the adb server for no user benefit. `adb devices`, then getprop only
/// for ready phones not already cached. Does not stream `track-devices`, and does not
/// refresh a cached name until that id leaves the list and comes back.
#[tauri::command]
pub(crate) async fn get_devices(app: tauri::AppHandle) -> Result<Vec<AdbDevice>, String> {
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
    let mut devices: Vec<AdbDevice> = stdout
        .lines()
        .skip(1) // Skip "List of devices attached" header
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                Some(AdbDevice {
                    id: parts[0].to_string(),
                    status: parts[1].to_string(),
                    model: String::new(),
                })
            } else {
                None
            }
        })
        .collect();

    let present_ids: HashSet<String> = devices.iter().map(|d| d.id.clone()).collect();
    if let Ok(mut cache) = DEVICE_MODEL_CACHE.lock() {
        cache.retain(|id, _| present_ids.contains(id));
    }

    for device in &mut devices {
        if device.status != "device" {
            continue;
        }

        if let Ok(cache) = DEVICE_MODEL_CACHE.lock() {
            if let Some(cached) = cache.get(&device.id) {
                device.model = cached.clone();
                continue;
            }
        }

        let brand = shell
            .command(&adb_cmd)
            .args(["-s", &device.id, "shell", "getprop", "ro.product.brand"])
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let model = shell
            .command(&adb_cmd)
            .args(["-s", &device.id, "shell", "getprop", "ro.product.model"])
            .output()
            .await
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        device.model = match (brand.is_empty(), model.is_empty()) {
            (false, false) => format!("{} {}", brand, model),
            (false, true) => brand,
            (true, false) => model,
            (true, true) => String::new(),
        };

        if let Ok(mut cache) = DEVICE_MODEL_CACHE.lock() {
            cache.insert(device.id.clone(), device.model.clone());
        }
    }

    Ok(devices)
}


// Check if ADB is available
#[tauri::command]
pub(crate) async fn check_adb(app: tauri::AppHandle) -> Result<bool, String> {
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


/// The old setter only accepted the exact path to the `adb` binary. People often pick
/// the folder that contains it (platform-tools) and got a hard error.
/// `resolve_adb_candidate` and validation that the resolved binary runs. If `path` is a
/// file, use it; if it is a directory, look for `adb` inside it (and under
/// `platform-tools/`). Then store the resolved path. Does not download ADB, and does
/// not search the whole disk. existence alone is not enough — we require `adb version`
/// to succeed.
pub(crate) fn resolve_adb_candidate(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Enter a path to the adb program, or a folder that contains it.".to_string());
    }
    let path_buf = PathBuf::from(trimmed);
    if !path_buf.exists() {
        return Err("That path does not exist on this Mac.".to_string());
    }
    if path_buf.is_file() {
        return Ok(path_buf);
    }
    if path_buf.is_dir() {
        let direct = path_buf.join("adb");
        if direct.is_file() {
            return Ok(direct);
        }
        let nested = path_buf.join("platform-tools").join("adb");
        if nested.is_file() {
            return Ok(nested);
        }
        return Err(
            "That folder does not contain an adb program. Choose the adb file, or the platform-tools folder."
                .to_string(),
        );
    }
    Err("Choose a file or a folder.".to_string())
}


pub(crate) async fn adb_version_ok(app: &tauri::AppHandle, adb_path: &str) -> Result<String, String> {
    let output = app
        .shell()
        .command(adb_path)
        .args(["version"])
        .output()
        .await
        .map_err(|e| format!("Could not run adb: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(if stderr.trim().is_empty() {
            "That file did not respond as adb.".to_string()
        } else {
            format!("That file did not respond as adb: {}", stderr.trim())
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}


/// Resolve a typed or picked path, verify `adb version`, and remember it.
#[tauri::command]
pub(crate) async fn set_adb_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let resolved = resolve_adb_candidate(&path)?;
    let resolved_str = resolved
        .to_str()
        .ok_or_else(|| "Invalid path".to_string())?
        .to_string();
    let version = adb_version_ok(&app, &resolved_str).await?;
    if let Ok(mut guard) = ADB_PATH.lock() {
        *guard = Some(resolved_str.clone());
    } else {
        return Err("Failed to save the adb path.".to_string());
    }
    let _ = version;
    Ok(resolved_str)
}


/// Validate a path without opening the main app. Used for live typing checks.
#[tauri::command]
pub(crate) async fn validate_adb_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let resolved = resolve_adb_candidate(&path)?;
    let resolved_str = resolved
        .to_str()
        .ok_or_else(|| "Invalid path".to_string())?
        .to_string();
    let _ = adb_version_ok(&app, &resolved_str).await?;
    Ok(resolved_str)
}


/// Open a picker that accepts a file or a folder; set shows-hidden from Finder’s
/// `AppleShowAllFiles` (Cmd+Shift+. still toggles in the panel). Does not validate adb
/// (caller runs `validate_adb_path`), install anything, or change Finder preferences.
#[tauri::command]
pub(crate) async fn pick_adb_location(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let _ = tx.send(pick_adb_location_macos());
        })
        .map_err(|e| format!("Could not open the file picker: {e}"))?;
        rx.recv()
            .map_err(|_| "The file picker did not finish.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("Choosing adb this way is only available on Mac.".to_string())
    }
}


#[cfg(target_os = "macos")]
pub(crate) fn finder_shows_all_files() -> bool {
    let output = std::process::Command::new("defaults")
        .args(["read", "com.apple.finder", "AppleShowAllFiles"])
        .output();
    match output {
        Ok(out) if out.status.success() => {
            let value = String::from_utf8_lossy(&out.stdout).trim().to_ascii_lowercase();
            matches!(value.as_str(), "1" | "true" | "yes")
        }
        _ => false,
    }
}


#[cfg(target_os = "macos")]
pub(crate) fn pick_adb_location_macos() -> Result<Option<String>, String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSModalResponseOK, NSOpenPanel};
    use objc2_foundation::NSString;

    let mtm = MainThreadMarker::new()
        .ok_or_else(|| "File picker must run on the main thread.".to_string())?;
    let panel = NSOpenPanel::openPanel(mtm);
    let title = NSString::from_str("Choose adb or the folder that contains it");
    let message = NSString::from_str(
        "Select the adb program, or a folder such as platform-tools that contains it.",
    );
    let prompt = NSString::from_str("Choose");
    panel.setCanChooseFiles(true);
    panel.setCanChooseDirectories(true);
    panel.setAllowsMultipleSelection(false);
    panel.setCanCreateDirectories(false);
    panel.setShowsHiddenFiles(finder_shows_all_files());
    panel.setTitle(Some(&title));
    panel.setMessage(Some(&message));
    panel.setPrompt(Some(&prompt));
    let response = panel.runModal();
    if response != NSModalResponseOK {
        return Ok(None);
    }
    let url = panel.URL().ok_or_else(|| "No path was selected.".to_string())?;
    let path = url.path().ok_or_else(|| "Could not read that path.".to_string())?;
    Ok(Some(path.to_string()))
}


// Get current ADB path (for display purposes)
#[tauri::command]
pub(crate) fn get_current_adb_path() -> String {
    get_adb_command()
}

