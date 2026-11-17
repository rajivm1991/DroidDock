/**
 * The open phone folder: its files, selection, filter, sort, and back/forward
 * history. Reloads when the phone or the path changes. Columns and the
 * delete/rename/search actions sit on top of this.
 */
import { SetStateAction, useEffect, useRef, useState } from "react";
import { needsThumbnail, type FileEntry } from "../../lib/file-types";
import { type StorageInfo } from "../../components/explorer/StatusBar";
import {
  type FolderHistory,
  descendantSegmentUnderAncestor,
  listableChildToward,
  pushFolderHistory,
} from "../../lib/folderHistory";
import { type SortColumn, nextSortState } from "../../lib/sort";
import { invoke } from "@tauri-apps/api/core";
import { filterAndSortPhoneFiles } from "../../lib/phoneVisibleFiles";
import { columnHighlightIndexForChild } from "../../lib/columnPathCollapse";
import { createLimiter } from "../../lib/limiter";

/** At most three previews are pulled from the phone at once, so a fast scroll cannot start dozens of adb pulls. */
const phoneThumbnailLimiter = createLimiter(3);

export interface UsePhoneListingArgs {
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  detectedStoragePath: string;
  setError: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  thumbnailsEnabled: boolean;
  setMacSelected: (value: SetStateAction<Set<string>>) => void;
  setMacLastSelectedIndex: (value: SetStateAction<number>) => void;
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  viewMode: "table" | "grid" | "column";
}

