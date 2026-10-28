/**
 * What the phone pane’s buttons and path do: open a folder, go up, delete,
 * rename, and search. The file list itself stays in usePhoneListing. Dialogs
 * are drawn by the shell from the flags this sets.
 */
import { RefObject, SetStateAction, useState } from "react";
import { pathSegments, getDisplaySegments } from "../../lib/phonePathDisplay";
import { type PathCrumb } from "../../components/explorer/PathBreadcrumb";
import { invoke } from "@tauri-apps/api/core";
import { type FileEntry } from "../../lib/file-types";
import { joinColumnPath } from "../../lib/columnPathCollapse";

export interface UsePhoneActionsArgs {
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  detectedStoragePath: string;
  setPlaceRefreshTick: (value: SetStateAction<number>) => void;
  files: FileEntry[];
  setLoading: (value: SetStateAction<boolean>) => void;
  setError: (value: SetStateAction<string>) => void;
  selectedFiles: Set<string>;
  setSelectedFiles: (value: SetStateAction<Set<string>>) => void;
  setShowDeleteConfirm: (value: SetStateAction<boolean>) => void;
  setDeleting: (value: SetStateAction<boolean>) => void;
  setLastSelectedIndex: (value: SetStateAction<number>) => void;
  searchQuery: string;
  setSearchQuery: (value: SetStateAction<string>) => void;
  searchMode: boolean;
  setSearchMode: (value: SetStateAction<boolean>) => void;
  setSearchRecursive: (value: SetStateAction<boolean>) => void;
  searchResults: FileEntry[];
  setSearchResults: (value: SetStateAction<FileEntry[]>) => void;
  setSearching: (value: SetStateAction<boolean>) => void;
  setMacSelected: (value: SetStateAction<Set<string>>) => void;
  setMacLastSelectedIndex: (value: SetStateAction<number>) => void;
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  snapshotSelectionForContextMenu: (side: "phone" | "mac", event: React.MouseEvent) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  viewMode: "table" | "grid" | "column";
  columnPath: string[];
  columnFiles: Map<string, FileEntry[]>;
  activeColumnIndex: number;
  setColumnPath: (value: SetStateAction<string[]>) => void;
  setActiveColumnIndex: (value: SetStateAction<number>) => void;
  focusPhoneColumn: (
    columnIndex: number,
    selectedRowIndex?: number,
    behavior?: ScrollBehavior,
    horizontal?: boolean,
  ) => void;
  focusedIndex: number;
  setFocusedIndex: (value: SetStateAction<number>) => void;
  focusedIndexHistory: RefObject<Map<string, number>>;
  renamingIndex: number;
  setRenamingIndex: (value: SetStateAction<number>) => void;
  renameValue: string;
  setRenameValue: (value: SetStateAction<string>) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  justRenamedFile: RefObject<string | null>;
  breadcrumbNavRef: RefObject<boolean>;
  loadFiles: () => Promise<void>;
  paneCanvasIgnoreSelector: ".file-row, .grid-item, .column-item, button, input, select, textarea, a, .phone-menu-panel, .selection-action-strip, th.sortable";
  getDisplayFiles: () => FileEntry[];
}

