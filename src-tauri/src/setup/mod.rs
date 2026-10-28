//! First-run ADB setup on this Mac: probe what is missing, then install
//! platform-tools via Homebrew with one macOS administrator prompt.
//! The temporary sudoers drop-in is removed when install finishes.

use crate::adb::{adb_version_ok, find_adb_path, set_adb_path, ADB_PATH};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;


#[derive(Clone, Serialize)]
pub(crate) struct SetupRequirement {
    id: String,
    title: String,
    detail: String,
    status: String, // "ready" | "missing" | "for_install"
}


#[derive(Clone, Serialize)]
pub(crate) struct AdbSetupProbe {
    locations_checked: Vec<String>,
    brew_path: Option<String>,
    brew_ready: bool,
    adb_ready: bool,
    adb_path: Option<String>,
    requirements: Vec<SetupRequirement>,
}


pub(crate) fn find_brew_path() -> Option<String> {
    for candidate in [
        "/opt/homebrew/bin/brew",
        "/usr/local/bin/brew",
        "/home/linuxbrew/.linuxbrew/bin/brew",
    ] {
        if PathBuf::from(candidate).is_file() {
            return Some(candidate.to_string());
        }
    }
    None
}


/// The setup screen must show what is already present and what still needs installing,
/// in the order those pieces are required. Report Homebrew, ADB, and the locations
/// already searched. Homebrew missing is `for_install` — required for Install for me,
/// not for path/Google. Missing platform-tools / adb is `missing` (blocks the app).
/// Ready items stay `ready`. Does not install anything or require network.
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
    }

    let brew_path = find_brew_path();
    let brew_ready = brew_path.is_some();

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

    let requirements = vec![
        SetupRequirement {
            id: "homebrew".to_string(),
            title: "Homebrew (Mac package helper)".to_string(),
            detail: if brew_ready {
                format!("Found at {}", brew_path.clone().unwrap_or_default())
            } else {
                // Homebrew is required for automatic Install; path/Google do not use it.
                "Needed to install adb automatically (Install for me). Not used if you choose an existing adb path or download from Google.".to_string()
            },
            status: if brew_ready {
                "ready".into()
            } else {
                "for_install".into()
            },
        },
        SetupRequirement {
            id: "platform-tools".to_string(),
            title: "Android platform tools (includes adb)".to_string(),
            detail: if adb_ready {
                format!("Found at {}", adb_path.clone().unwrap_or_default())
            } else {
                "Required — this is the Google helper DroidDock uses over USB. Use any option below to get it.".to_string()
            },
            status: if adb_ready { "ready".into() } else { "missing".into() },
        },
    ];

    Ok(AdbSetupProbe {
        locations_checked: locations,
        brew_path,
        brew_ready,
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


/// Homebrew’s installer enables color when stdout is a TTY (`script` below). Those CSI
/// codes clutter the setup log without helping a consumer. Strip common ANSI
/// color/style sequences from one log line. Does not interpret all terminal control
/// sequences.
pub(crate) fn strip_ansi_codes(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(n) = chars.next() {
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}


pub(crate) async fn run_shell_logged(
    app: &tauri::AppHandle,
    program: &str,
    args: Vec<&str>,
    step_id: &str,
    step_title: &str,
    env: Vec<(&str, &str)>,
) -> Result<(), String> {
    emit_setup(
        app,
        SetupInstallEvent {
            step_id: step_id.to_string(),
            step_title: step_title.to_string(),
            status: "running".to_string(),
            detail: format!("Starting: {} {}", program, args.join(" ")),
            log_line: None,
        },
    );

    let mut command = app.shell().command(program);
    for (key, value) in env {
        command = command.env(key, value);
    }
    let (mut rx, _child) = command
        .args(args)
        .spawn()
        .map_err(|e| format!("Could not start {}: {}", program, e))?;

    let mut failed_message = String::new();
    // Keep recent lines so failure detail is useful (exit code alone is opaque).
    let mut recent_lines: Vec<String> = Vec::new();
    let mut exit_ok = false;
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(chunk) | CommandEvent::Stderr(chunk) => {
                let text = String::from_utf8_lossy(&chunk);
                for line in text.lines() {
                    let trimmed = strip_ansi_codes(line).trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    recent_lines.push(trimmed.clone());
                    if recent_lines.len() > 12 {
                        recent_lines.remove(0);
                    }
                    emit_setup(
                        app,
                        SetupInstallEvent {
                            step_id: step_id.to_string(),
                            step_title: step_title.to_string(),
                            status: "running".to_string(),
                            detail: "Working…".to_string(),
                            log_line: Some(trimmed),
                        },
                    );
                }
            }
            CommandEvent::Error(err) => {
                failed_message = err;
            }
            CommandEvent::Terminated(payload) => {
                exit_ok = payload.code.unwrap_or(1) == 0;
                if !exit_ok && failed_message.is_empty() {
                    failed_message = format!("{} exited with code {:?}", program, payload.code);
                }
                break;
            }
            _ => {}
        }
    }

    if exit_ok {
        emit_setup(
            app,
            SetupInstallEvent {
                step_id: step_id.to_string(),
                step_title: step_title.to_string(),
                status: "success".to_string(),
                detail: "Finished successfully.".to_string(),
                log_line: None,
            },
        );
        Ok(())
    } else {
        let mut detail = if failed_message.is_empty() {
            "This step failed.".to_string()
        } else {
            failed_message
        };
        if !recent_lines.is_empty() {
            detail = format!("{}\n{}", detail, recent_lines.join("\n"));
        }
        emit_setup(
            app,
            SetupInstallEvent {
                step_id: step_id.to_string(),
                step_title: step_title.to_string(),
                status: "failed".to_string(),
                detail: detail.clone(),
                log_line: None,
            },
        );
        Err(detail)
    }
}


/// Temporary sudoers drop-in so Homebrew’s many `sudo` calls work after one
/// native admin approval (like a Terminal sudo session). Always removed after.
pub(crate) const HOMEBREW_TEMP_SUDOERS: &str = "/etc/sudoers.d/droiddock-brew-install";


pub(crate) fn homebrew_prefix_path() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "/opt/homebrew"
    } else {
        "/usr/local"
    }
}


