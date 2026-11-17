//! First-run ADB setup on this Mac: probe what is missing, then install Google's
//! platform-tools with one click. DroidDock downloads the pinned official zip itself,
//! checks its SHA-256, and unpacks it into its own folder in the user's home. It needs no
//! Homebrew, no administrator password, and changes nothing outside that folder.

use crate::adb::{
    adb_version_ok, downloaded_platform_tools_dir, find_adb_path, set_adb_path, ADB_PATH,
};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;


#[derive(Clone, Serialize)]
pub(crate) struct SetupRequirement {
    id: String,
    title: String,
    detail: String,
    status: String, // "ready" | "missing"
}


#[derive(Clone, Serialize)]
pub(crate) struct AdbSetupProbe {
    locations_checked: Vec<String>,
    adb_ready: bool,
    adb_path: Option<String>,
    requirements: Vec<SetupRequirement>,
}


/// The setup screen must show what is already present and what still needs installing.
/// Report whether adb works and the locations already searched. Missing platform-tools /
/// adb is `missing` (blocks the app). Does not install anything or require network.
#[tauri::command]
pub(crate) async fn probe_adb_setup(app: tauri::AppHandle) -> Result<AdbSetupProbe, String> {
    let mut locations = Vec::new();
    for path_str in [
        "/opt/homebrew/bin/adb",
        "/usr/local/bin/adb",
        "/opt/local/bin/adb",
    ] {
        locations.push(path_str.to_string());
    }
    if let Ok(home) = std::env::var("HOME") {
        locations.push(format!("{}/Library/Android/sdk/platform-tools/adb", home));
        locations.push(format!("{}/Android/Sdk/platform-tools/adb", home));
        locations.push(
            downloaded_platform_tools_dir(&home)
                .join("adb")
                .to_string_lossy()
                .to_string(),
        );
    }

    let mut adb_path = find_adb_path();
    let mut adb_ready = false;
    if let Some(ref path) = adb_path {
        if adb_version_ok(&app, path).await.is_ok() {
            adb_ready = true;
        }
    }
    if !adb_ready {
        if let Ok(output) = app.shell().command("adb").args(["version"]).output().await {
            if output.status.success() {
                adb_ready = true;
                adb_path = Some("adb (on PATH)".to_string());
            }
        }
    }

    let requirements = vec![SetupRequirement {
        id: "platform-tools".to_string(),
        title: "Android platform tools (includes adb)".to_string(),
        detail: if adb_ready {
            format!("Found at {}", adb_path.clone().unwrap_or_default())
        } else {
            "Required — this is the Google helper DroidDock uses over USB. Use any option below to get it.".to_string()
        },
        status: if adb_ready { "ready".into() } else { "missing".into() },
    }];

    Ok(AdbSetupProbe {
        locations_checked: locations,
        adb_ready,
        adb_path,
        requirements,
    })
}


#[derive(Clone, Serialize)]
pub(crate) struct SetupInstallEvent {
    step_id: String,
    step_title: String,
    status: String, // "running" | "success" | "failed" | "skipped"
    detail: String,
    log_line: Option<String>,
}


pub(crate) fn emit_setup(app: &tauri::AppHandle, event: SetupInstallEvent) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("setup-install-progress", event);
    }
}


/// Google's official platform-tools for macOS, pinned to one release so the download can
/// be checked against `PLATFORM_TOOLS_SHA256`. The binary inside is a universal
/// (Intel and Apple silicon) build signed by Google. Matches the SHA-1 in Google's own
/// SDK manifest (repository2-3.xml) for platform-tools r37.0.1.
pub(crate) const PLATFORM_TOOLS_URL: &str =
    "https://dl.google.com/android/repository/platform-tools_r37.0.1-darwin.zip";
pub(crate) const PLATFORM_TOOLS_SHA256: &str =
    "ee39ad5967e95c2a07f04dbcbde96b1a0c916ba376096db5d2f498b7727a5d1d";


