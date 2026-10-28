/**
 * Download options: whether to show the folder afterward, and the default when
 * a file name is already taken. Continue starts the copy. If names still clash,
 * the conflict dialog asks before anything is overwritten.
 */
import type { SetStateAction } from "react";
import { type FileEntry } from "../../lib/file-types";
import { selectionSizeSummary } from "../explorer/StatusBar";
import { type ConflictMode } from "../../types/transfer";

export interface DownloadOptionsDialogProps {
  files: FileEntry[];
  selectedFiles: Set<string>;
  searchResults: FileEntry[];
  conflictMode: "replace" | "skip" | "keepBoth";
  setConflictMode: (value: SetStateAction<ConflictMode>) => void;
  revealAfterDownload: boolean;
  setRevealAfterDownload: (value: SetStateAction<boolean>) => void;
  setDownloadOptionsOpen: (value: SetStateAction<boolean>) => void;
  performDownload: () => Promise<void>;
}

export function DownloadOptionsDialog({
  files,
  selectedFiles,
  searchResults,
  conflictMode,
  setConflictMode,
  revealAfterDownload,
  setRevealAfterDownload,
  setDownloadOptionsOpen,
  performDownload,
}: DownloadOptionsDialogProps) {
  const entries = Array.from(selectedFiles)
    .map(
      (name) =>
        files.find((f) => f.name === name) ||
        searchResults.find((f) => f.name === name),
    )
    .filter((f): f is FileEntry => !!f);
  const folderCount = entries.filter((f) => f.is_directory).length;
  const fileCount = entries.length - folderCount;
  const parts = [];
  if (fileCount > 0)
    parts.push(`${fileCount} file${fileCount === 1 ? "" : "s"}`);
  if (folderCount > 0)
    parts.push(`${folderCount} folder${folderCount === 1 ? "" : "s"}`);
  return (
    <div
      className="modal-overlay"
      onClick={() => setDownloadOptionsOpen(false)}
    >
      <div
        className="modal-dialog download-options-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Download Options</h3>
        <p className="download-options-summary">
          {parts.join(", ")} selected
          {selectionSizeSummary(
            entries.map((entry) => entry.name),
            entries,
          ).sizeFragment}
        </p>
        <p className="download-options-summary">
          If names already exist, you will be asked before copying. The
          choice below is only the default suggestion.
        </p>
        <div className="conflict-options">
          {(
            [
              [
                "skip",
                "Skip duplicates",
                "Files that already exist are left alone",
              ],
              [
                "replace",
                "Replace",
                "Files that already exist are overwritten",
              ],
              [
                "keepBoth",
                "Keep both",
                'Duplicates are saved as "name (1).ext"',
              ],
            ] as [ConflictMode, string, string][]
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`conflict-option ${conflictMode === value ? "active" : ""}`}
            >
              <input
                type="radio"
                name="conflict-mode"
                value={value}
                checked={conflictMode === value}
                onChange={() => setConflictMode(value)}
              />
              <span className="conflict-option-label">{label}</span>
              <span className="conflict-option-hint">{hint}</span>
            </label>
          ))}
        </div>
        <label className="reveal-option">
          <input
            type="checkbox"
            checked={revealAfterDownload}
            onChange={(e) => setRevealAfterDownload(e.target.checked)}
          />
          <span>Reveal in Finder when done</span>
        </label>
        <div className="modal-actions">
          <button
            onClick={() => setDownloadOptionsOpen(false)}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setDownloadOptionsOpen(false);
              performDownload();
            }}
            className="download-btn"
          >
            Continue…
          </button>
        </div>
      </div>
    </div>
  );
        }