/// Usernames/groups are embedded in a root shell script and a sudoers line. Allow only
/// the usual macOS account character set.
pub(crate) fn assert_safe_account_token(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.chars().any(|c| c.is_whitespace())
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
    {
        return Err(format!("Could not use this Mac account {} for install.", label));
    }
    Ok(())
}


pub(crate) fn current_mac_user_and_group() -> Result<(String, String), String> {
    let user_out = std::process::Command::new("/usr/bin/id")
        .args(["-un"])
        .output()
        .map_err(|e| format!("Could not read Mac user: {}", e))?;
    if !user_out.status.success() {
        return Err("Could not read Mac user name.".to_string());
    }
    let group_out = std::process::Command::new("/usr/bin/id")
        .args(["-gn"])
        .output()
        .map_err(|e| format!("Could not read Mac group: {}", e))?;
    if !group_out.status.success() {
        return Err("Could not read Mac group name.".to_string());
    }
    let user = String::from_utf8_lossy(&user_out.stdout).trim().to_string();
    let group = String::from_utf8_lossy(&group_out.stdout).trim().to_string();
    assert_safe_account_token("name", &user)?;
    assert_safe_account_token("group", &group)?;
    Ok((user, group))
}


pub(crate) fn new_homebrew_work_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!(
        "droiddock-brew-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));
    fs::create_dir(&dir).map_err(|e| format!("Could not prepare install folder: {}", e))?;
    Ok(dir)
}