export function usePhoneActions({
  selectedDevice,
  currentPath,
  setCurrentPath,
  detectedStoragePath,
  setPlaceRefreshTick,
  files,
  setLoading,
  setError,
  selectedFiles,
  setSelectedFiles,
  setShowDeleteConfirm,
  setDeleting,
  setLastSelectedIndex,
  searchQuery,
  setSearchQuery,
  searchMode,
  setSearchMode,
  setSearchRecursive,
  searchResults,
  setSearchResults,
  setSearching,
  setMacSelected,
  setMacLastSelectedIndex,
  setActivePane,
  snapshotSelectionForContextMenu,
  setSuccessMessage,
  viewMode,
  columnPath,
  columnFiles,
  activeColumnIndex,
  setColumnPath,
  setActiveColumnIndex,
  focusPhoneColumn,
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
  loadFiles,
  paneCanvasIgnoreSelector,
  getDisplayFiles,
}: UsePhoneActionsArgs) {

  function navigateToDirectory(dirName: string) {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }

    // If dirName starts with /, it's already a full path (from search results)
    const newPath = dirName.startsWith("/")
      ? dirName
      : currentPath === "/"
      ? `/${dirName}`
      : `${currentPath}/${dirName}`;
    setCurrentPath(newPath);
    // Exit search mode when navigating to a directory
    if (searchMode) {
      exitSearchMode();
    }
  }

  function navigateUp() {
    if (currentPath === "/") return;
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    setCurrentPath(parentPath);
  }

  function getPathSegments() {
    return pathSegments(currentPath);
  }

  /**
   * A breadcrumb jump drops the current selection (and with it the action
   * strip). Clicking the folder you are already in changes no path, so it has
   * to clear here; a real jump also tells the listing not to re-select the
   * folder it just left.
   */
  function clearSelectionForCrumb(targetPath: string) {
    setSelectedFiles(new Set());
    setLastSelectedIndex(-1);
    if (targetPath !== currentPath) breadcrumbNavRef.current = true;
  }

  function navigateToSegment(index: number) {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    const segments = getPathSegments();
    const newPath = "/" + segments.slice(0, index + 1).join("/");
    clearSelectionForCrumb(newPath);
    setCurrentPath(newPath);

    // In column view, also update the active column index
    if (viewMode === 'column') {
      const pathIndex = columnPath.findIndex(p => p === newPath);
      if (pathIndex >= 0) {
        setActiveColumnIndex(pathIndex);
        // Remove columns after the clicked segment
        const newPaths = columnPath.slice(0, pathIndex + 1);
        if (newPaths.length !== columnPath.length) {
          setColumnPath(newPaths);
        }
        focusPhoneColumn(pathIndex, undefined, "smooth");
      }
    }
  }

  function phoneDisplaySegments() {
    return getDisplaySegments(currentPath, detectedStoragePath);
  }

  function navigateToHome() {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    clearSelectionForCrumb(detectedStoragePath);
    setCurrentPath(detectedStoragePath);
  }

  /**
   * List/icons used a four-crumb middle-ellipsis even when the path strip could wrap;
   * Mac already shows every segment after the wrap fix. Full phone crumb list (friendly
   * storage labels in list/icons). Map display or raw segments to PathBreadcrumb
   * clicks. Does not hide middle folders behind “…”.
   */
  function phonePathCrumbs(): PathCrumb[] {
    if (viewMode === "column") {
      return getPathSegments().map((segment, index) => ({
        label: segment,
        onClick: () => navigateToSegment(index),
      }));
    }
    return phoneDisplaySegments().map((segment) => ({
      label: segment.label,
      onClick: () => {
        if (segment.isStorage) navigateToHome();
        else navigateToSegment(segment.actualIndex);
      },
    }));
  }

  /**
   * Clearing selection left the accent keyboard ring on the last row, which looked like
   * a stuck selection. Exclusive phone/Mac selection shares one Clear / Escape path.
   * Drops phone and Mac selection, phone focus, and saved phone focus. Does not change
   * the open folders or start a transfer.
   */
  function clearSelection() {
    setSelectedFiles(new Set());
    setLastSelectedIndex(-1);
    setFocusedIndex(-1);
    focusedIndexHistory.current.delete(currentPath);
    setMacSelected(new Set());
    setMacLastSelectedIndex(-1);
  }

  /**
   * Finder-style — empty chrome / list canvas in a pane should drop that pane’s picks;
   * otherwise people had only Clear selection / Escape. Activates the phone pane (Cmd+A
   * / arrows), keeps context-menu snapshot behavior, clears phone selection + keyboard
   * ring on empty hits. Does not clear Mac selection, or run when the hit is a row /
   * control / selection strip / sortable header.
   */
  function handlePhonePaneMouseDown(event: React.MouseEvent) {
    snapshotSelectionForContextMenu("phone", event);
    setActivePane("phone");
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(paneCanvasIgnoreSelector)) return;
    if (selectedFiles.size > 0) {
      setSelectedFiles(new Set());
      setLastSelectedIndex(-1);
    }
    if (focusedIndex >= 0) {
      setFocusedIndex(-1);
      focusedIndexHistory.current.delete(currentPath);
    }
  }

  async function performDelete() {
    if (!selectedDevice || selectedFiles.size === 0) return;

    setDeleting(true);
    setError("");

    const filesToDelete = Array.from(selectedFiles);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of filesToDelete) {
      // Find file in both files and searchResults
      const file = files.find(f => f.name === fileName) || searchResults.find(f => f.name === fileName);
      if (!file) continue;

      // If fileName starts with /, it's already a full path (from search results)
      const filePath = fileName.startsWith("/")
        ? fileName
        : currentPath === "/"
        ? `/${fileName}`
        : `${currentPath}/${fileName}`;

      try {
        await invoke("delete_file", {
          deviceId: selectedDevice,
          filePath: filePath,
          isDirectory: file.is_directory,
        });
        successCount++;
      } catch (err) {
        errorCount++;
        setError(`Failed to delete ${fileName}: ${err}`);
        console.error(`Delete error for ${fileName}:`, err);
      }
    }

    setDeleting(false);
    setShowDeleteConfirm(false);
    setSelectedFiles(new Set());

    const deleteMessage = errorCount > 0
      ? `Deleted ${successCount} file(s), ${errorCount} failed`
      : "";

    if (successCount > 0) {
      if (searchMode) {
        await performSearch();
      } else {
        await loadFiles();
      }
      // Deleting a folder that was a place mark left a dead chip until reconnect.
      setPlaceRefreshTick((tick) => tick + 1);
    }

    if (deleteMessage) {
      setError(deleteMessage);
    }
  }

  function startRename(index: number, currentName: string) {
    setRenamingIndex(index);
    setRenameValue(currentName);
    // Focus the input after a short delay to ensure it's rendered
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }

  /**
   * The one way to start a rename from the strip, the right-click menu and
   * Cmd+Return. Only List has an inline field in the row; Icons and Columns
   * have none (startRename alone did nothing there), so they ask in a dialog.
   * `dir` is the folder the row was in. In Columns that is the column that was
   * clicked, which may not be the open folder; without it the active column is
   * used.
   */
  const [renameDialog, setRenameDialog] = useState<{
    path: string;
    name: string;
    isDirectory: boolean;
  } | null>(null);
  const [renameDialogValue, setRenameDialogValue] = useState("");
  const [renameDialogBusy, setRenameDialogBusy] = useState(false);

  function beginRename(name: string, dir?: string) {
    if (viewMode === "table" && !searchMode) {
      const index = getDisplayFiles().findIndex((file) => file.name === name);
      if (index >= 0) startRename(index, name);
      return;
    }
    let folder = currentPath;
    let entry: FileEntry | undefined;
    if (viewMode === "column") {
      folder = dir ?? columnPath[activeColumnIndex] ?? currentPath;
      entry = (columnFiles.get(folder) ?? []).find((file) => file.name === name);
    } else {
      entry = getDisplayFiles().find((file) => file.name === name);
    }
    if (!entry) return;
    const path = entry.name.startsWith("/") ? entry.name : joinColumnPath(folder, entry.name);
    setRenameDialog({ path, name: entry.name, isDirectory: entry.is_directory });
    setRenameDialogValue(entry.name);
  }

  function cancelRenameDialog() {
    if (!renameDialogBusy) setRenameDialog(null);
  }

  async function confirmRenameDialog() {
    if (!renameDialog || renameDialogBusy) return;
    setRenameDialogBusy(true);
    const ok = await renameAtPath(
      renameDialog.path,
      renameDialog.isDirectory,
      renameDialogValue,
    );
    setRenameDialogBusy(false);
    if (ok) {
      clearSelection();
      setRenameDialog(null);
    }
  }

  function cancelRename() {
    setRenamingIndex(-1);
    setRenameValue("");
  }

  async function confirmRename() {
    if (!selectedDevice || renamingIndex < 0 || !renameValue.trim()) {
      cancelRename();
      return;
    }

    const file = getDisplayFiles()[renamingIndex];
    if (!file) {
      cancelRename();
      return;
    }

    // If name hasn't changed, just cancel
    if (renameValue === file.name) {
      cancelRename();
      return;
    }

    const filePath = file.name.startsWith("/")
      ? file.name
      : currentPath === "/"
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;

    try {
      await renameAtPath(filePath, file.is_directory, renameValue, true);
    } finally {
      cancelRename();
    }
  }

  /**
   * Renames one phone item by its full path. The inline List field and the
   * Rename dialog (Icons and Columns, where there is no inline field) both
   * end here. `focusAfter` asks the open-folder listing to focus the new name
   * once it reloads; only the inline flow wants that. Returns whether it worked.
   */
  async function renameAtPath(
    oldPath: string,
    isDirectory: boolean,
    newName: string,
    focusAfter = false,
  ): Promise<boolean> {
    const trimmed = newName.trim();
    if (!selectedDevice || !trimmed) return false;
    try {
      setLoading(true);
      setError("");

      await invoke("rename_file", {
        deviceId: selectedDevice,
        oldPath,
        newName: trimmed,
      });

      setSuccessMessage(`Renamed to "${trimmed}"`);

      // Store the new filename so we can focus on it after reload
      if (focusAfter) justRenamedFile.current = trimmed;

      // Refresh file list
      if (searchMode) {
        await performSearch();
      } else {
        await loadFiles();
      }
      // Renaming a folder that was a custom preset must hide that chip until the old
      // path exists again (preset stays saved in Settings).
      if (isDirectory) {
        setPlaceRefreshTick((tick) => tick + 1);
      }
      return true;
    } catch (err) {
      setError(`Failed to rename: ${err}`);
      console.error("Rename error:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Filtering the open folder and searching below it were one control. A subfolder
   * search that always walks down from the open folder. Calls the existing search
   * command and shows results with paths. Does not change files. An empty query does
   * nothing. pass the text in, because React state from the filter box may not have
   * committed yet if this is called from a key handler.
   */
  async function performSearch(pattern: string = searchQuery, recursive: boolean = true) {
    if (!selectedDevice || !pattern.trim()) return;

    setSearching(true);
    setError("");
    setSearchQuery(pattern);
    setSearchRecursive(recursive);

    try {
      const results = await invoke<FileEntry[]>("search_files", {
        deviceId: selectedDevice,
        searchPath: currentPath,
        pattern,
        recursive,
      });
      setSearchResults(results);
      setSearchMode(true);
    } catch (err) {
      setError(`Search failed: ${err}`);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function exitSearchMode() {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedFiles(new Set());
  }

  return {
    navigateToDirectory,
    navigateUp,
    phoneDisplaySegments,
    phonePathCrumbs,
    clearSelection,
    handlePhonePaneMouseDown,
    performDelete,
    startRename,
    cancelRename,
    confirmRename,
    beginRename,
    renameDialog,
    renameDialogValue,
    setRenameDialogValue,
    renameDialogBusy,
    cancelRenameDialog,
    confirmRenameDialog,
    performSearch,
    exitSearchMode,
  };
}
