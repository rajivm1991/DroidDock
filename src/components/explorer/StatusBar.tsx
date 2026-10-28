/**
 * Bottom bar: Phone and This Mac storage when that side is open, plus how many
 * items are listed and how much of the selection is sized. A side with no path
 * or phone shows no meter. Folder totals are not walked here.
 */

import type { FileEntry } from "../../lib/file-types";
import { formatBytes } from "../../lib/format";

export interface StorageInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percentage_used: number;
}

/**
 * List/ls only reports file byte sizes. Walking every selected folder over USB on each
 * click would be slow and incomplete; Copy expands folders into the transfer queue when
 * true totals matter. Sum selected files only; when folders are selected, say they are
 * not sized so a smaller total is not mistaken for a bug. Does not recursively scan
 * folders or invent sizes for directories.
 */
export interface SelectionSizeSummary {
  fileCount: number;
  folderCount: number;
  fileBytes: number;
  /** Leading “ · …” fragment for the status bar Selected line, or "". */
  sizeFragment: string;
}

export function selectionSizeSummary(
  names: Set<string> | string[],
  entries: FileEntry[],
): SelectionSizeSummary {
  // Index once — Columns/search pools can be large and were scanned with
  // repeated .find() per name (easy to miss Mac sizes when the open-folder
  // list alone did not contain the selected rows).
  const byName = new Map<string, FileEntry>();
  for (const entry of entries) {
    if (!byName.has(entry.name)) byName.set(entry.name, entry);
  }
  let fileCount = 0;
  let folderCount = 0;
  let fileBytes = 0;
  for (const name of names) {
    const entry = byName.get(name);
    if (!entry) continue;
    if (entry.is_directory) {
      folderCount += 1;
    } else {
      fileCount += 1;
      fileBytes += Number(entry.size) || 0;
    }
  }
  const parts: string[] = [];
  if (fileBytes > 0) {
    parts.push(
      folderCount > 0
        ? `${formatBytes(fileBytes)} in files`
        : formatBytes(fileBytes),
    );
  }
  if (folderCount > 0) {
    parts.push("folders not sized");
  }
  return {
    fileCount,
    folderCount,
    fileBytes,
    sizeFragment: parts.length > 0 ? ` · ${parts.join(" · ")}` : "",
  };
}

interface StatusBarProps {
  phoneStorage: StorageInfo | null;
  macStorage: StorageInfo | null;
  fileCount: number;
  selectedCount: number;
  /** “ · 12 MB …” / “ · folders not sized” after the Selected count. */
  selectedSizeFragment: string;
}

function StorageMeter({ label, info }: { label: string; info: StorageInfo }) {
  const fill =
    info.percentage_used > 90
      ? "#333333"
      : info.percentage_used > 75
        ? "#666666"
        : "#999999";
  return (
    <div className="status-item storage-item">
      <span className="status-label">{label}</span>
      <span className="storage-text">
        {formatBytes(info.used_bytes)} / {formatBytes(info.total_bytes)}
        {" "}({info.percentage_used.toFixed(0)}% used)
      </span>
      <div className="storage-bar" aria-hidden>
        <div
          className="storage-bar-fill"
          style={{
            width: `${Math.min(info.percentage_used, 100)}%`,
            backgroundColor: fill,
          }}
        />
      </div>
    </div>
  );
}

export function StatusBar({
  phoneStorage,
  macStorage,
  fileCount,
  selectedCount,
  selectedSizeFragment,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      {phoneStorage && <StorageMeter label="Phone" info={phoneStorage} />}
      {macStorage && <StorageMeter label="This Mac" info={macStorage} />}
      <div className="status-item">
        <span className="status-label">Items:</span>
        <span>{fileCount}</span>
      </div>
      {selectedCount > 0 && (
        <div className="status-item">
          <span className="status-label">Selected:</span>
          <span>
            {selectedCount}
            {selectedSizeFragment}
          </span>
        </div>
      )}
    </div>
  );
}
