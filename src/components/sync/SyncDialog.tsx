/**
 * Folder sync: setup, preview, progress, and the result. The parent keeps the
 * sync state, talks to Rust, and saves presets. This dialog does not open itself.
 */

import { formatBytes } from "../../lib/format";
import { SyncScanPanel, type SyncScanMap } from "./SyncScanPanel";
import type {
  SavedSync,
  SyncDirection,
  SyncPreview,
  SyncProgress,
  SyncResult,
} from "../../types/sync";

export type SyncStep = "config" | "preview" | "progress" | "result";

export interface SyncDialogProps {
  syncStep: SyncStep;
  syncPreviewing: boolean;
  syncScan: SyncScanMap;
  syncScanElapsed: number;
  savedSyncs: SavedSync[];
  activeSavedSyncId: string | null;
  onActiveSavedSyncIdChange: (id: string | null) => void;
  onLoadSavedSync: (saved: SavedSync) => void;
  onDeleteSavedSync: (id: string) => void;
  syncLocalPath: string;
  onSyncLocalPathChange: (value: string) => void;
  onSelectSyncLocalFolder: () => void;
  syncDevicePath: string;
  onSyncDevicePathChange: (value: string) => void;
  syncMatchMode: "filename" | "content";
  onSyncMatchModeChange: (mode: "filename" | "content") => void;
  syncDirection: SyncDirection;
  onSyncDirectionChange: (direction: SyncDirection) => void;
  syncRecursive: boolean;
  onSyncRecursiveChange: (value: boolean) => void;
  syncAllowCopy: boolean;
  onSyncAllowCopyChange: (value: boolean) => void;
  syncAllowUpdate: boolean;
  onSyncAllowUpdateChange: (value: boolean) => void;
  syncAllowRename: boolean;
  onSyncAllowRenameChange: (value: boolean) => void;
  syncDeleteMissing: boolean;
  onSyncDeleteMissingChange: (value: boolean) => void;
  showAdvancedSync: boolean;
  onToggleAdvancedSync: () => void;
  syncFilePatterns: string[];
  onSyncFilePatternsChange: (patterns: string[]) => void;
  syncPatternInput: string;
  onSyncPatternInputChange: (value: string) => void;
  showSaveSyncInput: boolean;
  onShowSaveSyncInputChange: (value: boolean) => void;
  saveSyncName: string;
  onSaveSyncNameChange: (value: string) => void;
  onSaveSyncConfig: () => void;
  onPreviewSync: () => void;
  onExecuteSync: () => void;
  onClose: () => void;
  onBackToConfig: () => void;
  syncPreview: SyncPreview | null;
  syncProgress: SyncProgress | null;
  syncResult: SyncResult | null;
}

