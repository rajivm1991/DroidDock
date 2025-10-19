import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface AdbDevice {
  id: string;
  status: string;
}

interface FileEntry {
  name: string;
  permissions: string;
  size: string;
  date: string;
  is_directory: boolean;
}

function App() {
  const [adbAvailable, setAdbAvailable] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("/storage/emulated/0");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(false);
  const [adbPath, setAdbPath] = useState<string>("");
  const [customAdbPath, setCustomAdbPath] = useState<string>("");

  // Check if ADB is available on startup
  useEffect(() => {
    checkAdb();
  }, []);

  // Load devices when ADB becomes available
  useEffect(() => {
    if (adbAvailable) {
      loadDevices();
    }
  }, [adbAvailable]);

  // Load files when device or path changes
  useEffect(() => {
    if (selectedDevice && currentPath) {
      loadFiles();
    }
  }, [selectedDevice, currentPath]);

  async function checkAdb() {
    try {
      const currentPath = await invoke<string>("get_current_adb_path");
      setAdbPath(currentPath);

      const available = await invoke<boolean>("check_adb");
      setAdbAvailable(available);
    } catch (err) {
      setAdbAvailable(false);
      setError("ADB is not installed or not in PATH");
    }
  }

  async function setCustomAdb() {
    if (!customAdbPath) return;

    try {
      await invoke("set_adb_path", { path: customAdbPath });
      setError("");
      await checkAdb();
    } catch (err) {
      setError(`Failed to set ADB path: ${err}`);
    }
  }

  async function loadDevices() {
    try {
      setError("");
      const deviceList = await invoke<AdbDevice[]>("get_devices");
      setDevices(deviceList);
      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0].id);
      } else if (deviceList.length === 0) {
        setError("No devices connected. Please connect an Android device via ADB.");
      }
    } catch (err) {
      setError(`Failed to get devices: ${err}`);
    }
  }

  async function loadFiles() {
    try {
      setLoading(true);
      setError("");
      const fileList = await invoke<FileEntry[]>("list_files", {
        deviceId: selectedDevice,
        path: currentPath,
      });
      setFiles(fileList);
    } catch (err) {
      setError(`Failed to list files: ${err}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  function navigateToDirectory(dirName: string) {
    const newPath = currentPath === "/"
      ? `/${dirName}`
      : `${currentPath}/${dirName}`;
    setCurrentPath(newPath);
  }

  function navigateUp() {
    if (currentPath === "/") return;
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    setCurrentPath(parentPath);
  }

  function getPathSegments() {
    return currentPath.split("/").filter(Boolean);
  }

  function navigateToSegment(index: number) {
    const segments = getPathSegments();
    const newPath = "/" + segments.slice(0, index + 1).join("/");
    setCurrentPath(newPath);
  }

  function getVisibleFiles() {
    if (showHiddenFiles) {
      return files;
    }
    return files.filter(file => !file.name.startsWith('.'));
  }

  if (adbAvailable === false) {
    return (
      <div className="container">
        <div className="error-screen">
          <h1>ADB Not Found</h1>
          <p>DroidDock requires ADB (Android Debug Bridge) to be installed.</p>
          {adbPath && <p className="adb-path-info">Tried: {adbPath}</p>}

          <div className="adb-setup">
            <h3>Option 1: Install ADB</h3>
            <p>Install via Homebrew: <code>brew install android-platform-tools</code></p>
            <p>Or download from: <a href="https://developer.android.com/tools/releases/platform-tools" target="_blank">Android Platform Tools</a></p>

            <h3>Option 2: Set Custom ADB Path</h3>
            <p>If you already have ADB installed, specify its location:</p>
            <div className="custom-path-input">
              <input
                type="text"
                placeholder="/opt/homebrew/bin/adb"
                value={customAdbPath}
                onChange={(e) => setCustomAdbPath(e.target.value)}
              />
              <button onClick={setCustomAdb}>Set Path</button>
            </div>
            <p className="hint">Common locations: /opt/homebrew/bin/adb, /usr/local/bin/adb</p>
          </div>

          <button onClick={checkAdb} className="retry-btn">Retry Detection</button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header>
        <h1>DroidDock</h1>
        <div className="device-selector">
          <label>Device:</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={devices.length === 0}
          >
            <option value="">Select a device</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.id} ({device.status})
              </option>
            ))}
          </select>
          <button onClick={loadDevices}>Refresh</button>
          <button
            onClick={() => setShowHiddenFiles(!showHiddenFiles)}
            className={showHiddenFiles ? "toggle-active" : ""}
          >
            {showHiddenFiles ? "Hide" : "Show"} Hidden
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {selectedDevice && (
        <>
          <div className="breadcrumb">
            <button onClick={() => setCurrentPath("/")} className="breadcrumb-btn">
              /
            </button>
            {getPathSegments().map((segment, index) => (
              <span key={index}>
                <span className="separator">/</span>
                <button
                  onClick={() => navigateToSegment(index)}
                  className="breadcrumb-btn"
                >
                  {segment}
                </button>
              </span>
            ))}
            {currentPath !== "/" && (
              <button onClick={navigateUp} className="up-btn">
                ↑ Up
              </button>
            )}
          </div>

          <div className="file-list">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Date</th>
                    <th>Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {getVisibleFiles().map((file, index) => (
                    <tr
                      key={index}
                      onDoubleClick={() => file.is_directory && navigateToDirectory(file.name)}
                      className={file.is_directory ? "directory" : "file"}
                    >
                      <td>
                        <span className="icon">{file.is_directory ? "📁" : "📄"}</span>
                        {file.name}
                      </td>
                      <td>{file.is_directory ? "-" : file.size}</td>
                      <td>{file.date}</td>
                      <td className="permissions">{file.permissions}</td>
                    </tr>
                  ))}
                  {getVisibleFiles().length === 0 && !loading && (
                    <tr>
                      <td colSpan={4} className="empty">
                        {showHiddenFiles ? "No files in this directory" : "No visible files (hidden files are filtered)"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default App;
