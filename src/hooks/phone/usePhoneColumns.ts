/**
 * Phone Columns: which column is open, the listings in each column, and
 * click-to-open. List and Icons do not use this. The shared phone list and
 * selection live in usePhoneListing.
 */
import { RefObject, SetStateAction, useEffect, useRef } from "react";
import { scrollColumnBrowserIntoView, columnIndexForOpenPath } from "../../lib/columnViewFocus";
import { type FileEntry } from "../../lib/file-types";
import {
  emulatedRecoveryCandidatePaths,
  syntheticDirectoryEntry,
  basenameSegment,
  COLUMN_AUTO_CONTINUE_MAX_DEPTH,
  visibleColumnEntries,
  joinColumnPath,
  ensureChildInListing,
  collapseEmptyIntermediatePaths,
  columnHighlightIndexForChild,
} from "../../lib/columnPathCollapse";
import { invoke } from "@tauri-apps/api/core";
import { isMultiSelectClick } from "../../lib/presets";

export interface UsePhoneColumnsArgs {
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  loading: boolean;
  showHiddenFiles: boolean;
  folderOpenClick: "single" | "double";
  phonePaneRef: RefObject<HTMLDivElement | null>;
  viewMode: "table" | "grid" | "column";
  columnPath: string[];
  setColumnPath: (value: SetStateAction<string[]>) => void;
  columnFiles: Map<string, FileEntry[]>;
  setColumnFiles: (value: SetStateAction<Map<string, FileEntry[]>>) => void;
  columnSelected: Map<string, number>;
  setColumnSelected: (value: SetStateAction<Map<string, number>>) => void;
  setActiveColumnIndex: (value: SetStateAction<number>) => void;
  handleFileSelect: (fileName: string, index: number, event: React.MouseEvent, rangeSource?: FileEntry[], rangeId?: string) => void;
}

