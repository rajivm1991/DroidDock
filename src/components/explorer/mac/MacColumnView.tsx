/**
 * Columns body for This Mac. The column listings and drill-in behavior come
 * from useMacColumns. This only paints the panes.
 */
import type { DragEvent, MouseEvent } from "react";
import type { FileEntry } from "../../../lib/file-types";
import type { FolderOpenClick } from "../../../lib/presets";
import { FileMark } from "../FileMark";

export function MacColumnView({
  path,
  columnPath,
  columnFiles,
  columnSelected,
  activeColumnIndex,
  selected,
  dropTargeting,
  openFolderOn,
  onContextMenu,
  onEmptyContextMenu,
  selectColumnItem,
  beginMacDrag,
}: {
  path: string;
  columnPath: string[];
  columnFiles: Map<string, FileEntry[]>;
  columnSelected: Map<string, number>;
  activeColumnIndex: number;
  selected: Set<string>;
  dropTargeting: boolean;
  openFolderOn: FolderOpenClick;
  onContextMenu: (event: MouseEvent, file: FileEntry) => void;
  onEmptyContextMenu?: (event: MouseEvent) => void;
  selectColumnItem: (
    columnIndex: number,
    fileIndex: number,
    file: FileEntry,
    event: MouseEvent,
    openDirectory?: boolean,
  ) => void;
  beginMacDrag: (event: DragEvent, fileName: string) => void;
}) {
  return (
    <div className="mac-pane-list-wrap" onContextMenu={onEmptyContextMenu}>
      <div className={`column-view${dropTargeting ? " is-drop-targeting" : ""}`}>
        {columnPath.map((colPath, columnIndex) => {
          const colFiles = columnFiles.get(colPath) || [];
          const selectedIndex = columnSelected.get(colPath) ?? -1;
          const isActiveColumn = columnIndex === activeColumnIndex;
          const isOpenFolder = colPath === path;
          return (
            <div
              key={colPath}
              className={`column-list ${isActiveColumn ? "active" : ""} ${
                isOpenFolder ? "is-open-folder" : ""
              }`}
              data-column-index={columnIndex}
              data-column-path={colPath}
            >
              {/*
                Deep Columns can hide the open folder. The cue marks the
                Copy/drop destination column. It does not retarget drops.
              */}
              {isOpenFolder && (
                <div className="column-open-cue" aria-label="Open folder for copies">
                  Open
                </div>
              )}
              {colFiles.map((file, fileIndex) => {
                /**
                 * Selection names are not path-qualified. Applying selected.has
                 * in ancestor columns falsely highlighted root rows that share a
                 * name with the open folder (e.g. Library) after Cmd+A. Ancestors
                 * keep only the miller path index; the open/active column shows
                 * the real selection.
                 */
                const isSelected =
                  fileIndex === selectedIndex ||
                  ((isOpenFolder || isActiveColumn) && selected.has(file.name));
                return (
                <div
                  key={`${colPath}-${file.name}`}
                  className={`column-item ${file.is_directory ? "directory" : "file"} ${
                    isSelected ? "selected" : ""
                  }`}
                  data-entry-name={file.name}
                  onClick={(event) =>
                    void selectColumnItem(columnIndex, fileIndex, file, event)
                  }
                  onDoubleClick={(event) => {
                    if (file.is_directory && openFolderOn === "double") {
                      void selectColumnItem(
                        columnIndex,
                        fileIndex,
                        file,
                        event,
                        true,
                      );
                    }
                  }}
                  onContextMenu={(event) => onContextMenu(event, file)}
                  draggable
                  onDragStart={(event) => beginMacDrag(event, file.name)}
                >
                  <span className="column-item-icon">
                    <FileMark directory={file.is_directory} extension={file.extension} />
                  </span>
                  <span className="column-item-name">{file.name}</span>
                  {file.is_directory && <span className="column-item-arrow">›</span>}
                </div>
                );
              })}
              {colFiles.length === 0 && <div className="column-empty">Empty</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