/// Downloads the platform-tools zip, checks its SHA-256, unpacks it next to `dest_dir`,
/// then swaps it in so a failed install never damages one that already works. Returns
/// the path of the installed `adb`. `proto` is curl's `--proto` value (`=https` for the
/// real download). `on_step(step_id, status, detail)` reports progress. Does not choose
/// where `dest_dir` is, run adb, or remember the path.
pub(crate) fn install_platform_tools_blocking(
    url: &str,
    proto: &str,
    expected_sha256: &str,
    dest_dir: &std::path::Path,
    work_dir: &std::path::Path,
    on_step: &dyn Fn(&str, &str, &str),
) -> Result<PathBuf, String> {
    use std::process::Command;

    let fail = |step: &str, message: String| -> String {
        on_step(step, "failed", &message);
        message
    };

    // 1. Download. Only the pinned https address is ever used by the app; `proto` lets
    // tests point at a local file instead.
    let zip_path = work_dir.join("platform-tools.zip");
    on_step("download", "running", "Downloading Google's Android platform tools (about 16 MB)…");
    let download = Command::new("/usr/bin/curl")
        .args(["--silent", "--show-error", "--fail", "--location"])
        .args(["--proto", proto, "--proto-redir", proto])
        .args(["--connect-timeout", "30", "--max-time", "900"])
        .arg("--output")
        .arg(&zip_path)
        .arg(url)
        .output()
        .map_err(|e| fail("download", format!("Could not start the download: {}", e)))?;
    if !download.status.success() {
        let reason = String::from_utf8_lossy(&download.stderr).trim().to_string();
        return Err(fail(
            "download",
            format!(
                "The download did not finish. Check your internet connection and try again. ({})",
                if reason.is_empty() { "no details" } else { reason.as_str() }
            ),
        ));
    }
    on_step("download", "success", "Downloaded.");

    // 2. Verify it is the exact file we pinned before anything is unpacked or run.
    on_step("verify", "running", "Checking the download is the genuine Google file…");
    let hash_out = Command::new("/usr/bin/shasum")
        .args(["-a", "256"])
        .arg(&zip_path)
        .output()
        .map_err(|e| fail("verify", format!("Could not check the download: {}", e)))?;
    let actual = String::from_utf8_lossy(&hash_out.stdout)
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    if !hash_out.status.success() || actual != expected_sha256.to_ascii_lowercase() {
        return Err(fail(
            "verify",
            "The downloaded file did not match what Google published, so it was not installed."
                .to_string(),
        ));
    }
    on_step("verify", "success", "The download matches Google's published file.");

    // 3. Unpack beside the destination (same volume, so the final rename is atomic).
    on_step("extract", "running", "Unpacking…");
    let parent = dest_dir
        .parent()
        .ok_or_else(|| fail("extract", "Could not choose where to install.".to_string()))?;
    fs::create_dir_all(parent)
        .map_err(|e| fail("extract", format!("Could not create the install folder: {}", e)))?;
    let staging = parent.join(format!(".platform-tools-staging-{}", std::process::id()));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging)
        .map_err(|e| fail("extract", format!("Could not prepare the install folder: {}", e)))?;
    let cleanup_staging = || {
        let _ = fs::remove_dir_all(&staging);
    };
    let unzip = Command::new("/usr/bin/unzip")
        .args(["-q", "-o"])
        .arg(&zip_path)
        .arg("-d")
        .arg(&staging)
        .output()
        .map_err(|e| {
            cleanup_staging();
            fail("extract", format!("Could not unpack the download: {}", e))
        })?;
    let unpacked = staging.join("platform-tools");
    if !unzip.status.success() || !unpacked.join("adb").is_file() {
        cleanup_staging();
        return Err(fail(
            "extract",
            "The download did not contain the adb program, so nothing was installed.".to_string(),
        ));
    }

    // 4. Swap it in. The old copy moves aside first and comes back if anything fails.
    let backup = parent.join(format!(".platform-tools-previous-{}", std::process::id()));
    let _ = fs::remove_dir_all(&backup);
    let had_previous = dest_dir.exists();
    if had_previous {
        fs::rename(dest_dir, &backup).map_err(|e| {
            cleanup_staging();
            fail("extract", format!("Could not replace the existing copy: {}", e))
        })?;
    }
    if let Err(e) = fs::rename(&unpacked, dest_dir) {
        if had_previous {
            let _ = fs::rename(&backup, dest_dir);
        }
        cleanup_staging();
        return Err(fail("extract", format!("Could not finish installing: {}", e)));
    }
    cleanup_staging();
    if had_previous {
        let _ = fs::remove_dir_all(&backup);
    }
    on_step("extract", "success", "Installed.");
    Ok(dest_dir.join("adb"))
}


#[cfg(test)]
mod install_platform_tools_tests {
    use super::install_platform_tools_blocking;
    use std::cell::RefCell;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    struct Fixture {
        _tmp: tempfile::TempDir,
        zip: PathBuf,
        sha256: String,
        dest: PathBuf,
        work: PathBuf,
    }