export function usePhoneColumns({
  selectedDevice,
  currentPath,
  setCurrentPath,
  loading,
  showHiddenFiles,
  folderOpenClick,
  phonePaneRef,
  viewMode,
  columnPath,
  setColumnPath,
  columnFiles,
  setColumnFiles,
  columnSelected,
  setColumnSelected,
  setActiveColumnIndex,
  handleFileSelect,
}: UsePhoneColumnsArgs) {
  const columnPathRef = useRef(columnPath);
  columnPathRef.current = columnPath;
  const columnFilesRef = useRef(columnFiles);
  columnFilesRef.current = columnFiles;
  const columnSelectedRef = useRef(columnSelected);
  columnSelectedRef.current = columnSelected;

  /**
   * Deep Columns trees overflow; mouse drill-in and init left scroll on the leftmost
   * panes. Keyboard left/right already scrolled; this is the shared phone entry point
   * for click, init, breadcrumb, and drag-over. Pane-scoped scroll of the open/active
   * column (and optional row). Does not change currentPath or transfer destination.
   */
  function focusPhoneColumn(
    columnIndex: number,
    selectedRowIndex?: number,
    behavior: ScrollBehavior = "smooth",
    horizontal = true,
  ) {
    scrollColumnBrowserIntoView(phonePaneRef.current, {
      columnIndex,
      selectedRowIndex,
      behavior,
      horizontal,
    });
  }

  /**
   * Keep the opened folder row highlighted and scrolled when the open path moves
   * within the chain (←, Delete, history). Rebuild only when the path is outside
   * the chain. A path-in-chain no-op used to leave the wrong column active and
   * skip the row scroll after back/forward and mouse open.
   */
  useEffect(() => {
    if (viewMode !== "column" || !selectedDevice || !currentPath) {
      if (viewMode !== "column" && columnPathRef.current.length > 0) {
        setColumnPath([]);
        setColumnFiles(new Map());
        setColumnSelected(new Map());
        setActiveColumnIndex(0);
      }
      return;
    }

    const existing = columnPathRef.current;
    const pathIndex = existing.indexOf(currentPath);
    if (existing.length === 0 || pathIndex < 0) {
      void initializeColumnView();
      return;
    }

    const leftChild =
      pathIndex + 1 < existing.length ? existing[pathIndex + 1]! : null;

    if (pathIndex < existing.length - 1) {
      setColumnPath(existing.slice(0, pathIndex + 1));
    }

    let highlightRow = columnSelectedRef.current.get(currentPath) ?? -1;
    if (leftChild) {
      const listing = columnFilesRef.current.get(currentPath) || [];
      const idx = columnHighlightIndexForChild(
        listing,
        leftChild,
        showHiddenFiles,
      );
      if (idx >= 0) highlightRow = idx;
    }

    setColumnSelected((prev) => {
      const next = new Map<string, number>();
      for (let i = 0; i <= pathIndex; i++) {
        const p = existing[i]!;
        if (prev.has(p)) next.set(p, prev.get(p)!);
      }
      if (highlightRow >= 0) next.set(currentPath, highlightRow);
      if (!leftChild && pathIndex > 0) {
        const parent = existing[pathIndex - 1]!;
        const listing = columnFilesRef.current.get(parent) || [];
        const parentRow = columnHighlightIndexForChild(
          listing,
          currentPath,
          showHiddenFiles,
        );
        if (parentRow >= 0) next.set(parent, parentRow);
      }
      return next;
    });

    setActiveColumnIndex(pathIndex);

    if (leftChild) {
      // Going up: land on the parent column with the opened folder in view.
      focusPhoneColumn(
        pathIndex,
        highlightRow >= 0 ? highlightRow : undefined,
        "smooth",
      );
      return;
    }

    // Opened a deeper folder: keep the parent row visible vertically, then show Open.
    if (pathIndex > 0) {
      const parent = existing[pathIndex - 1]!;
      const listing = columnFilesRef.current.get(parent) || [];
      const parentRow = columnHighlightIndexForChild(
        listing,
        currentPath,
        showHiddenFiles,
      );
      if (parentRow >= 0) {
        focusPhoneColumn(pathIndex - 1, parentRow, "instant", false);
      }
    }
    focusPhoneColumn(pathIndex, undefined, "smooth");
  }, [viewMode, currentPath, selectedDevice, showHiddenFiles]);

  /**
   * Nudge Open into view only when a listing finishes — not on every columnPath
   * trim from ↑↓, which used to fight arrow navigation and scroll Open away.
   */
  const wasLoadingRef = useRef(loading);
  useEffect(() => {
    const finishedLoading = wasLoadingRef.current && !loading;
    wasLoadingRef.current = loading;
    if (!finishedLoading) return;
    if (viewMode !== "column" || columnPath.length === 0) return;
    const openIdx = columnIndexForOpenPath(columnPath, currentPath);
    if (openIdx > 0) {
      const parent = columnPath[openIdx - 1]!;
      const parentRow = columnSelectedRef.current.get(parent) ?? -1;
      if (parentRow >= 0) {
        focusPhoneColumn(openIdx - 1, parentRow, "instant", false);
      }
    }
    focusPhoneColumn(openIdx, undefined, "instant");
  }, [viewMode, columnPath, currentPath, loading]);

  /**
   * …/emulated often lists empty over ADB while …/emulated/0 is readable. Probe known
   * user-volume children and return synthetic directory rows. Does not open those paths
   * or invent non-emulated children.
   */
  async function recoverPhoneColumnChildren(
    parentPath: string,
  ): Promise<FileEntry[]> {
    if (!selectedDevice) return [];
    const found: FileEntry[] = [];
    for (const childPath of emulatedRecoveryCandidatePaths(parentPath)) {
      try {
        const exists = await invoke<boolean>("phone_path_exists", {
          deviceId: selectedDevice,
          path: childPath,
        });
        if (exists) {
          found.push(syntheticDirectoryEntry(basenameSegment(childPath)));
        }
      } catch {
        // Skip unreadable candidates; empty recovery is handled by caller.
      }
    }
    return found;
  }

  /**
   * Opening an unlistable parent left Columns stuck with no next row. When a listing is
   * empty, recover children; auto-continue through a single recovered directory
   * (capped); leave multiple recovered rows for pick. Does not skip truly empty folders
   * or change List/Icons navigation.
   */
  async function expandEmptyPhoneColumnOpen(
    startPath: string,
    initialListing: FileEntry[],
  ): Promise<{
    chainPaths: string[];
    filesByPath: Map<string, FileEntry[]>;
    openPath: string;
  }> {
    const filesByPath = new Map<string, FileEntry[]>();
    const chainPaths: string[] = [startPath];
    let openPath = startPath;
    let listing = initialListing;
    filesByPath.set(startPath, listing);

    for (let depth = 0; depth < COLUMN_AUTO_CONTINUE_MAX_DEPTH; depth++) {
      if (visibleColumnEntries(listing, showHiddenFiles).length > 0) {
        break;
      }
      const recovered = await recoverPhoneColumnChildren(openPath);
      if (recovered.length === 0) {
        break;
      }
      if (recovered.length > 1) {
        filesByPath.set(openPath, recovered);
        break;
      }
      filesByPath.set(openPath, recovered);
      const childPath = joinColumnPath(openPath, recovered[0].name);
      const childListing = await loadColumnFiles(childPath);
      chainPaths.push(childPath);
      openPath = childPath;
      listing = childListing;
      filesByPath.set(childPath, childListing);
    }

    return { chainPaths, filesByPath, openPath };
  }

  /**
   * Deep place-mark jumps built one pane per ancestor, including empty …/emulated
   * between the parent and Open. List each ancestor, synthesize missing next-segment
   * rows, auto- continue from an empty open folder when recoverable, then drop empty
   * non-open intermediates from the column strip. Does not change breadcrumb collapse
   * or invent Mac-only paths.
   */
  async function initializeColumnView() {
    if (!selectedDevice || !currentPath) return;

    const segments = currentPath.split("/").filter(Boolean);
    const paths: string[] = ["/"];
    for (let i = 0; i < segments.length; i++) {
      paths.push("/" + segments.slice(0, i + 1).join("/"));
    }

    const newColumnFiles = new Map<string, FileEntry[]>();
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      try {
        const fileList = await invoke<FileEntry[]>("list_files", {
          deviceId: selectedDevice,
          path: path,
        });
        newColumnFiles.set(path, fileList);
      } catch (err) {
        console.error(`Failed to load files for ${path}:`, err);
        newColumnFiles.set(path, []);
      }
    }

    for (let i = 0; i < paths.length - 1; i++) {
      const nextName = basenameSegment(paths[i + 1]);
      const listing = newColumnFiles.get(paths[i]) || [];
      newColumnFiles.set(paths[i], ensureChildInListing(listing, nextName));
    }

    let openPath = currentPath;
    let displayPaths = [...paths];
    const openListing = newColumnFiles.get(openPath) || [];
    if (visibleColumnEntries(openListing, showHiddenFiles).length === 0) {
      const expanded = await expandEmptyPhoneColumnOpen(openPath, openListing);
      for (const [path, files] of expanded.filesByPath) {
        newColumnFiles.set(path, files);
      }
      const prefix = paths.slice(0, -1);
      displayPaths = [...prefix, ...expanded.chainPaths];
      openPath = expanded.openPath;
      if (openPath !== currentPath) {
        setCurrentPath(openPath);
      }
    }

    displayPaths = collapseEmptyIntermediatePaths(
      displayPaths,
      newColumnFiles,
      openPath,
      showHiddenFiles,
    );

    const newSelected = new Map<string, number>();
    for (let i = 0; i < displayPaths.length - 1; i++) {
      const path = displayPaths[i];
      const nextName = basenameSegment(displayPaths[i + 1]);
      const visibleFiles = visibleColumnEntries(
        newColumnFiles.get(path) || [],
        showHiddenFiles,
      );
      const selectedIndex = visibleFiles.findIndex((file) => file.name === nextName);
      if (selectedIndex >= 0) {
        newSelected.set(path, selectedIndex);
      }
    }

    setColumnPath(displayPaths);
    setColumnFiles(newColumnFiles);
    setColumnSelected(newSelected);
    setActiveColumnIndex(Math.max(0, displayPaths.length - 1));
    // Instant: rebuild remounts columns; keep the opened folder row visible in
    // the parent, then show the Open column.
    const openIdx = Math.max(0, displayPaths.length - 1);
    if (openIdx > 0) {
      const parent = displayPaths[openIdx - 1]!;
      const parentRow = newSelected.get(parent) ?? -1;
      if (parentRow >= 0) {
        focusPhoneColumn(openIdx - 1, parentRow, "instant", false);
      }
    }
    focusPhoneColumn(openIdx, undefined, "instant");
  }

  async function loadColumnFiles(path: string): Promise<FileEntry[]> {
    if (!selectedDevice) return [];

    try {
      const fileList = await invoke<FileEntry[]>("list_files", {
        deviceId: selectedDevice,
        path: path,
      });
      return fileList;
    } catch (err) {
      console.error(`Failed to load files for ${path}:`, err);
      return [];
    }
  }

  /**
   * Columns used to always drill in on one click; that fights multi-select and the
   * double-click open preference. Empty …/emulated also left no next row. Open the next
   * column on plain single-click when that mode is on, or on double-click when double
   * mode is on; modifiers only highlight/select; recover/auto-continue when the opened
   * folder lists empty but a child exists. Does not invent children outside emulated
   * recovery, or skip a true empty Open.
   */
  async function selectColumnItem(
    columnIndex: number,
    fileIndex: number,
    file: FileEntry,
    event?: React.MouseEvent,
    openDirectory = false,
  ) {
    const path = columnPath[columnIndex];
    const columnListing = columnFiles.get(path) || [];
    const visibleInColumn = visibleColumnEntries(columnListing, showHiddenFiles);
    setColumnSelected(new Map(columnSelected).set(path, fileIndex));
    setActiveColumnIndex(columnIndex);

    const multi = event ? isMultiSelectClick(event) : false;
    const columnRangeId = `column:${path}`;
    if (!file.is_directory) {
      if (event) {
        handleFileSelect(
          file.name,
          fileIndex,
          event,
          visibleInColumn,
          columnRangeId,
        );
      }
      focusPhoneColumn(columnIndex, fileIndex, "smooth", false);
      return;
    }

    const shouldOpen =
      openDirectory ||
      (folderOpenClick === "single" && !multi);
    if (!shouldOpen) {
      if (event) {
        handleFileSelect(
          file.name,
          fileIndex,
          event,
          visibleInColumn,
          columnRangeId,
        );
      }
      focusPhoneColumn(columnIndex, fileIndex, "smooth", false);
      return;
    }

    const selectedPath = joinColumnPath(columnPath[columnIndex], file.name);
    const prefix = columnPath.slice(0, columnIndex + 1);
    const fileList = await loadColumnFiles(selectedPath);
    const expanded = await expandEmptyPhoneColumnOpen(selectedPath, fileList);

    const newPaths = collapseEmptyIntermediatePaths(
      [...prefix, ...expanded.chainPaths],
      (() => {
        const map = new Map<string, FileEntry[]>();
        for (const columnDir of prefix) {
          const existingFiles = columnFiles.get(columnDir);
          if (existingFiles) map.set(columnDir, existingFiles);
        }
        for (const [dir, files] of expanded.filesByPath) {
          map.set(dir, files);
        }
        return map;
      })(),
      expanded.openPath,
      showHiddenFiles,
    );

    const newColumnFiles = new Map<string, FileEntry[]>();
    for (const columnDir of newPaths) {
      if (expanded.filesByPath.has(columnDir)) {
        newColumnFiles.set(columnDir, expanded.filesByPath.get(columnDir)!);
      } else {
        const existingFiles = columnFiles.get(columnDir);
        if (existingFiles) newColumnFiles.set(columnDir, existingFiles);
      }
    }

    const newSelected = new Map<string, number>();
    for (const columnDir of prefix) {
      const existingSelection = columnSelected.get(columnDir);
      if (existingSelection !== undefined) {
        newSelected.set(columnDir, existingSelection);
      }
    }
    newSelected.set(path, fileIndex);
    for (let i = 0; i < newPaths.length - 1; i++) {
      const dir = newPaths[i];
      if (newSelected.has(dir)) continue;
      const nextName = basenameSegment(newPaths[i + 1]);
      const visible = visibleColumnEntries(
        newColumnFiles.get(dir) || [],
        showHiddenFiles,
      );
      const idx = visible.findIndex((entry) => entry.name === nextName);
      if (idx >= 0) newSelected.set(dir, idx);
    }

    setColumnPath(newPaths);
    setColumnFiles(newColumnFiles);
    setColumnSelected(newSelected);
    setActiveColumnIndex(newPaths.length - 1);
    setCurrentPath(expanded.openPath);
    // Parent row vertically only — horizontal scroll to parent kicked Open off-screen.
    focusPhoneColumn(columnIndex, fileIndex, "instant", false);
    focusPhoneColumn(newPaths.length - 1, undefined, "smooth");
  }

  return {
    focusPhoneColumn,
    expandEmptyPhoneColumnOpen,
    initializeColumnView,
    loadColumnFiles,
    selectColumnItem,
  };
}