export function usePhoneListing({
  selectedDevice,
  currentPath,
  setCurrentPath,
  detectedStoragePath,
  setError,
  showHiddenFiles,
  thumbnailsEnabled,
  setMacSelected,
  setMacLastSelectedIndex,
  setActivePane,
  viewMode,
}: UsePhoneListingArgs) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, string>>(new Map());
  /** Paths the phone cannot give a preview for (a video without ffmpeg, a file over the size limit). Asking again on every remount would pull the same file again. */
  const noPreviewPaths = useRef<Set<string>>(new Set());

  // File selection and deletion state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  /** Same list/column id as the Shift+click anchor (avoids cross-column ranges). */
  const [lastSelectionRangeId, setLastSelectionRangeId] = useState("list");

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  /**
   * The old box looked like a filter but only searched after Enter. A live filter of
   * the folder that is open. Hides rows whose names do not contain this text,
   * case-insensitive. Does not walk subfolders. That is the Search subfolders button.
   * Does not apply while a subfolder search result is on screen.
   */
  const [nameFilter, setNameFilter] = useState("");
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchRecursive, setSearchRecursive] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [_searching, setSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  /*
   * Back/forward match Finder/browser habits in both panes. skip* refs avoid recording
   * when history buttons set the path themselves.
   */
  const [phoneHistory, setPhoneHistory] = useState<FolderHistory>({ stack: [], index: -1 });
  const skipPhoneHistory = useRef(false);

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  /**
   * Sort/Order chrome was redundant with List column headers. Name / Size / Date header
   * clicks set column and toggle direction. Does not expose sort controls in Icons or
   * Columns (last List order applies).
   */
  function applyListHeaderSort(column: SortColumn) {
    const next = nextSortState(column, sortColumn, sortDirection);
    setSortColumn(next.column);
    setSortDirection(next.direction);
  }

  // Column view state
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [columnFiles, setColumnFiles] = useState<Map<string, FileEntry[]>>(new Map());
  const [columnSelected, setColumnSelected] = useState<Map<string, number>>(new Map());
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  /**
   * Still written on navigate for clearSelection / callers; not used to restore
   * a ring when entering a folder (that fought parent restore-by-name).
   */
  const focusedIndexHistory = useRef<Map<string, number>>(new Map());
  /**
   * After Delete / history back / breadcrumb to a parent, select the folder we
   * just left (by name) once that parent listing is on screen.
   */
  const pendingRestoreNameRef = useRef<string | null>(null);
  const previousPathRef = useRef(currentPath);
  /**
   * Set by a breadcrumb click that changes folders. The left folder still gets
   * its row focus and Columns highlight, but is not selected, so the action
   * strip does not reappear for it.
   */
  const breadcrumbNavRef = useRef(false);
  const restoreSelectsRef = useRef(true);

  // Rename state
  const [renamingIndex, setRenamingIndex] = useState<number>(-1);
  const [renameValue, setRenameValue] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const justRenamedFile = useRef<string | null>(null);

  useEffect(() => {
    if (!currentPath) return;
    if (skipPhoneHistory.current) {
      skipPhoneHistory.current = false;
      return;
    }
    setPhoneHistory((prev) => pushFolderHistory(prev, currentPath));
  }, [currentPath]);

  useEffect(() => {
    const prev = previousPathRef.current;
    previousPathRef.current = currentPath;
    pendingRestoreNameRef.current = descendantSegmentUnderAncestor(
      prev,
      currentPath,
    );
    restoreSelectsRef.current = !breadcrumbNavRef.current;
    breadcrumbNavRef.current = false;
  }, [currentPath]);

  function phoneHistoryBack() {
    if (phoneHistory.index <= 0) return;
    const index = phoneHistory.index - 1;
    skipPhoneHistory.current = true;
    setPhoneHistory({ ...phoneHistory, index });
    setCurrentPath(phoneHistory.stack[index]);
  }

  function phoneHistoryForward() {
    if (phoneHistory.index < 0 || phoneHistory.index >= phoneHistory.stack.length - 1) return;
    const index = phoneHistory.index + 1;
    skipPhoneHistory.current = true;
    setPhoneHistory({ ...phoneHistory, index });
    setCurrentPath(phoneHistory.stack[index]);
  }

  /**
   * After disconnect, the old file list stays on screen until Refresh. Clearing browse
   * state when nothing is selected matches the empty connect UI.
   */
  useEffect(() => {
    if (selectedDevice) return;
    setFiles([]);
    setSelectedFiles(new Set());
    setLastSelectedIndex(-1);
    setStorageInfo(null);
    setFocusedIndex(-1);
    setMacSelected(new Set());
    setMacLastSelectedIndex(-1);
  }, [selectedDevice]);

  // Load files when device or path changes
  useEffect(() => {
    if (selectedDevice && currentPath) {
      void loadFiles();
      // Always clear here. Going up re-selects the left folder once the parent
      // listing arrives — keeping the child selection caused a second highlight.
      setSelectedFiles(new Set());
      setLastSelectedIndex(-1);
      setLastSelectionRangeId("list");
    }
  }, [selectedDevice, currentPath]);

  // Tracks path for focus reset so a same-folder file refresh does not wipe
  // a keyboard ring the person already moved with arrows.
  const focusPathRef = useRef(currentPath);

  function scrollFocusedRowIntoView() {
    // Double rAF after the listing commit so the focused/selected row exists.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const focusedElement = document.querySelector(
          ".phone-pane .file-row.focused, .phone-pane .grid-item.focused",
        );
        focusedElement?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      });
    });
  }

  /**
   * Entering a folder clears focus and selection. Going up waits for the parent
   * listing, then focuses and selects only the folder just left (by name).
   * Saved index maps are not re-applied on enter — that left a ring inside the
   * child and later fought the parent restore so Return opened the wrong row.
   */
  useEffect(() => {
    const pathChanged = focusPathRef.current !== currentPath;
    if (pathChanged) {
      focusPathRef.current = currentPath;
      // Listing may still be the previous folder — clear and wait for `files`.
      setFocusedIndex(-1);
      return;
    }

    if (files.length === 0) {
      setFocusedIndex(-1);
      return;
    }

    if (justRenamedFile.current) {
      const displayedFiles = getDisplayFiles();
      const newIndex = displayedFiles.findIndex(f => f.name === justRenamedFile.current);
      if (newIndex >= 0) {
        setFocusedIndex(newIndex);
        scrollFocusedRowIntoView();
      }
      justRenamedFile.current = null;
      pendingRestoreNameRef.current = null;
      return;
    }

    const restoreName = pendingRestoreNameRef.current;
    if (restoreName) {
      pendingRestoreNameRef.current = null;
      const selectRestored = restoreSelectsRef.current;
      const displayedFiles = getDisplayFiles();
      const newIndex = displayedFiles.findIndex((f) => f.name === restoreName);
      if (newIndex >= 0) {
        setFocusedIndex(newIndex);
        if (selectRestored) {
          setSelectedFiles(new Set([restoreName]));
          setLastSelectedIndex(newIndex);
          setLastSelectionRangeId("list");
        }
        setColumnSelected((prev) => {
          const listing = columnFiles.get(currentPath);
          if (!listing) return prev;
          // Rows are painted from the visible list, so the index must count
          // only visible entries. A raw index shifted past any hidden file and
          // highlighted a second folder next to the restored one.
          const colIdx = columnHighlightIndexForChild(
            listing,
            restoreName,
            showHiddenFiles,
          );
          if (colIdx < 0) return prev;
          const next = new Map(prev);
          next.set(currentPath, colIdx);
          return next;
        });
        scrollFocusedRowIntoView();
      }
      return;
    }

    const displayedFiles = getDisplayFiles();
    if (focusedIndex >= displayedFiles.length) {
      setFocusedIndex(-1);
    }
  }, [files, currentPath]);

  // Phone volume meter — clear entirely when no phone so the status bar
  // does not keep an empty reserved slot.
  useEffect(() => {
    if (selectedDevice && currentPath) {
      void loadStorageInfo();
      return;
    }
    setStorageInfo(null);
  }, [selectedDevice, currentPath]);

  /**
   * Every folder open called setLoading(true), which replaced the whole phone list with
   * “Loading…”. That flickered List/Icons and unmounted Columns (scroll jumped to the
   * first pane; open folder lost focus). Mac looks smoother because local listing is
   * fast — phone over USB is not. Fetch the open folder; only show the full-pane
   * Loading state when there is nothing useful already on screen (see render gate).
   * Does not clear `files` before the new list arrives. Columns keep their own
   * maps; useBrowsePanes.loadFiles rebuilds them after copy/delete/rename so
   * Columns match List and Icons.
   */
  async function loadFiles() {
    try {
      setError("");
      // Full-pane spinner only when the list area has nothing to keep showing.
      const keepShowing =
        files.length > 0 ||
        (viewMode === "column" && columnPath.length > 0);
      if (!keepShowing) setLoading(true);
      const fileList = await invoke<FileEntry[]>("list_files", {
        deviceId: selectedDevice,
        path: currentPath,
      });
      setFiles(fileList);
      if (fileList.length === 0 && currentPath === detectedStoragePath) {
        setError(
          `Storage at "${currentPath}" appears empty or inaccessible. ` +
          `On some devices (e.g. MIUI/Android 12), try setting USB mode to "File Transfer" ` +
          `and ensuring ADB file access is granted.`
        );
      }
    } catch (err) {
      // Clicking a crumb like `emulated` lands on a folder adb cannot list.
      // Move on to the listable child instead of showing the raw adb error,
      // and swap it into history so Back does not return to the dead folder.
      const redirect = /permission denied/i.test(String(err))
        ? listableChildToward(currentPath, detectedStoragePath)
        : null;
      if (redirect) {
        setPhoneHistory((prev) =>
          prev.stack[prev.index] === currentPath
            ? {
                ...prev,
                stack: prev.stack.map((p, i) => (i === prev.index ? redirect : p)),
              }
            : prev,
        );
        setCurrentPath(redirect);
        return;
      }
      setError(`Failed to list files: ${err}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageInfo() {
    if (!selectedDevice || !currentPath) {
      setStorageInfo(null);
      return;
    }

    try {
      const info = await invoke<StorageInfo>("get_storage_info", {
        deviceId: selectedDevice,
        path: currentPath,
      });
      setStorageInfo(info);
    } catch (err) {
      console.error(`Failed to get storage info: ${err}`);
      setStorageInfo(null);
    }
  }

  function getVisibleFiles() {
    return filterAndSortPhoneFiles(files, {
      showHiddenFiles,
      nameFilter,
      sortColumn,
      sortDirection,
    });
  }

  async function loadThumbnail(file: FileEntry, filePath: string) {
    if (!thumbnailsEnabled || !selectedDevice) return;
    // A folder has no preview. Pulling one copies the tree into the temp
    // folder, and the image reader then fails because that path is a directory.
    if (!needsThumbnail(file)) return;

    // Check cache first, including paths already known to have no preview
    if (thumbnailCache.has(filePath) || noPreviewPaths.current.has(filePath)) {
      return;
    }

    // Capture the current device ID to check if it changes during loading
    const deviceAtStart = selectedDevice;

    console.log(`Loading thumbnail - filePath: ${filePath}, extension: ${file.extension}, size: ${file.size}`);

    try {
      const thumbnailData = await phoneThumbnailLimiter(() =>
        invoke<string>("get_thumbnail", {
          deviceId: selectedDevice,
          filePath: filePath,
          extension: file.extension || "",
          fileSize: file.size,
        }),
      );

      // Only update cache if we're still on the same device (user hasn't navigated away)
      if (selectedDevice !== deviceAtStart) {
        console.log(`⊘ Thumbnail load aborted for ${file.name}: device changed during load`);
        return;
      }

      console.log(`Thumbnail result for ${file.name}:`, thumbnailData.substring(0, 50));

      if (thumbnailData && !thumbnailData.includes("placeholder") && !thumbnailData.includes("size-too-large")) {
        setThumbnailCache(prev => new Map(prev).set(filePath, thumbnailData));
        console.log(`✓ Thumbnail cached for ${file.name}`);
      } else {
        noPreviewPaths.current.add(filePath);
        console.warn(`✗ Thumbnail skipped for ${file.name}: ${thumbnailData}`);
      }
    } catch (err) {
      // Only show error if we're still on the same device
      if (selectedDevice === deviceAtStart) {
        console.error(`✗ Failed to load thumbnail for ${file.name}:`, err);
        setError(`Thumbnail error for ${file.name}: ${err}`);
      } else {
        console.log(`⊘ Thumbnail error suppressed for ${file.name}: user navigated away`);
      }
    }
  }

  /**
   * Columns passed a column row index into List/Icons `getDisplayFiles()`, so
   * Shift+click could not range-select in Columns (and Mac List used a different order
   * than the sorted/filtered rows). Optional `rangeSource` is the visible rows for this
   * click (column, filtered List, etc.); Shift ranges within that list only when
   * `rangeId` matches the previous anchor’s list. Does not range across different
   * Columns panes or into the other side.
   */
  function handleFileSelect(
    fileName: string,
    index: number,
    event: React.MouseEvent,
    rangeSource?: FileEntry[],
    rangeId = "list",
  ) {
    // macOS Control+click is a right-click; context menu owns selection.
    // Cmd+click still multi-selects. (DroidDock is Mac-only.)
    if (event.ctrlKey && !event.metaKey) return;
    setActivePane("phone");
    const visibleFiles = rangeSource ?? getDisplayFiles();

    if (
      event.shiftKey &&
      lastSelectedIndex !== -1 &&
      rangeId === lastSelectionRangeId
    ) {
      // Range select with Shift
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeFiles = visibleFiles.slice(start, end + 1).map(f => f.name);

      setFocusedIndex(index);
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        rangeFiles.forEach(name => newSet.add(name));
        return newSet;
      });
    } else if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd — if the last item is toggled off, drop the
      // keyboard ring too so an empty selection never keeps a border.
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileName)) {
          newSet.delete(fileName);
        } else {
          newSet.add(fileName);
        }
        if (newSet.size === 0) {
          setFocusedIndex(-1);
          focusedIndexHistory.current.delete(currentPath);
        } else {
          setFocusedIndex(index);
        }
        return newSet;
      });
      setLastSelectedIndex(index);
      setLastSelectionRangeId(rangeId);
    } else {
      // Single select (also Shift into a different column/list → new anchor)
      setFocusedIndex(index);
      setSelectedFiles(new Set([fileName]));
      setLastSelectedIndex(index);
      setLastSelectionRangeId(rangeId);
    }
  }

  function selectAll() {
    const visibleFiles = getVisibleFiles();
    setSelectedFiles(new Set(visibleFiles.map(f => f.name)));
  }

  function getDisplayFiles(): FileEntry[] {
    if (searchMode) {
      return searchResults;
    }
    return getVisibleFiles();
  }

  return {
    files,
    loading,
    setLoading,
    thumbnailCache,
    selectedFiles,
    setSelectedFiles,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleting,
    setDeleting,
    setLastSelectedIndex,
    searchQuery,
    setSearchQuery,
    nameFilter,
    setNameFilter,
    searchMode,
    setSearchMode,
    searchRecursive,
    setSearchRecursive,
    searchResults,
    setSearchResults,
    setSearching,
    searchInputRef,
    storageInfo,
    phoneHistory,
    sortColumn,
    sortDirection,
    applyListHeaderSort,
    columnPath,
    setColumnPath,
    columnFiles,
    setColumnFiles,
    columnSelected,
    setColumnSelected,
    activeColumnIndex,
    setActiveColumnIndex,
    focusedIndex,
    setFocusedIndex,
    focusedIndexHistory,
    renamingIndex,
    setRenamingIndex,
    renameValue,
    setRenameValue,
    renameInputRef,
    justRenamedFile,
    breadcrumbNavRef,
    phoneHistoryBack,
    phoneHistoryForward,
    loadFiles,
    loadStorageInfo,
    loadThumbnail,
    handleFileSelect,
    selectAll,
    getDisplayFiles,
  };
}