    /// Builds a real zip with `platform-tools/<file>` entries so curl, shasum and unzip
    /// run for real, with a `file://` URL standing in for Google.
    fn fixture(files: &[(&str, &str)]) -> Fixture {
        let tmp = tempfile::tempdir().expect("temp dir");
        let src = tmp.path().join("src");
        let tools = src.join("platform-tools");
        fs::create_dir_all(&tools).expect("src dir");
        for (name, body) in files {
            let file = tools.join(name);
            fs::write(&file, body).expect("write file");
            fs::set_permissions(&file, fs::Permissions::from_mode(0o755)).expect("chmod");
        }
        let zip = tmp.path().join("platform-tools.zip");
        let status = Command::new("/usr/bin/zip")
            .args(["-q", "-r"])
            .arg(&zip)
            .arg("platform-tools")
            .current_dir(&src)
            .status()
            .expect("run zip");
        assert!(status.success(), "zip failed");
        let out = Command::new("/usr/bin/shasum")
            .args(["-a", "256"])
            .arg(&zip)
            .output()
            .expect("run shasum");
        let sha256 = String::from_utf8_lossy(&out.stdout)
            .split_whitespace()
            .next()
            .expect("hash")
            .to_string();
        let work = tmp.path().join("work");
        fs::create_dir_all(&work).expect("work dir");
        let dest = tmp.path().join("dest").join("platform-tools");
        Fixture { _tmp: tmp, zip, sha256, dest, work }
    }

    fn file_url(path: &Path) -> String {
        format!("file://{}", path.display())
    }

    fn run(f: &Fixture, sha: &str, steps: &RefCell<Vec<String>>) -> Result<PathBuf, String> {
        install_platform_tools_blocking(
            &file_url(&f.zip),
            "=file",
            sha,
            &f.dest,
            &f.work,
            &|id, status, _detail| steps.borrow_mut().push(format!("{id}:{status}")),
        )
    }

    #[test]
    fn installs_adb_from_a_zip_with_the_expected_hash() {
        let f = fixture(&[("adb", "#!/bin/sh\necho fake adb\n")]);
        let steps = RefCell::new(Vec::new());
        let adb = run(&f, &f.sha256, &steps).expect("install should succeed");
        assert_eq!(adb, f.dest.join("adb"));
        let mode = fs::metadata(&adb).expect("adb exists").permissions().mode();
        assert!(mode & 0o111 != 0, "adb should stay executable, mode {mode:o}");
        let steps = steps.borrow();
        for expected in ["download:success", "verify:success", "extract:success"] {
            assert!(steps.contains(&expected.to_string()), "missing {expected} in {steps:?}");
        }
    }

    #[test]
    fn rejects_a_download_whose_hash_does_not_match() {
        let f = fixture(&[("adb", "#!/bin/sh\n")]);
        let steps = RefCell::new(Vec::new());
        let wrong = "0".repeat(64);
        let err = run(&f, &wrong, &steps).unwrap_err();
        assert!(err.contains("did not match"), "got: {err}");
        assert!(!f.dest.exists(), "nothing should be installed");
        assert!(steps.borrow().contains(&"verify:failed".to_string()));
    }

    #[test]
    fn a_rejected_download_leaves_the_existing_install_alone() {
        let f = fixture(&[("adb", "#!/bin/sh\n")]);
        fs::create_dir_all(&f.dest).expect("existing install");
        fs::write(f.dest.join("old-adb"), "keep me").expect("old file");
        let steps = RefCell::new(Vec::new());
        run(&f, &"0".repeat(64), &steps).unwrap_err();
        assert_eq!(fs::read_to_string(f.dest.join("old-adb")).unwrap(), "keep me");
    }

    #[test]
    fn a_good_download_replaces_the_existing_install() {
        let f = fixture(&[("adb", "#!/bin/sh\necho new\n")]);
        fs::create_dir_all(&f.dest).expect("existing install");
        fs::write(f.dest.join("old-adb"), "old").expect("old file");
        let steps = RefCell::new(Vec::new());
        run(&f, &f.sha256, &steps).expect("install should succeed");
        assert!(!f.dest.join("old-adb").exists(), "old files should be gone");
        assert!(f.dest.join("adb").is_file());
        let leftovers: Vec<_> = fs::read_dir(f.dest.parent().unwrap())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(leftovers, vec!["platform-tools".to_string()], "no staging or backup left behind");
    }

    #[test]
    fn a_zip_without_adb_is_not_installed() {
        let f = fixture(&[("fastboot", "#!/bin/sh\n")]);
        let steps = RefCell::new(Vec::new());
        let err = run(&f, &f.sha256, &steps).unwrap_err();
        assert!(err.contains("adb"), "got: {err}");
        assert!(!f.dest.exists());
    }

