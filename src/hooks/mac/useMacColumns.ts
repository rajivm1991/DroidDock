/**
 * Columns listings for This Mac.
 *
 * List and Icons read the open-folder rows from useMacFolderView. This hook
 * reloads the Miller columns, opens a folder in the chain, and scrolls or dims
 * them during a drop. It does not filter, sort, or run subfolder search.
 */
import { useEffect, useRef, useState, type MouseEvent, type Ref } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../../lib/file-types";
import {
  columnIndexForOpenPath,
  scrollColumnBrowserIntoView,
} from "../../lib/columnViewFocus";
import {
  basenameSegment,
  collapseEmptyIntermediatePaths,
  columnHighlightIndexForChild,
  ensureChildInListing,
  joinColumnPath,
  visibleColumnEntries,
} from "../../lib/columnPathCollapse";
import { isMultiSelectClick, type FolderOpenClick } from "../../lib/presets";
import type { MacSelectRangeContext, MacViewMode } from "../../components/explorer/mac/macPaneTypes";

export function useMacColumns({
  viewMode,
  path,
  files,
  showHidden,
  permissionDenied,
  listEpoch,
  rootRef,
  openFolderOn,
  onSelect,
  onNavigatePath,
}: {
  viewMode: MacViewMode;
  path: string;
  /** Open-folder listing from the Mac explorer — keeps the Open column in sync after copy. */
  files: FileEntry[];
  showHidden: boolean;
  permissionDenied: boolean;
  listEpoch: number;
  rootRef?: Ref<HTMLElement | null>;
  openFolderOn: FolderOpenClick;
  onSelect: (
    name: string,
    event: MouseEvent,
    rangeContext?: MacSelectRangeContext,
  ) => void;
  onNavigatePath: (path: string) => void;
}) {
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [columnFiles, setColumnFiles] = useState<Map<string, FileEntry[]>>(new Map());
  const [columnSelected, setColumnSelected] = useState<Map<string, number>>(new Map());
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const columnPathRef = useRef<string[]>([]);
  columnPathRef.current = columnPath;
  const columnMetaRef = useRef({ showHidden, listEpoch, viewMode });
  /** True while App reports a phone → Mac drag hover (Columns dim cue). */
  const [dropTargeting, setDropTargeting] = useState(false);

  async function loadColumnDir(dirPath: string): Promise<FileEntry[]> {
    try {
      return await invoke<FileEntry[]>("list_local_directory", {
        path: dirPath,
        showHidden,
      });
    } catch {
      return [];
    }
  }

  /**
   * App passes macPaneRef as an object ref. Columns scroll must stay inside
   * This Mac so the phone Columns are not scrolled instead.
   */
  function macPaneRoot(): HTMLElement | null {
    if (rootRef && typeof rootRef === "object" && "current" in rootRef) {
      return rootRef.current;
    }
    return null;
  }

  /**
   * Mac Columns used to rebuild on every path change and never scrolled, so
   * deep trees jumped back to the first pane. This mirrors the phone focus
   * helper. It does not change the open Mac folder or the transfer destination.
   */
  function focusMacColumn(
    columnIndex: number,
    selectedRowIndex?: number,
    behavior: ScrollBehavior = "smooth",
    horizontal = true,
  ) {
    scrollColumnBrowserIntoView(macPaneRoot(), {
      columnIndex,
      selectedRowIndex,
      behavior,
      horizontal,
    });
  }

  /**
   * A full rebuild on every drill-in remounted columns and reset scroll. Deep
   * jumps past an unlistable or hidden-only ancestor could leave an empty
   * middle pane. Rebuild only when entering Columns, refreshing, toggling
   * hidden files, or jumping to a path outside the current chain; otherwise
   * truncate and focus within the existing chain. On rebuild, synthesize
   * missing next-segment rows and drop empty non-open intermediate columns.
   * This does not re-list every ancestor on a normal folder open, and it does
   * not invent Mac children that are not already on the open path.
   */
  /**
   * List/Icons already show `files` after a copy into the open Mac folder.
   * Columns keep a separate map; mirror the open folder here so that column
   * updates as soon as the listing refresh lands (listEpoch still rebuilds
   * ancestors).
   */
  useEffect(() => {
    if (viewMode !== "column" || !path || permissionDenied) return;
    setColumnFiles((prev) => {
      if (prev.size === 0 && files.length === 0) return prev;
      const next = new Map(prev);
      next.set(path, files);
      return next;
    });
  }, [viewMode, path, files, permissionDenied]);

  useEffect(() => {
    if (viewMode !== "column" || permissionDenied || !path) {
      if (viewMode !== "column") {
        setColumnPath([]);
        setColumnFiles(new Map());
        setColumnSelected(new Map());
        setActiveColumnIndex(0);
      }
      columnMetaRef.current = { showHidden, listEpoch, viewMode };
      return;
    }

    const prev = columnMetaRef.current;
    const metaChanged =
      prev.showHidden !== showHidden ||
      prev.listEpoch !== listEpoch ||
      prev.viewMode !== "column";
    columnMetaRef.current = { showHidden, listEpoch, viewMode };

    const existing = columnPathRef.current;
    const pathIndex = existing.indexOf(path);
    if (!metaChanged && pathIndex >= 0 && existing.length > 0) {
      const leftChild =
        pathIndex + 1 < existing.length ? existing[pathIndex + 1]! : null;
      if (pathIndex < existing.length - 1) {
        setColumnPath(existing.slice(0, pathIndex + 1));
      }
      const upRow = leftChild
        ? columnHighlightIndexForChild(
            columnFiles.get(path) || [],
            leftChild,
            showHidden,
          )
        : -1;
      const parentRow =
        !leftChild && pathIndex > 0
          ? columnHighlightIndexForChild(
              columnFiles.get(existing[pathIndex - 1]!) || [],
              path,
              showHidden,
            )
          : -1;
      setColumnSelected((prevSel) => {
        const next = new Map<string, number>();
        for (const p of existing.slice(0, pathIndex + 1)) {
          if (prevSel.has(p)) next.set(p, prevSel.get(p)!);
        }
        if (upRow >= 0) next.set(path, upRow);
        if (parentRow >= 0) next.set(existing[pathIndex - 1]!, parentRow);
        return next;
      });
      setActiveColumnIndex(pathIndex);
      if (leftChild) {
        focusMacColumn(
          pathIndex,
          upRow >= 0 ? upRow : undefined,
          "smooth",
        );
      } else {
        if (parentRow >= 0) {
          focusMacColumn(pathIndex - 1, parentRow, "instant", false);
        }
        focusMacColumn(pathIndex, undefined, "smooth");
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const segments = path.split("/").filter(Boolean);
      const paths: string[] = ["/"];
      let acc = "";
      for (const segment of segments) {
        acc += `/${segment}`;
        paths.push(acc);
      }
      const nextFiles = new Map<string, FileEntry[]>();
      for (let i = 0; i < paths.length; i++) {
        const dir = paths[i];
        const listed = await loadColumnDir(dir);
        if (cancelled) return;
        nextFiles.set(dir, listed);
      }
      for (let i = 0; i < paths.length - 1; i++) {
        const nextName = basenameSegment(paths[i + 1]);
        nextFiles.set(
          paths[i],
          ensureChildInListing(nextFiles.get(paths[i]) || [], nextName),
        );
      }
      const displayPaths = collapseEmptyIntermediatePaths(
        paths,
        nextFiles,
        path,
        showHidden,
      );
      const nextSelected = new Map<string, number>();
      for (let i = 0; i < displayPaths.length - 1; i++) {
        const dir = displayPaths[i];
        const childName = basenameSegment(displayPaths[i + 1]);
        const visible = visibleColumnEntries(
          nextFiles.get(dir) || [],
          showHidden,
        );
        const idx = visible.findIndex((f) => f.name === childName);
        if (idx >= 0) nextSelected.set(dir, idx);
      }
      if (!cancelled) {
        setColumnPath(displayPaths);
        setColumnFiles(nextFiles);
        setColumnSelected(nextSelected);
        const openIdx = Math.max(0, displayPaths.length - 1);
        setActiveColumnIndex(openIdx);
        if (openIdx > 0) {
          const parent = displayPaths[openIdx - 1]!;
          const parentRow = nextSelected.get(parent) ?? -1;
          if (parentRow >= 0) {
            focusMacColumn(openIdx - 1, parentRow, "instant", false);
          }
        }
        focusMacColumn(openIdx, undefined, "instant");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewMode, path, showHidden, permissionDenied, listEpoch]);

  function focusOpenColumnForDrag() {
    if (viewMode !== "column" || columnPath.length === 0) return;
    focusMacColumn(
      columnIndexForOpenPath(columnPath, path),
      undefined,
      "smooth",
    );
  }

  /**
   * Columns always drilled in on click. Honor the open-folder preference and
   * keep Cmd/Shift as select-only. Keep the open column scrolled into view
   * after drill-in. Do not invent Mac children beyond the chosen folder.
   */
  async function selectColumnItem(
    columnIndex: number,
    fileIndex: number,
    file: FileEntry,
    event: MouseEvent,
    openDirectory = false,
  ) {
    const dir = columnPath[columnIndex];
    if (!dir) return;
    const prefix = columnPath.slice(0, columnIndex + 1);
    setColumnSelected((prev) => {
      const next = new Map<string, number>();
      for (const p of prefix) {
        if (prev.has(p)) next.set(p, prev.get(p)!);
      }
      next.set(dir, fileIndex);
      return next;
    });
    setActiveColumnIndex(columnIndex);

    const colListing = columnFiles.get(dir) || [];
    const rangeContext: MacSelectRangeContext = {
      index: fileIndex,
      rangeSource: colListing,
      rangeId: `column:${dir}`,
    };
    const multi = isMultiSelectClick(event);
    if (!file.is_directory) {
      onSelect(file.name, event, rangeContext);
      focusMacColumn(columnIndex, fileIndex, "smooth", false);
      return;
    }

    const shouldOpen =
      openDirectory || (openFolderOn === "single" && !multi);
    if (!shouldOpen) {
      onSelect(file.name, event, rangeContext);
      focusMacColumn(columnIndex, fileIndex, "smooth", false);
      return;
    }

    const nextPath = joinColumnPath(dir, file.name);
    const listed = await loadColumnDir(nextPath);
    const merged = new Map<string, FileEntry[]>();
    for (const p of prefix) {
      const filesFor = columnFiles.get(p);
      if (filesFor) merged.set(p, filesFor);
    }
    merged.set(nextPath, listed);
    const newPaths = collapseEmptyIntermediatePaths(
      [...prefix, nextPath],
      merged,
      nextPath,
      showHidden,
    );
    setColumnPath(newPaths);
    setColumnFiles(() => {
      const kept = new Map<string, FileEntry[]>();
      for (const p of newPaths) {
        const filesFor = merged.get(p);
        if (filesFor) kept.set(p, filesFor);
      }
      return kept;
    });
    setActiveColumnIndex(newPaths.length - 1);
    onNavigatePath(nextPath);
    focusMacColumn(columnIndex, fileIndex, "instant", false);
    focusMacColumn(newPaths.length - 1, undefined, "smooth");
  }

  /**
   * Columns keyboard: ↑↓ highlight only; → opens the highlighted folder (or
   * steps into a child column already open); ← goes back. Matches the phone
   * pane so you are not forced into the first folder on every arrow. Shift is
   * handled by the caller (selection).
   */
  function moveColumnFocus(
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  ): { name: string; isDirectory: boolean } | null {
    if (viewMode !== "column" || columnPath.length === 0) return null;
    if (key === "ArrowLeft") {
      if (activeColumnIndex <= 0) return null;
      const newIndex = activeColumnIndex - 1;
      const parentPath = columnPath[newIndex]!;
      const leavingPath = columnPath[activeColumnIndex]!;
      const visibleParent = visibleColumnEntries(
        columnFiles.get(parentPath) || [],
        showHidden,
      );
      let row = columnSelected.get(parentPath) ?? -1;
      if (row < 0 || !visibleParent[row]) {
        row = columnHighlightIndexForChild(
          columnFiles.get(parentPath) || [],
          leavingPath,
          showHidden,
        );
      }
      setColumnSelected((prev) => {
        const next = new Map(prev);
        if (row >= 0) next.set(parentPath, row);
        return next;
      });
      setActiveColumnIndex(newIndex);
      onNavigatePath(parentPath);
      if (newIndex + 1 < columnPath.length) {
        setColumnPath(columnPath.slice(0, newIndex + 1));
      }
      focusMacColumn(newIndex, row >= 0 ? row : undefined, "smooth");
      const file = row >= 0 ? visibleParent[row] : undefined;
      return file
        ? { name: file.name, isDirectory: file.is_directory }
        : null;
    }
    if (key === "ArrowRight") {
      const pathHere = columnPath[activeColumnIndex];
      if (!pathHere) return null;
      const visible = visibleColumnEntries(
        columnFiles.get(pathHere) || [],
        showHidden,
      );
      const current = columnSelected.get(pathHere) ?? -1;
      const file = current >= 0 ? visible[current] : undefined;

      if (activeColumnIndex < columnPath.length - 1) {
        const childPath = columnPath[activeColumnIndex + 1]!;
        const matchesHighlight =
          file?.is_directory && joinColumnPath(pathHere, file.name) === childPath;
        if (matchesHighlight || !file?.is_directory) {
          const newIndex = activeColumnIndex + 1;
          setActiveColumnIndex(newIndex);
          onNavigatePath(childPath);
          if (current >= 0) {
            focusMacColumn(activeColumnIndex, current, "instant", false);
          }
          focusMacColumn(newIndex, undefined, "smooth");
          return file
            ? { name: file.name, isDirectory: file.is_directory }
            : null;
        }
      }

      if (!file?.is_directory) return null;
      const nextPath = joinColumnPath(pathHere, file.name);
      const highlightIndex = current;
      void loadColumnDir(nextPath).then((listed) => {
        const prefix = columnPath.slice(0, activeColumnIndex + 1);
        const merged = new Map(columnFiles);
        for (const p of prefix) {
          const existing = columnFiles.get(p);
          if (existing) merged.set(p, existing);
        }
        merged.set(nextPath, listed);
        const newPaths = collapseEmptyIntermediatePaths(
          [...prefix, nextPath],
          merged,
          nextPath,
          showHidden,
        );
        const kept = new Map<string, FileEntry[]>();
        for (const p of newPaths) {
          const filesFor = merged.get(p);
          if (filesFor) kept.set(p, filesFor);
        }
        setColumnFiles(kept);
        setColumnPath(newPaths);
        onNavigatePath(nextPath);
        if (highlightIndex >= 0) {
          focusMacColumn(activeColumnIndex, highlightIndex, "instant", false);
        }
        focusMacColumn(newPaths.length - 1, undefined, "smooth");
      });
      return { name: file.name, isDirectory: true };
    }
    const pathHere = columnPath[activeColumnIndex];
    if (!pathHere) return null;
    const visible = visibleColumnEntries(
      columnFiles.get(pathHere) || [],
      showHidden,
    );
    if (visible.length === 0) return null;
    const current = columnSelected.get(pathHere) ?? -1;
    let next = current;
    if (current < 0) next = 0;
    else if (key === "ArrowUp") {
      next = current <= 0 ? visible.length - 1 : current - 1;
    } else {
      next = current >= visible.length - 1 ? 0 : current + 1;
    }
    const file = visible[next];
    if (!file) return null;
    setColumnSelected((prev) => {
      const updated = new Map(prev);
      updated.set(pathHere, next);
      return updated;
    });
    // Drop preview columns to the right of the highlight. Do not change the
    // open path: onNavigatePath re-ran the column sync and scrolled the Open
    // column off-screen on the first ↑↓ (Phone and This Mac). → still opens.
    const trimmed = columnPath.slice(0, activeColumnIndex + 1);
    if (trimmed.length !== columnPath.length) setColumnPath(trimmed);
    focusMacColumn(activeColumnIndex, next, "auto", false);
    return { name: file.name, isDirectory: file.is_directory };
  }

  function focusedColumnEntry(): FileEntry | null {
    if (viewMode !== "column" || columnPath.length === 0) return null;
    const pathHere = columnPath[activeColumnIndex];
    if (!pathHere) return null;
    const visible = visibleColumnEntries(
      columnFiles.get(pathHere) || [],
      showHidden,
    );
    const idx = columnSelected.get(pathHere) ?? -1;
    if (idx < 0 || idx >= visible.length) return null;
    return visible[idx] ?? null;
  }

  return {
    columnPath,
    columnFiles,
    columnSelected,
    activeColumnIndex,
    dropTargeting,
    setDropTargeting,
    focusOpenColumnForDrag,
    selectColumnItem,
    moveColumnFocus,
    focusedColumnEntry,
    focusMacColumn,
  };
}
