/**
 * macOS blocked-folder message for This Mac, including the Full Disk Access
 * steps. Listing and the rest of the pane stay hidden by the parent while
 * this is showing.
 */
import { invoke } from "@tauri-apps/api/core";

async function openFullDiskAccessSettings() {
  try {
    await invoke("open_mac_full_disk_access_settings");
  } catch {
    window.open(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      "_blank",
    );
  }
}

export function MacAccessPanel({
  path,
  error,
  permissionDenied,
  onGrantFolderAccess,
}: {
  path: string;
  error: string;
  permissionDenied: boolean;
  onGrantFolderAccess: () => void;
}) {
  if (permissionDenied) {
    return (
      <div className="mac-pane-permission" role="alert">
        <h3>macOS blocked this folder</h3>
        <p className="mac-pane-permission-path" title={path}>
          {path}
        </p>
        <p>
          macOS privacy stops apps from reading folders such as Desktop,
          Documents, and Downloads until you grant access.
        </p>
        <p>
          <strong>Grant this folder:</strong> use the button below. A macOS
          window opens — select this same folder (or its parent). macOS then
          grants DroidDock permission to list it. DroidDock never sees your
          login password in that step.
        </p>
        <div className="mac-pane-permission-actions">
          <button type="button" className="mac-pane-primary" onClick={onGrantFolderAccess}>
            Grant access to this folder
          </button>
        </div>
        <div className="mac-pane-permission-fda">
          <p>
            <strong>Or allow all files:</strong> if you want Desktop, Documents,
            Downloads, and other disks without picking each folder:
          </p>
          <ol>
            <li>Open Full Disk Access in System Settings (button below).</li>
            <li>
              Turn on the switch for <strong>DroidDock</strong> (add it with + if it is
              missing).
            </li>
            <li>Quit DroidDock completely, open it again, then return to this folder.</li>
          </ol>
          <button
            type="button"
            className="mac-pane-primary"
            onClick={() => void openFullDiskAccessSettings()}
          >
            Open Full Disk Access settings
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mac-pane-error" role="alert">
        {error}
        <button type="button" onClick={onGrantFolderAccess}>
          Grant access to this folder
        </button>
      </div>
    );
  }

  return null;
}
