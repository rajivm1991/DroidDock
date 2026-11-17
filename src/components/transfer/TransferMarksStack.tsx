import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { DragEvent as ReactDragEvent } from "react";
import { FileMark } from "../explorer/FileMark";

/**
 * Shared one-to-four FileMark stack for the transfer panel header and the in-app
 * drag ghost. List, Icons, and Columns each used the row or tile under the pointer
 * as the HTML5 drag image, so the same selection looked different per view. One icon
 * for a single item; up to four scattered type or folder glyphs for multi-select —
 * same vocabulary as the panel header, with a larger drag canvas so rotated glyphs
 * stay visible. Finder-originated OS ghosts, the drop-destination chip, and the
 * compact header stack are unchanged; marks come only from dragged names, capped at four.
 */

export interface TransferPreviewMark {
  directory: boolean;
  extension: string | null;
}

export function extensionFromFileName(name: string): string | null {
  const base = name.split("/").pop() || name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1);
}

/**
 * Builds up to four glyphs from item names in order: nested `Folder/file` paths
 * (typical queue rows) contribute one folder mark per top-level root; top-level
 * folders get a folder mark; loose files get their type icon. No extra marks beyond
 * the items and no reordering for prettier types.
 */
export function previewMarksFromItems(
  items: Array<{ name: string; isDirectory: boolean }>,
): TransferPreviewMark[] {
  const marks: TransferPreviewMark[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const slash = item.name.indexOf("/");
    if (slash > 0) {
      const root = item.name.slice(0, slash);
      const key = `d:${root}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({ directory: true, extension: null });
    } else if (item.isDirectory) {
      const key = `d:${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({ directory: true, extension: null });
    } else {
      const key = `f:${item.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marks.push({
        directory: false,
        extension: extensionFromFileName(item.name),
      });
    }
    if (marks.length >= 4) break;
  }
  return marks.length > 0
    ? marks
    : [{ directory: false, extension: null }];
}

export function TransferMarksStack({
  marks,
  variant = "panel",
}: {
  marks: TransferPreviewMark[];
  /**
   * `drag`: larger canvas + md glyphs for multi so the scatter is fully
   * visible under the cursor. `panel`: compact header stack.
   */
  variant?: "panel" | "drag";
}) {
  const count = Math.min(Math.max(marks.length, 1), 4);
  // Panel multi-select uses sm glyphs in a tight header; drag multi was clipped at sm.
  const markSize = variant === "drag" ? "md" : count === 1 ? "md" : "sm";
  return (
    <span
      className={`transfer-marks transfer-marks--${count}${
        variant === "drag" ? " transfer-marks--drag" : ""
      }`}
      aria-hidden
    >
      {marks.slice(0, 4).map((mark, index) => (
        <span
          key={`${mark.directory ? "dir" : mark.extension ?? "file"}-${index}`}
          className={`transfer-mark-slot transfer-mark-slot--${index}`}
        >
          <FileMark
            directory={mark.directory}
            extension={mark.extension}
            size={markSize}
          />
        </span>
      ))}
    </span>
  );
}

/**
 * Replaces the default HTML5 drag image with the transfer-panel mark stack.
 * Snapshots synchronously (flushSync) so WebKit can capture before paint.
 * Host is removed on the next frame; does not leave a visible orphan.
 */
export function applyTransferDragImage(
  event: ReactDragEvent,
  items: Array<{ name: string; isDirectory: boolean }>,
): void {
  const marks = previewMarksFromItems(items);
  const host = document.createElement("div");
  host.className = "transfer-drag-ghost";
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  const multi = marks.length > 1;
  flushSync(() => {
    root.render(
      <div
        className={`transfer-drag-ghost-inner${multi ? " is-multi" : ""}`}
      >
        <TransferMarksStack marks={marks} variant="drag" />
      </div>,
    );
  });
  const width = host.offsetWidth || (multi ? 92 : 52);
  const height = host.offsetHeight || (multi ? 92 : 52);
  event.dataTransfer.setDragImage(
    host,
    Math.round(width / 2),
    Math.round(height / 2),
  );
  requestAnimationFrame(() => {
    root.unmount();
    host.remove();
  });
}

/** Resolve directory flags for drag names from list + Columns listings. */
export function resolveDragItems(
  names: string[],
  listings: Iterable<FileEntryLike>,
): Array<{ name: string; isDirectory: boolean }> {
  const byName = new Map<string, boolean>();
  for (const entry of listings) {
    if (!byName.has(entry.name)) {
      byName.set(entry.name, entry.is_directory);
    }
  }
  return names.map((name) => ({
    name,
    isDirectory: byName.get(name) ?? false,
  }));
}

interface FileEntryLike {
  name: string;
  is_directory: boolean;
}