/// AppleScript `display dialog` (old askpass) is not the real macOS admin sheet, and
/// Homebrew calls sudo many times so askpass re-prompted. The system Authorization
/// dialog (`with administrator privileges`) is the native one. One native password
/// prompt that creates the Homebrew prefix and a temporary passwordless-sudo drop-in
/// for this install only. Show the lock-style macOS dialog once; create prefix owned by
/// the user; write `/etc/sudoers.d/droiddock-brew-install` so later `sudo -n` succeeds.
/// This does not collect the password in the DroidDock UI, leave the passwordless
/// sudo drop-in in place (the caller removes it), or run the long Homebrew install
/// as root. Always call `remove_homebrew_temp_sudoers` on a finally path.
pub(crate) fn provision_homebrew_admin_session(work_dir: &PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let (user, group) = current_mac_user_and_group()?;
    let prefix = homebrew_prefix_path();
    let provision_path = work_dir.join("provision-homebrew.sh");
    // Args are validated tokens; script is root-only execution via osascript.
    let script = format!(
        r#"#!/bin/bash
set -euo pipefail
USER_NAME='{user}'
GROUP_NAME='{group}'
PREFIX='{prefix}'
DROP_IN='{drop_in}'
/usr/bin/install -d -o "$USER_NAME" -g "$GROUP_NAME" -m 0755 "$PREFIX"
if [[ "$PREFIX" == "/usr/local" ]]; then
  /usr/bin/install -d -o "$USER_NAME" -g "$GROUP_NAME" -m 0755 \
    /usr/local/Homebrew /usr/local/bin /usr/local/etc /usr/local/include \
    /usr/local/lib /usr/local/opt /usr/local/sbin /usr/local/share \
    /usr/local/var /usr/local/Frameworks
fi
umask 077
/usr/bin/printf '%s ALL=(ALL) NOPASSWD: ALL\n' "$USER_NAME" > "$DROP_IN"
/bin/chmod 440 "$DROP_IN"
/usr/sbin/visudo -cf "$DROP_IN"
"#,
        user = user.replace('\'', "'\\''"),
        group = group.replace('\'', "'\\''"),
        prefix = prefix,
        drop_in = HOMEBREW_TEMP_SUDOERS,
    );
    fs::write(&provision_path, script)
        .map_err(|e| format!("Could not write admin setup script: {}", e))?;
    fs::set_permissions(&provision_path, fs::Permissions::from_mode(0o700))
        .map_err(|e| format!("Could not secure admin setup script: {}", e))?;

    let provision_str = provision_path.to_string_lossy().to_string();
    // quoted form of path avoids AppleScript injection from the temp path.
    let apple_script = format!(
        r#"with timeout of 600 seconds
  do shell script "/bin/bash " & quoted form of "{path}" with prompt "DroidDock needs administrator access once to set up Homebrew (used for phone tools). macOS will not ask again for this install." with administrator privileges
end timeout"#,
        path = provision_str.replace('\\', "\\\\").replace('"', "\\\"")
    );

    let output = std::process::Command::new("/usr/bin/osascript")
        .args(["-e", &apple_script])
        .output()
        .map_err(|e| format!("Could not open the macOS password dialog: {}", e))?;
    if output.status.success() {
        return Ok(());
    }
    let err = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    Err(friendly_homebrew_install_error(&err))
}


/// The temporary NOPASSWD drop-in must not remain after Install finishes. `sudo -n rm`
/// the drop-in (works while the drop-in still exists). Does not show another password
/// dialog; if removal fails, returns an error string.
pub(crate) fn remove_homebrew_temp_sudoers() -> Result<(), String> {
    if !PathBuf::from(HOMEBREW_TEMP_SUDOERS).exists() {
        return Ok(());
    }
    let output = std::process::Command::new("/usr/bin/sudo")
        .args(["-n", "/bin/rm", "-f", HOMEBREW_TEMP_SUDOERS])
        .output()
        .map_err(|e| format!("Could not clear temporary admin access: {}", e))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "Could not clear temporary admin access at {}. Ask an admin to remove that file.",
        HOMEBREW_TEMP_SUDOERS
    ))
}


/// Map Homebrew / admin-dialog failures to short next-step copy for the setup screen.
pub(crate) fn friendly_homebrew_install_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("-128")
        || lower.contains("user canceled")
        || lower.contains("user cancelled")
        || lower.contains("(-128)")
    {
        return "Password window was canceled. Try Install again, or use Download from Google below."
            .to_string();
    }
    if lower.contains("insufficient permissions") {
        return "This Mac account could not install Homebrew (an administrator password is required). Try Install again and enter an admin password, or use Download from Google below.".to_string();
    }
    raw.to_string()
}


