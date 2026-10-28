/**
 * List table for This Mac. Sort and the visible rows come from the folder-view
 * hook. This does not load the folder or handle Columns.
 */
import type { DragEvent, MouseEvent } from "react";
import type { FileEntry } from "../../../lib/file-types";
import { isMultiSelectClick, type FolderOpenClick } from "../../../lib/presets";
import type { SortColumn, SortDirection } from "../../../lib/sort";
import { FileMark } from "../FileMark";
import { formatBytes, joinMacPath, kindLabel } from "./macPaneFormat";

export function MacListView({
  path,
  displayFiles,
  selected,
  focusedIndex,
  sortColumn,
  sortDirection,
  applyListHeaderSort,
  openFolderOn,
  searchMode,
  emptyLabel,
  onSelect,
  onOpenFolder,
  onNavigatePath,
  onContextMenu,
  onEmptyContextMenu,
  beginMacDrag,
  exitSearchMode,
}: {
  path: string;
  displayFiles: FileEntry[];
  selected: Set<string>;
  /** Keyboard focus ring; -1 when none. */
  focusedIndex?: number;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  applyListHeaderSort: (column: SortColumn) => void;
  openFolderOn: FolderOpenClick;
  searchMode: boolean;
  emptyLabel: string;
  onSelect: (
    name: string,
    event: MouseEvent,
    rangeContext?: { index: number; rangeSource: FileEntry[]; rangeId?: string },
  ) => void;
  onOpenFolder: (name: string) => void;
  onNavigatePath: (path: string) => void;
  onContextMenu: (event: MouseEvent, file: FileEntry) => void;
  onEmptyContextMenu?: (event: MouseEvent) => void;
  beginMacDrag: (event: DragEvent, fileName: string) => void;
  exitSearchMode: () => void;
}) {
  return (
    <div className="mac-pane-list-wrap" onContextMenu={onEmptyContextMenu}>
      <table className="explorer-table mac-explorer-table">
        <thead>
          <tr>
            <th
              onClick={() => applyListHeaderSort("name")}
              className={`col-name ${sortColumn === "name" ? "sortable active" : "sortable"}`}
              title="Click to sort by name"
            >
              Name {sortColumn === "name" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
            <th className="col-kind">Kind</th>
            <th
              onClick={() => applyListHeaderSort("size")}
              className={`col-size ${sortColumn === "size" ? "sortable active" : "sortable"}`}
              title="Click to sort by size"
            >
              Size {sortColumn === "size" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
            <th
              onClick={() => applyListHeaderSort("date")}
              className={`col-date ${sortColumn === "date" ? "sortable active" : "sortable"}`}
              title="Click to sort by date"
            >
              Date {sortColumn === "date" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
          </tr>
        </thead>
        <tbody>
          {displayFiles.map((file, fileIndex) => (
            <tr
              key={file.name}
              className={`file-row ${file.is_directory ? "directory" : "file"} ${
                selected.has(file.name) ? "selected" : ""
              } ${focusedIndex === fileIndex ? "focused" : ""}`}
              data-file-index={fileIndex}
              data-entry-name={file.name}
              draggable
              onDragStart={(event) => beginMacDrag(event, file.name)}
              onClick={(event) => {
                if (
                  file.is_directory &&
                  openFolderOn === "single" &&
                  !isMultiSelectClick(event)
                ) {
                  if (searchMode) {
                    onNavigatePath(joinMacPath(path, file.name));
                    exitSearchMode();
                  } else {
                    onOpenFolder(file.name);
                  }
                  return;
                }
                onSelect(file.name, event, {
                  index: fileIndex,
                  rangeSource: displayFiles,
                  rangeId: searchMode ? "search" : "list",
                });
              }}
              onContextMenu={(event) => onContextMenu(event, file)}
              onDoubleClick={() => {
                if (!file.is_directory || openFolderOn !== "double") return;
                if (searchMode) {
                  onNavigatePath(joinMacPath(path, file.name));
                  exitSearchMode();
                } else {
                  onOpenFolder(file.name);
                }
              }}
            >
              <td className="col-name">
                <div className="col-name-inner">
                  <FileMark directory={file.is_directory} extension={file.extension} />
                  <span className={`file-name ${file.is_directory ? "clickable" : ""}`}>
                    {file.name}
                  </span>
                </div>
              </td>
              <td className="col-kind kind-cell">{kindLabel(file)}</td>
              <td className="col-size size-cell">
                {file.is_directory ? "—" : formatBytes(Number(file.size))}
              </td>
              <td className="col-date date-cell">{file.date}</td>
            </tr>
          ))}
          {displayFiles.length === 0 && (
            <tr>
              <td colSpan={4} className="empty">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
