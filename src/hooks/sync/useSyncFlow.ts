/**
 * Folder-sync dialog state: paths, direction, options, the scan, progress,
 * the result, and saved syncs. SyncDialog reads this. The shell decides when
 * the dialog is open; the Rust commands are unchanged.
 */
import { SetStateAction, useEffect, useState } from "react";
import { type SyncDirection, type SyncPreview, type SyncProgress, type ScanProgress, type SyncResult, type SavedSync, type SyncOptions } from "../../types/sync";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

export interface UseSyncFlowArgs {
  selectedDevice: string;
  currentPath: string;
  setError: (value: SetStateAction<string>) => void;
  loadFiles: () => Promise<void>;
}

export function useSyncFlow({
  selectedDevice,
  currentPath,
  setError,
  loadFiles,
}: UseSyncFlowArgs) {

  // Sync state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncLocalPath, setSyncLocalPath] = useState("");
  const [syncDevicePath, setSyncDevicePath] = useState("");
  const [syncDirection, setSyncDirection] = useState<SyncDirection>("PhoneToComputer");
  const [syncRecursive, setSyncRecursive] = useState(false);
  const [syncDeleteMissing, setSyncDeleteMissing] = useState(false);
  const [syncAllowCopy, setSyncAllowCopy] = useState(true);
  const [syncAllowUpdate, setSyncAllowUpdate] = useState(true);
  const [syncAllowRename, setSyncAllowRename] = useState(true);
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [syncPreviewing, setSyncPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncScan, setSyncScan] = useState<Partial<Record<ScanProgress["side"], ScanProgress>>>({});
  const [syncScanElapsed, setSyncScanElapsed] = useState(0);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncStep, setSyncStep] = useState<"config" | "preview" | "progress" | "result">("config");
  const [syncMatchMode, setSyncMatchMode] = useState<"filename" | "content">("filename");
  const [syncFilePatterns, setSyncFilePatterns] = useState<string[]>([]);
  const [syncPatternInput, setSyncPatternInput] = useState("");
  const [savedSyncs, setSavedSyncs] = useState<SavedSync[]>([]);
  const [activeSavedSyncId, setActiveSavedSyncId] = useState<string | null>(null);
  const [showSaveSyncInput, setShowSaveSyncInput] = useState(false);
  const [showAdvancedSync, setShowAdvancedSync] = useState(false);
  const [saveSyncName, setSaveSyncName] = useState("");

  // Scanning covers both the preview and the pre-transfer scan inside execute, until the first transfer progress arrives
  const syncScanning = syncPreviewing || (syncing && syncProgress === null);

  useEffect(() => {
    if (!syncScanning) return;
    const started = Date.now();
    setSyncScanElapsed(0);
    const timer = setInterval(() => setSyncScanElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [syncScanning]);

  // Sync handlers
  function handleOpenSyncDialog() {
    setSyncDevicePath(currentPath);
    setSyncLocalPath("");
    setSyncDirection("PhoneToComputer");
    setSyncRecursive(false);
    setSyncDeleteMissing(false);
    setSyncAllowCopy(true);
    setSyncAllowUpdate(true);
    setSyncAllowRename(true);
    setSyncPreview(null);
    setSyncResult(null);
    setSyncProgress(null);
    setSyncStep("config");
    setSyncMatchMode("filename");
    setSyncFilePatterns([]);
    setActiveSavedSyncId(null);
    setShowSaveSyncInput(false);
    setSaveSyncName("");
    setShowAdvancedSync(false);
    invoke<SavedSync[]>("list_saved_syncs")
      .then(setSavedSyncs)
      .catch((err) => setError(`Failed to load saved syncs: ${err}`));
    setSyncDialogOpen(true);
  }

  async function handleSelectSyncLocalFolder() {
    try {
      const selected = await open({
        directory: true,
        title: "Select local folder to sync",
      });
      if (selected && typeof selected === "string") {
        setSyncLocalPath(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  }

  async function handlePreviewSync() {
    if (!syncLocalPath || !syncDevicePath || !selectedDevice) return;
    setSyncPreviewing(true);
    setSyncScan({});
    setError("");
    const unlistenScan = await listen<ScanProgress>("sync-scan-progress", (event) => {
      setSyncScan((prev) => ({ ...prev, [event.payload.side]: event.payload }));
    });
    try {
      // Include any pattern currently typed in the input field
      const patterns = syncPatternInput.trim()
        ? [...syncFilePatterns, syncPatternInput.trim()]
        : syncFilePatterns;
      if (syncPatternInput.trim()) {
        setSyncFilePatterns(patterns);
        setSyncPatternInput("");
      }
      const options: SyncOptions = {
        local_path: syncLocalPath,
        device_path: syncDevicePath,
        direction: syncDirection,
        recursive: syncRecursive,
        delete_missing: syncDeleteMissing,
        match_mode: syncMatchMode,
        file_patterns: patterns,
        allow_copy: syncAllowCopy,
        allow_update: syncAllowUpdate,
        allow_rename: syncAllowRename,
      };
      const preview = await invoke<SyncPreview>("preview_sync", {
        deviceId: selectedDevice,
        options,
      });
      setSyncPreview(preview);
      setSyncStep("preview");
    } catch (err) {
      setError(`Sync preview failed: ${err}`);
    } finally {
      setSyncPreviewing(false);
      unlistenScan();
    }
  }

  async function handleExecuteSync() {
    if (!syncLocalPath || !syncDevicePath || !selectedDevice) return;
    setSyncing(true);
    setSyncStep("progress");
    setSyncProgress(null);
    setSyncScan({});

    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      setSyncProgress(event.payload);
    });
    const unlistenScan = await listen<ScanProgress>("sync-scan-progress", (event) => {
      setSyncScan((prev) => ({ ...prev, [event.payload.side]: event.payload }));
    });

    try {
      const options: SyncOptions = {
        local_path: syncLocalPath,
        device_path: syncDevicePath,
        direction: syncDirection,
        recursive: syncRecursive,
        delete_missing: syncDeleteMissing,
        match_mode: syncMatchMode,
        file_patterns: syncFilePatterns,
        allow_copy: syncAllowCopy,
        allow_update: syncAllowUpdate,
        allow_rename: syncAllowRename,
      };
      const result = await invoke<SyncResult>("execute_sync", {
        deviceId: selectedDevice,
        options,
      });
      setSyncResult(result);
      setSyncStep("result");
    } catch (err) {
      setError(`Sync failed: ${err}`);
      setSyncStep("config");
    } finally {
      setSyncing(false);
      unlisten();
      unlistenScan();
    }
  }

  function handleCloseSyncDialog() {
    if (syncing || syncPreviewing) return;
    setSyncDialogOpen(false);
    setSyncFilePatterns([]);
    setSyncPatternInput("");
    if (syncResult && syncResult.success_count > 0) {
      loadFiles();
    }
  }

  function handleLoadSavedSync(saved: SavedSync) {
    setSyncLocalPath(saved.options.local_path);
    setSyncDevicePath(saved.options.device_path);
    setSyncDirection(saved.options.direction);
    setSyncRecursive(saved.options.recursive);
    setSyncDeleteMissing(saved.options.delete_missing);
    setSyncAllowCopy(saved.options.allow_copy ?? true);
    setSyncAllowUpdate(saved.options.allow_update ?? true);
    setSyncAllowRename(saved.options.allow_rename ?? true);
    setSyncMatchMode(saved.options.match_mode as "filename" | "content");
    setSyncFilePatterns(saved.options.file_patterns);
    setSyncPatternInput("");
    setActiveSavedSyncId(saved.id);
    setShowSaveSyncInput(false);
  }

  async function handleSaveSyncConfig() {
    if (!saveSyncName.trim()) return;
    const options: SyncOptions = {
      local_path: syncLocalPath,
      device_path: syncDevicePath,
      direction: syncDirection,
      recursive: syncRecursive,
      delete_missing: syncDeleteMissing,
      match_mode: syncMatchMode,
      file_patterns: syncFilePatterns,
      allow_copy: syncAllowCopy,
      allow_update: syncAllowUpdate,
      allow_rename: syncAllowRename,
    };
    try {
      const saved = await invoke<SavedSync>("save_sync_config", {
        id: activeSavedSyncId ?? undefined,
        name: saveSyncName.trim(),
        options,
      });
      setSavedSyncs((prev) => {
        const filtered = prev.filter((s) => s.id !== saved.id);
        return [...filtered, saved];
      });
      setActiveSavedSyncId(saved.id);
      setShowSaveSyncInput(false);
      setSaveSyncName("");
    } catch (err) {
      setError(`Failed to save sync: ${err}`);
    }
  }

  async function handleDeleteSavedSync(id: string) {
    try {
      await invoke("delete_saved_sync", { id });
      setSavedSyncs((prev) => prev.filter((s) => s.id !== id));
      if (activeSavedSyncId === id) setActiveSavedSyncId(null);
    } catch (err) {
      setError(`Failed to delete saved sync: ${err}`);
    }
  }

  return {
    syncDialogOpen,
    syncLocalPath,
    setSyncLocalPath,
    syncDevicePath,
    setSyncDevicePath,
    syncDirection,
    setSyncDirection,
    syncRecursive,
    setSyncRecursive,
    syncDeleteMissing,
    setSyncDeleteMissing,
    syncAllowCopy,
    setSyncAllowCopy,
    syncAllowUpdate,
    setSyncAllowUpdate,
    syncAllowRename,
    setSyncAllowRename,
    syncPreview,
    syncPreviewing,
    syncing,
    syncProgress,
    syncScan,
    syncScanElapsed,
    syncResult,
    syncStep,
    setSyncStep,
    syncMatchMode,
    setSyncMatchMode,
    syncFilePatterns,
    setSyncFilePatterns,
    syncPatternInput,
    setSyncPatternInput,
    savedSyncs,
    activeSavedSyncId,
    setActiveSavedSyncId,
    showSaveSyncInput,
    setShowSaveSyncInput,
    showAdvancedSync,
    setShowAdvancedSync,
    saveSyncName,
    setSaveSyncName,
    handleOpenSyncDialog,
    handleSelectSyncLocalFolder,
    handlePreviewSync,
    handleExecuteSync,
    handleCloseSyncDialog,
    handleLoadSavedSync,
    handleSaveSyncConfig,
    handleDeleteSavedSync,
  };
}