/// People should not have to paste brew commands. Install must show each required step,
/// keep finished step output, and stop on the first failure. `install_adb_tools` with
/// `setup-install-progress` events. When Homebrew is missing, show the real macOS admin
/// dialog once, keep a temporary sudo session for the installer, run the official
/// non-interactive Homebrew script (download then `script` for live logs), then `brew
/// install android-platform-tools`, then verify adb and store its path. Does not enable
/// USB debugging on the phone, collect the password in the web UI, use AppleScript
/// `display dialog` askpass, or claim install always succeeds (network / non-admin
/// accounts can fail). The setup screen must collect an as-is agreement before calling this.
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

    let mut brew = probe.brew_path.clone();
    if !probe.brew_ready {
        // One native Authorization dialog + temporary sudoers drop-in so Homebrew’s
        // repeated sudo calls do not re-prompt (Terminal-like session).
        let work_dir = new_homebrew_work_dir()?;
        let script_path = work_dir.join("install-homebrew.sh");
        let script_path_str = script_path.to_string_lossy().to_string();

        emit_setup(
            &app,
            SetupInstallEvent {
                step_id: "homebrew".to_string(),
                step_title: "Install Homebrew".to_string(),
                status: "running".to_string(),
                detail: "macOS will ask for your password once…".to_string(),
                log_line: Some(
                    "Enter your Mac login password in the system dialog (lock icon). You should only need to do this once for Homebrew."
                        .to_string(),
                ),
            },
        );
        if let Err(err) = provision_homebrew_admin_session(&work_dir) {
            let _ = fs::remove_dir_all(&work_dir);
            let _ = remove_homebrew_temp_sudoers();
            return Err(err);
        }

        emit_setup(
            &app,
            SetupInstallEvent {
                step_id: "homebrew".to_string(),
                step_title: "Install Homebrew".to_string(),
                status: "running".to_string(),
                detail: "Downloading Homebrew installer…".to_string(),
                log_line: Some(
                    "Downloading the official installer from GitHub (needs network)."
                        .to_string(),
                ),
            },
        );
        let download_result = run_shell_logged(
            &app,
            "/usr/bin/curl",
            vec![
                "-fsSL",
                "-o",
                script_path_str.as_str(),
                "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh",
            ],
            "homebrew",
            "Install Homebrew",
            vec![],
        )
        .await;
        if let Err(err) = download_result {
            let _ = remove_homebrew_temp_sudoers();
            let _ = fs::remove_dir_all(&work_dir);
            return Err(format!(
                "Could not download the Homebrew installer. Check the network and try again. ({})",
                err
            ));
        }

        emit_setup(
            &app,
            SetupInstallEvent {
                step_id: "homebrew".to_string(),
                step_title: "Install Homebrew".to_string(),
                status: "running".to_string(),
                detail: "Running Homebrew installer…".to_string(),
                log_line: Some(
                    "Installing Homebrew. Further password prompts should not appear."
                        .to_string(),
                ),
            },
        );
        let run_via_script = format!(
            "/usr/bin/script -q /dev/null /bin/bash '{}'",
            script_path_str.replace('\'', "'\\''")
        );
        let brew_result = run_shell_logged(
            &app,
            "/bin/bash",
            vec!["-c", run_via_script.as_str()],
            "homebrew",
            "Install Homebrew",
            vec![("NONINTERACTIVE", "1")],
        )
        .await;
        if let Err(cleanup_err) = remove_homebrew_temp_sudoers() {
            emit_setup(
                &app,
                SetupInstallEvent {
                    step_id: "homebrew".to_string(),
                    step_title: "Install Homebrew".to_string(),
                    status: "running".to_string(),
                    detail: "Cleaning up…".to_string(),
                    log_line: Some(cleanup_err),
                },
            );
        }
        let _ = fs::remove_dir_all(&work_dir);
        if let Err(err) = brew_result {
            return Err(friendly_homebrew_install_error(&err));
        }
        brew = find_brew_path();
        if brew.is_none() {
            let candidate = format!("{}/bin/brew", homebrew_prefix_path());
            if PathBuf::from(&candidate).is_file() {
                brew = Some(candidate);
            }
        }
        if brew.is_none() {
            return Err(
                "Homebrew finished, but brew was not found. Open Terminal, run brew, then return here."
                    .to_string(),
            );
        }
    } else {
        emit_setup(
            &app,
            SetupInstallEvent {
                step_id: "homebrew".to_string(),
                step_title: "Install Homebrew".to_string(),
                status: "skipped".to_string(),
                detail: format!("Already installed at {}", brew.clone().unwrap_or_default()),
                log_line: None,
            },
        );
    }

    let brew_bin = brew.ok_or_else(|| "Homebrew is required for this install.".to_string())?;
    run_shell_logged(
        &app,
        &brew_bin,
        vec!["install", "android-platform-tools"],
        "platform-tools",
        "Install Android platform tools",
        vec![],
    )
    .await?;

    // Clear cached path so find_adb_path can pick up the new binary.
    if let Ok(mut guard) = ADB_PATH.lock() {
        *guard = None;
    }
    let adb = find_adb_path().ok_or_else(|| {
        "Platform tools installed, but adb was not found in the usual places.".to_string()
    })?;
    emit_setup(
        &app,
        SetupInstallEvent {
            step_id: "verify".to_string(),
            step_title: "Verify adb".to_string(),
            status: "running".to_string(),
            detail: format!("Checking {}", adb),
            log_line: None,
        },
    );
    match set_adb_path(app.clone(), adb.clone()).await {
        Ok(resolved) => {
            emit_setup(
                &app,
                SetupInstallEvent {
                    step_id: "verify".to_string(),
                    step_title: "Verify adb".to_string(),
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
                    step_id: "verify".to_string(),
                    step_title: "Verify adb".to_string(),
                    status: "failed".to_string(),
                    detail: err.clone(),
                    log_line: None,
                },
            );
            Err(err)
        }
    }
}

