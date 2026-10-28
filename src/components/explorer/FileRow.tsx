/**
 * One phone List row: select, open, rename in place, menu, and drag. The
 * parent keeps the selection and the rename text. List rows stay glyphs;
 * photo previews are an Icons setting.
 */

import type { DragEvent, MouseEvent, RefObject } from "react";
import { FileMark } from "./FileMark";
import type { FileEntry } from "../../lib/file-types";
import { getFileKind } from "../../lib/fileDisplay";
import { formatBytes } from "../../lib/format";
import { isMultiSelectClick, type FolderOpenClick } from "../../lib/presets";

export interface FileRowProps {
  file: FileEntry;
  fileIndex: number;
  onNavigate: () => void;
  onPreview: () => void;
  /** When "single", a plain click opens folders; modifiers still only select. */
  openFolderOn: FolderOpenClick;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (index: number, e: MouseEvent) => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  /** Right-click opens the file menu. Drag starts a phone-to-Mac copy. */
  onContextMenu: (event: MouseEvent) => void;
  onDragStart: (event: DragEvent) => void;
}

export function FileRow({
  file,
  fileIndex,
  onNavigate,
  onPreview,
  openFolderOn,
  isSelected,
  isFocused,
  onSelect,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameConfirm,
  onRenameCancel,
  renameInputRef,
  onContextMenu,
  onDragStart,
}: FileRowProps) {
  return (
    <tr
      onClick={(e) => {
        if (
          file.is_directory &&
          openFolderOn === "single" &&
          !isMultiSelectClick(e)
        ) {
          onNavigate();
          return;
        }
        onSelect(fileIndex, e);
      }}
      onDoubleClick={() => {
        if (file.is_directory) {
          if (openFolderOn === "double") onNavigate();
        } else {
          onPreview();
        }
      }}
      className={`file-row ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      data-file-index={fileIndex}
      data-entry-name={file.name}
      draggable={!isRenaming}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      <td className="col-name">
        <div className="col-name-inner">
          <FileMark directory={file.is_directory} extension={file.extension} />
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  onRenameConfirm();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onRenameCancel();
                }
              }}
              onBlur={onRenameCancel}
              onClick={(e) => e.stopPropagation()}
              className="rename-input"
            />
          ) : (
            <span className={file.is_directory ? "file-name clickable" : "file-name"}>
              {file.name}
            </span>
          )}
        </div>
      </td>
      <td className="col-kind kind-cell">{getFileKind(file)}</td>
      <td className="col-size size-cell">
        {file.is_directory ? "-" : formatBytes(parseInt(file.size))}
      </td>
      <td className="col-date date-cell">{file.date}</td>
    </tr>
  );
}