    /// Talks to Google, so it is skipped by default. Run it with
    /// `cargo test -- --ignored` after changing the pinned URL or hash.
    #[test]
    #[ignore = "downloads about 16 MB from dl.google.com"]
    fn the_pinned_google_download_still_matches_its_hash() {
        let f = fixture(&[("adb", "#!/bin/sh\n")]);
        let steps = RefCell::new(Vec::new());
        let adb = install_platform_tools_blocking(
            super::PLATFORM_TOOLS_URL,
            "=https",
            super::PLATFORM_TOOLS_SHA256,
            &f.dest,
            &f.work,
            &|id, status, _| steps.borrow_mut().push(format!("{id}:{status}")),
        )
        .expect("the pinned download should install");
        assert!(adb.is_file());
        assert!(fs::metadata(&adb).unwrap().permissions().mode() & 0o111 != 0);
    }

    #[test]
    fn a_failed_download_is_reported_as_one() {
        let f = fixture(&[("adb", "#!/bin/sh\n")]);
        let steps = RefCell::new(Vec::new());
        let err = install_platform_tools_blocking(
            "file:///definitely/not/here.zip",
            "=file",
            &f.sha256,
            &f.dest,
            &f.work,
            &|id, status, _| steps.borrow_mut().push(format!("{id}:{status}")),
        )
        .unwrap_err();
        assert!(err.contains("download"), "got: {err}");
        assert!(steps.borrow().contains(&"download:failed".to_string()));
        assert!(!f.dest.exists());
    }
}


/// Title shown on the setup screen for each step the installer reports.
fn step_title(step_id: &str) -> &'static str {
    match step_id {
        "download" => "Download from Google",
        "verify" => "Check the download",
        "extract" => "Install",
        _ => "Check adb runs",
    }
}


/// One click installs Google's platform-tools into DroidDock's own folder
/// (`~/Library/Application Support/DroidDock/platform-tools`): download the pinned
/// official zip, check its SHA-256, unpack it, then run `adb version` and remember the
/// path. Reports each step through `setup-install-progress` and stops at the first
/// failure. Needs the internet but no Homebrew and no administrator password, and does
/// not touch anything outside that folder. Does not enable USB debugging on the phone.
/// The setup screen must collect an as-is agreement before calling this.
#[tauri::command]
pub(crate) async fn install_adb_tools(app: tauri::AppHandle) -> Result<String, String> {
    let probe = probe_adb_setup(app.clone()).await?;
    if probe.adb_ready {
        if let Some(path) = probe.adb_path.clone() {
            if !path.contains("PATH") {
                let _ = set_adb_path(app.clone(), path.clone()).await;
                return Ok(path);
            }
        }
        if let Some(found) = find_adb_path() {
            let _ = set_adb_path(app.clone(), found.clone()).await;
            return Ok(found);
        }
    }

    let home = std::env::var("HOME")
        .map_err(|_| "Could not find your home folder to install into.".to_string())?;
    let dest_dir = downloaded_platform_tools_dir(&home);
    let work = tempfile::tempdir()
        .map_err(|e| format!("Could not prepare a temporary folder: {}", e))?;

    let step_app = app.clone();
    let installed = tauri::async_runtime::spawn_blocking(move || {
        let on_step = |step_id: &str, status: &str, detail: &str| {
            emit_setup(
                &step_app,
                SetupInstallEvent {
                    step_id: step_id.to_string(),
                    step_title: step_title(step_id).to_string(),
                    status: status.to_string(),
                    detail: detail.to_string(),
                    log_line: None,
                },
            );
        };
        // `work` lives until this closure ends, then its folder is deleted.
        install_platform_tools_blocking(
            PLATFORM_TOOLS_URL,
            "=https",
            PLATFORM_TOOLS_SHA256,
            &dest_dir,
            work.path(),
            &on_step,
        )
    })
    .await
    .map_err(|e| format!("The install stopped unexpectedly: {}", e))??;

    emit_setup(
        &app,
        SetupInstallEvent {
            step_id: "adb-check".to_string(),
            step_title: step_title("adb-check").to_string(),
            status: "running".to_string(),
            detail: format!("Checking {}", installed.display()),
            log_line: None,
        },
    );
    // A fresh install must not be shadowed by an earlier cached path.
    if let Ok(mut guard) = ADB_PATH.lock() {
        *guard = None;
    }
    match set_adb_path(app.clone(), installed.to_string_lossy().to_string()).await {
        Ok(resolved) => {
            emit_setup(
                &app,
                SetupInstallEvent {
                    step_id: "adb-check".to_string(),
                    step_title: step_title("adb-check").to_string(),
                    status: "success".to_string(),
                    detail: format!("Ready at {}", resolved),
                    log_line: None,
                },
            );
            Ok(resolved)
        }
        Err(err) => {
            emit_setup(
                &app,
                SetupInstallEvent {
                    step_id: "adb-check".to_string(),
                    step_title: step_title("adb-check").to_string(),
                    status: "failed".to_string(),
                    detail: err.clone(),
                    log_line: None,
                },
            );
            Err(err)
        }
    }
}
