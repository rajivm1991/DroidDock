/**
 * One Icons tile on This Mac, including a local thumbnail when that setting
 * is on. List and Columns do not use this. The pane still owns selection and
 * drag; this tile only renders one file and reports the click.
 */
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { needsThumbnail, type FileEntry } from "../../lib/file-types";
import { isMultiSelectClick, type FolderOpenClick } from "../../lib/presets";
import { FileMark } from "./FileMark";
import { joinMacPath } from "./mac/macPaneFormat";
import type { MacSelectRangeContext } from "./mac/macPaneTypes";

export function MacGridItem({
  file,
  fileIndex,
  rangeSource,
  folderPath,
  selected,
  isFocused = false,
  thumbnailsEnabled,
  openFolderOn,
  searchMode,
  onSelect,
  onOpenFolder,
  onNavigatePath,
  onContextMenu,
  beginMacDrag,
  exitSearchMode,
}: {
  file: FileEntry;
  fileIndex: number;
  rangeSource: FileEntry[];
  folderPath: string;
  selected: boolean;
  /** Keyboard focus ring for This Mac Icons. */
  isFocused?: boolean;
  thumbnailsEnabled: boolean;
  openFolderOn: FolderOpenClick;
  searchMode: boolean;
  onSelect: (
    name: string,
    event: MouseEvent,
    rangeContext?: MacSelectRangeContext,
  ) => void;
  onOpenFolder: (name: string) => void;
  onNavigatePath: (path: string) => void;
  onContextMenu: (event: MouseEvent, file: FileEntry) => void;
  beginMacDrag: (event: DragEvent, name: string) => void;
  exitSearchMode: () => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const absolutePath = joinMacPath(folderPath, file.name);

  useEffect(() => {
    if (!thumbnailsEnabled) {
      setHasLoaded(false);
      setThumbUrl(null);
      return;
    }
    if (!needsThumbnail(file) || hasLoaded) return;

    const host = itemRef.current;
    if (!host) return;
    const root = host.closest(".mac-pane-list-wrap, .grid-view");

    const requestLoad = () => {
      setHasLoaded(true);
      void invoke<string>("get_local_thumbnail", {
        filePath: absolutePath,
        extension: file.extension || "",
      })
        .then((data) => {
          if (
            data &&
            !data.includes("placeholder") &&
            !data.includes("size-too-large")
          ) {
            setThumbUrl(data);
          }
        })
        .catch(() => {
          /* keep glyph */
        });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            requestLoad();
            observer.disconnect();
            break;
          }
        }
      },
      { root: root ?? null, rootMargin: "80px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [thumbnailsEnabled, file, hasLoaded, absolutePath]);

  useEffect(() => {
    setHasLoaded(false);
    setThumbUrl(null);
  }, [file.name, folderPath]);

  return (
    <div
      ref={itemRef}
      className={`grid-item ${file.is_directory ? "directory" : "file"} ${
        selected ? "selected" : ""
      } ${isFocused ? "focused" : ""}`}
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
            onNavigatePath(joinMacPath(folderPath, file.name));
            exitSearchMode();
          } else {
            onOpenFolder(file.name);
          }
          return;
        }
        onSelect(file.name, event, {
          index: fileIndex,
          rangeSource,
          rangeId: "icons",
        });
      }}
      onContextMenu={(event) => onContextMenu(event, file)}
      onDoubleClick={() => {
        if (file.is_directory && openFolderOn === "double") {
          if (searchMode) {
            onNavigatePath(joinMacPath(folderPath, file.name));
            exitSearchMode();
          } else {
            onOpenFolder(file.name);
          }
        }
      }}
    >
      <div className="grid-item-icon">
        {thumbnailsEnabled && thumbUrl ? (
          <img src={thumbUrl} alt="" className="grid-thumbnail" />
        ) : (
          <FileMark
            directory={file.is_directory}
            extension={file.extension}
            size="lg"
          />
        )}
      </div>
      <div className="grid-item-name">{file.name}</div>
    </div>
  );
}