export function SyncDialog(props: SyncDialogProps) {
  const {
    syncStep,
    syncPreviewing,
    syncScan,
    syncScanElapsed,
    savedSyncs,
    activeSavedSyncId,
    onActiveSavedSyncIdChange,
    onLoadSavedSync,
    onDeleteSavedSync,
    syncLocalPath,
    onSyncLocalPathChange,
    onSelectSyncLocalFolder,
    syncDevicePath,
    onSyncDevicePathChange,
    syncMatchMode,
    onSyncMatchModeChange,
    syncDirection,
    onSyncDirectionChange,
    syncRecursive,
    onSyncRecursiveChange,
    syncAllowCopy,
    onSyncAllowCopyChange,
    syncAllowUpdate,
    onSyncAllowUpdateChange,
    syncAllowRename,
    onSyncAllowRenameChange,
    syncDeleteMissing,
    onSyncDeleteMissingChange,
    showAdvancedSync,
    onToggleAdvancedSync,
    syncFilePatterns,
    onSyncFilePatternsChange,
    syncPatternInput,
    onSyncPatternInputChange,
    showSaveSyncInput,
    onShowSaveSyncInputChange,
    saveSyncName,
    onSaveSyncNameChange,
    onSaveSyncConfig,
    onPreviewSync,
    onExecuteSync,
    onClose,
    onBackToConfig,
    syncPreview,
    syncProgress,
    syncResult,
  } = props;

  const scanPanel = (
    <SyncScanPanel syncScan={syncScan} syncScanElapsed={syncScanElapsed} />
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
        <div className="modal-dialog sync-dialog" onClick={(e) => e.stopPropagation()}>
          {syncStep === "config" && (
            <>
              <h3>Folder Sync</h3>

              {syncPreviewing && scanPanel}

              <div className={`sync-form ${syncPreviewing ? "sync-form-hidden" : ""}`}>
                {savedSyncs.length > 0 && (
                  <div className="sync-form-group">
                    <label>Saved Syncs</label>
                    <div className="sync-saved-row">
                      <select
                        value={activeSavedSyncId ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "") {
                            onActiveSavedSyncIdChange(null);
                          } else {
                            const found = savedSyncs.find((s) => s.id === e.target.value);
                            if (found) onLoadSavedSync(found);
                          }
                        }}
                      >
                        <option value="">—</option>
                        {savedSyncs.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      {activeSavedSyncId && (
                        <button
                          className="sync-delete-saved-btn"
                          title="Delete this saved sync"
                          onClick={() => onDeleteSavedSync(activeSavedSyncId)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="sync-form-group">
                  <label>Computer Folder</label>
                  <div className="sync-path-input">
                    <input
                      type="text"
                      value={syncLocalPath}
                      onChange={(e) => onSyncLocalPathChange(e.target.value)}
                      placeholder="Select a local folder..."
                      readOnly
                    />
                    <button onClick={onSelectSyncLocalFolder}>Browse</button>
                  </div>
                </div>

                <div className="sync-form-group">
                  <label>Phone Folder</label>
                  <div className="sync-path-input">
                    <input
                      type="text"
                      value={syncDevicePath}
                      onChange={(e) => onSyncDevicePathChange(e.target.value)}
                      placeholder="/storage/emulated/0/Music"
                    />
                  </div>
                </div>

                <div className="sync-form-group">
                  <label>Compare files by</label>
                  <div className="sync-radio-group">
                    <label className="sync-radio-label">
                      <input
                        type="radio"
                        name="syncMatchMode"
                        checked={syncMatchMode === "filename"}
                        onChange={() => onSyncMatchModeChange("filename")}
                      />
                      <span className="sync-checkbox-text">
                        Name and date
                        <span className="sync-checkbox-hint">
                          Same path means same file. Copied again if the size differs or the source is newer. Fast.
                        </span>
                      </span>
                    </label>
                    <label className="sync-radio-label">
                      <input
                        type="radio"
                        name="syncMatchMode"
                        checked={syncMatchMode === "content"}
                        onChange={() => onSyncMatchModeChange("content")}
                      />
                      <span className="sync-checkbox-text">
                        Content
                        <span className="sync-checkbox-hint">
                          Compares MD5 hashes, so renamed files aren't re-copied. Slower, reads every file.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="sync-direction-options-row">
                  <div className="sync-form-group">
                    <label>Sync Direction</label>
                    <div className="sync-radio-group">
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "PhoneToComputer"}
                          onChange={() => onSyncDirectionChange("PhoneToComputer")}
                        />
                        Phone → Computer
                      </label>
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "ComputerToPhone"}
                          onChange={() => onSyncDirectionChange("ComputerToPhone")}
                        />
                        Computer → Phone
                      </label>
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "BothWays"}
                          onChange={() => {
                            onSyncDirectionChange("BothWays");
                            onSyncDeleteMissingChange(false);
                          }}
                        />
                        Both Ways
                      </label>
                    </div>
                  </div>

                  <div className="sync-form-group">
                    <label>Options</label>
                    <div className="sync-options-group">
                      <label className="sync-checkbox-label">
                        <input
                          type="checkbox"
                          checked={syncRecursive}
                          onChange={(e) => onSyncRecursiveChange(e.target.checked)}
                        />
                        Include subfolders
                      </label>
                      <label className="sync-checkbox-label">
                        <input
                          type="checkbox"
                          checked={syncAllowCopy}
                          onChange={(e) => onSyncAllowCopyChange(e.target.checked)}
                        />
                        <span className="sync-checkbox-text">
                          Copy new files
                          <span className="sync-checkbox-hint">Files that exist only on the source side</span>
                        </span>
                      </label>
                      <label className="sync-checkbox-label">
                        <input
                          type="checkbox"
                          checked={syncAllowUpdate}
                          onChange={(e) => onSyncAllowUpdateChange(e.target.checked)}
                        />
                        <span className="sync-checkbox-text">
                          Update changed files
                          <span className="sync-checkbox-hint">Same path, different size, date or content</span>
                        </span>
                      </label>
                      <label className={`sync-checkbox-label ${syncMatchMode !== "content" ? "disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={syncAllowRename}
                          disabled={syncMatchMode !== "content"}
                          onChange={(e) => onSyncAllowRenameChange(e.target.checked)}
                        />
                        <span className="sync-checkbox-text">
                          Rename moved files
                          <span className="sync-checkbox-hint">
                            Needs Compare files by: Content. When off, a renamed file is copied under its new name
                          </span>
                        </span>
                      </label>
                      <label className={`sync-checkbox-label ${syncDirection === "BothWays" ? "disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={syncDeleteMissing}
                          disabled={syncDirection === "BothWays"}
                          onChange={(e) => onSyncDeleteMissingChange(e.target.checked)}
                        />
                        <span className="sync-checkbox-text">
                          Delete missing files
                          <span className="sync-checkbox-hint">Not available for Both Ways</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <button
                  className="sync-advanced-toggle"
                  onClick={onToggleAdvancedSync}
                >
                  {showAdvancedSync ? "▾" : "▸"} Advanced
                </button>

                {showAdvancedSync && (
                  <div className="sync-advanced-section">
                    <div className="sync-form-group">
                      <label>File Patterns</label>
                      {syncFilePatterns.length > 0 && (
                        <div className="sync-pattern-chips">
                          {syncFilePatterns.map((pattern, idx) => (
                            <span key={idx} className="sync-pattern-chip">
                              {pattern}
                              <button
                                onClick={() => onSyncFilePatternsChange(syncFilePatterns.filter((_, i) => i !== idx))}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="sync-path-input">
                        <input
                          type="text"
                          value={syncPatternInput}
                          onChange={(e) => onSyncPatternInputChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && syncPatternInput.trim()) {
                              e.preventDefault();
                              onSyncFilePatternsChange([...syncFilePatterns, syncPatternInput.trim()]);
                              onSyncPatternInputChange("");
                            }
                          }}
                          placeholder="e.g. DCIM/Camera/*.jpg"
                        />
                        <button
                          onClick={() => {
                            if (syncPatternInput.trim()) {
                              onSyncFilePatternsChange([...syncFilePatterns, syncPatternInput.trim()]);
                              onSyncPatternInputChange("");
                            }
                          }}
                        >
                          Add
                        </button>
                      </div>
                      <span className="sync-pattern-hint">
                        Leave empty to sync all files. Use * for any filename, ** for any subdirectories.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button onClick={onClose} className="cancel-btn">
                  Cancel
                </button>
                <button
                  className="sync-save-btn"
                  disabled={!syncLocalPath || !syncDevicePath}
                  onClick={() => {
                    const existing = activeSavedSyncId
                      ? savedSyncs.find((s) => s.id === activeSavedSyncId)?.name ?? ""
                      : "";
                    onSaveSyncNameChange(existing);
                    onShowSaveSyncInputChange(true);
                  }}
                >
                  Save
                </button>
                <button
                  onClick={onPreviewSync}
                  disabled={!syncLocalPath || !syncDevicePath || syncPreviewing}
                  className="sync-confirm-btn"
                >
                  {syncPreviewing ? "Scanning..." : "Preview"}
                </button>
              </div>

              {showSaveSyncInput && (
                <div className="sync-save-input-row">
                  <input
                    type="text"
                    value={saveSyncName}
                    onChange={(e) => onSaveSyncNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSaveSyncConfig();
                      if (e.key === "Escape") onShowSaveSyncInputChange(false);
                    }}
                    placeholder="Name this sync (e.g. Photos backup)"
                    autoFocus
                  />
                  <button
                    onClick={onSaveSyncConfig}
                    disabled={!saveSyncName.trim()}
                    className="sync-save-confirm-btn"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => onShowSaveSyncInputChange(false)}
                    className="sync-save-cancel-btn"
                  >
                    ✕
                  </button>
                </div>
              )}
            </>
          )}

          {syncStep === "preview" && syncPreview && (
            <>
              <h3>Sync Preview</h3>
              {syncPreview.actions.length === 0 ? (
                <div className="sync-in-sync-message">
                  Everything is already in sync.
                </div>
              ) : (
                <>
                  <div className="sync-preview-summary">
                    {syncPreview.copy_count > 0 && (
                      <span className="sync-preview-stat">
                        <span className="action-badge copy">Copy</span> {syncPreview.copy_count}
                      </span>
                    )}
                    {syncPreview.update_count > 0 && (
                      <span className="sync-preview-stat">
                        <span className="action-badge update">Update</span> {syncPreview.update_count}
                      </span>
                    )}
                    {syncPreview.delete_count > 0 && (
                      <span className="sync-preview-stat">
                        <span className="action-badge delete">Delete</span> {syncPreview.delete_count}
                      </span>
                    )}
                    {syncPreview.rename_count > 0 && (
                      <span className="sync-preview-stat">
                        <span className="action-badge rename">Rename</span> {syncPreview.rename_count}
                      </span>
                    )}
                    <span className="sync-preview-stat">
                      Transfer: {formatBytes(syncPreview.total_transfer_bytes)}
                    </span>
                  </div>

                  <div className="sync-preview-table-container">
                    <table className="sync-preview-table">
                      <thead>
                        <tr>
                          <th>File</th>
                          <th>Action</th>
                          <th>Direction</th>
                          <th>Size</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncPreview.actions.map((action, i) => (
                          <tr key={i} className={`action-${action.action_type}`}>
                            <td title={action.reason}>
                              {action.action_type === "rename" && action.rename_from
                                ? <>{action.rename_from} → {action.file_path}</>
                                : action.file_path}
                            </td>
                            <td>
                              <span className={`action-badge ${action.action_type}`}>
                                {action.action_type}
                              </span>
                            </td>
                            <td>{action.direction}</td>
                            <td>{formatBytes(action.size)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="modal-actions">
                <button onClick={onBackToConfig} className="cancel-btn">
                  Back
                </button>
                {syncPreview.actions.length > 0 && (
                  <button onClick={onExecuteSync} className="sync-confirm-btn">
                    Start Sync
                  </button>
                )}
              </div>
            </>
          )}

          {syncStep === "progress" && (
            <>
              <h3>Syncing...</h3>
              <div className="sync-progress-container">
                {syncProgress && (
                  <>
                    <div className="sync-progress-file">
                      {syncProgress.current_file}
                    </div>
                    <div className="sync-progress-bar">
                      <div
                        className="sync-progress-bar-fill"
                        style={{
                          width: `${syncProgress.total_count > 0
                            ? (syncProgress.completed_count / syncProgress.total_count) * 100
                            : 0}%`
                        }}
                      />
                    </div>
                    <div className="sync-progress-stats">
                      <span>{syncProgress.completed_count} / {syncProgress.total_count} files</span>
                      <span>{formatBytes(syncProgress.completed_bytes)} / {formatBytes(syncProgress.total_bytes)}</span>
                    </div>
                  </>
                )}
                {!syncProgress && (Object.keys(syncScan).length > 0 ? scanPanel : <p>Starting sync...</p>)}
              </div>
            </>
          )}

          {syncStep === "result" && syncResult && (
            <>
              <h3>Sync Complete</h3>
              <div className="sync-result-summary">
                <div className="sync-result-stat">
                  <span>Successful</span>
                  <span>{syncResult.success_count}</span>
                </div>
                {(
                  [
                    ["copy", "Copied", syncResult.copied_count],
                    ["update", "Updated", syncResult.updated_count],
                    ["rename", "Renamed", syncResult.renamed_count],
                    ["delete", "Deleted", syncResult.deleted_count],
                  ] as const
                )
                  .filter(([, , count]) => count > 0)
                  .map(([type, label, count]) => (
                    <div key={type} className="sync-result-stat sync-result-sub">
                      <span className={`action-badge ${type}`}>{label}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                {syncResult.skip_count > 0 && (
                  <div className="sync-result-stat">
                    <span>Skipped</span>
                    <span>{syncResult.skip_count}</span>
                  </div>
                )}
                {syncResult.error_count > 0 && (
                  <div className="sync-result-stat">
                    <span>Errors</span>
                    <span>{syncResult.error_count}</span>
                  </div>
                )}
                {syncResult.errors.length > 0 && (
                  <div className="sync-errors-list">
                    {syncResult.errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button onClick={onClose} className="sync-confirm-btn">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
  );
}
