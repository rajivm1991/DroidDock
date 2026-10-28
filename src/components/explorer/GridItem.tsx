/**
 * One phone Icons tile. When Show Thumbnails is on, it asks for a preview
 * once the tile scrolls into view and keeps that image cached. List and
 * Columns stay glyphs.
 *
 * The device path comes from the current row on every render. A search hit
 * carries an absolute phone path; a row in the open folder is one name under
 * that folder. The tile does not keep the path of whatever sat here before,
 * and a folder never draws a photo. Otherwise a search at the storage root
 * previews the previous folder (the image reader then reports that path is a
 * directory), and clearing the search leaves that folder showing the photo
 * until the folder is reloaded.
 */

import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { FileMark } from "./FileMark";
import { needsThumbnail, type FileEntry } from "../../lib/file-types";
import { joinColumnPath } from "../../lib/columnPathCollapse";
import { isMultiSelectClick, type FolderOpenClick } from "../../lib/presets";

export interface GridItemProps {
  file: FileEntry;
  fileIndex: number;
  currentPath: string;
  thumbnailsEnabled: boolean;
  thumbnailCache: Map<string, string>;
  loadThumbnail: (file: FileEntry, filePath: string) => Promise<void>;
  onNavigate: () => void;
  onPreview: () => void;
  openFolderOn: FolderOpenClick;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (index: number, e: MouseEvent) => void;
  onContextMenu: (event: MouseEvent) => void;
  onDragStart: (event: DragEvent) => void;
}

export function GridItem({
  file,
  fileIndex,
  currentPath,
  thumbnailsEnabled,
  thumbnailCache,
  loadThumbnail,
  onNavigate,
  onPreview,
  openFolderOn,
  isSelected,
  isFocused,
  onSelect,
  onContextMenu,
  onDragStart,
}: GridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [hasLoadedThumbnail, setHasLoadedThumbnail] = useState(false);
  const filePath = joinColumnPath(currentPath, file.name);
  // Same tile, new row: allow a preview request. A leftover flag skipped the
  // photo that replaced another file in this slot.
  const [trackedPath, setTrackedPath] = useState(filePath);
  if (trackedPath !== filePath) {
    setTrackedPath(filePath);
    setHasLoadedThumbnail(false);
  }
  const showThumbnail = thumbnailsEnabled && needsThumbnail(file);
  const thumbCached = showThumbnail && thumbnailCache.has(filePath);

  // Icons only: request a thumbnail when the tile enters the list scroller.
  // List rows do not do this — they stay glyphs.
  useEffect(() => {
    if (!showThumbnail) {
      setHasLoadedThumbnail(false);
      return;
    }
    if (hasLoadedThumbnail) return;
    if (thumbCached) {
      setHasLoadedThumbnail(true);
      return;
    }

    const host = itemRef.current;
    if (!host) return;
    const root = host.closest(".file-list, .grid-view");

    const requestLoad = () => {
      loadThumbnail(file, filePath);
      setHasLoadedThumbnail(true);
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
  }, [
    showThumbnail,
    file,
    hasLoadedThumbnail,
    loadThumbnail,
    filePath,
    thumbCached,
  ]);

  const thumbnailUrl = showThumbnail ? thumbnailCache.get(filePath) : undefined;

  return (
    <div
      ref={itemRef}
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
      className={`grid-item ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      data-file-index={fileIndex}
      data-entry-name={file.name}
      draggable
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      <div className="grid-item-icon">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="grid-thumbnail" />
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
