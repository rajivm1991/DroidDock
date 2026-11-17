/**
 * Phone and Mac browsing for the shell: listings, preview, the file menu,
 * Columns on the phone, and per-pane Refresh.
 *
 * Called from App before the copy pipeline so these hooks stay in their
 * original order. Cross-pane copy, sync, and shortcuts stay in
 * useCopyPipeline. The copy lock refs are only read here so Refresh can refuse
 * to run while a conflict question is open.
 */
import { useEffect, useRef, type MouseEvent, type RefObject, type SetStateAction } from "react";
import type { MacPaneHandle } from "../../components/explorer/mac/macPaneTypes";
import type { FolderOpenClick } from "../../lib/presets";
import type { ConflictPromptResult } from "../../types/transfer";
import { useFileMenu } from "../phone/useFileMenu";
import { useFilePreview } from "../phone/useFilePreview";
import { useNewFolder } from "../phone/useNewFolder";
import { usePhoneColumns } from "../phone/usePhoneColumns";
import { usePhoneListing } from "../phone/usePhoneListing";
import { useMacExplorer } from "../mac/useMacExplorer";

/** Shared reload used by New folder before Columns exists in this hook. */
type PhoneListingReload = () => Promise<void>;

const PANE_CANVAS_IGNORE =
  ".file-row, .grid-item, .column-item, button, input, select, textarea, a, .phone-menu-panel, .selection-action-strip, th.sortable" as const;

export interface UseBrowsePanesArgs {
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  detectedStoragePath: string;
  setError: (value: SetStateAction<string>) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  thumbnailsEnabled: boolean;
  folderOpenClick: FolderOpenClick;
  viewMode: "table" | "grid" | "column";
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  setPlaceRefreshTick: (value: SetStateAction<number>) => void;
  transferFlowBusyRef: RefObject<boolean>;
  conflictPromptResolver: RefObject<((result: ConflictPromptResult) => void) | null>;
}

export function useBrowsePanes({
  selectedDevice,
  currentPath,
  setCurrentPath,
  detectedStoragePath,
  setError,
  setSuccessMessage,
  showHiddenFiles,
  thumbnailsEnabled,
  folderOpenClick,
  viewMode,
  setActivePane,
  macPaneHandleRef,
  phonePaneRef,
  setPlaceRefreshTick,
  transferFlowBusyRef,
  conflictPromptResolver,
}: UseBrowsePanesArgs) {
  const selectedFilesRef = useRef<Set<string>>(new Set());
  const macSelectedRef = useRef<Set<string>>(new Set());
  const contextMenuSelectionRef = useRef<{
    side: "phone" | "mac";
    names: Set<string>;
  } | null>(null);

  /**
   * WKWebView can fire a click that collapses a multi-selection to one row
   * before contextmenu runs. Snapshot the side’s selection on right-button or
   * Control+click mousedown; opening the menu restores it when the row was in
   * that snapshot. Left-click selection is unchanged.
   */
  function snapshotSelectionForContextMenu(
    side: "phone" | "mac",
    event: MouseEvent,
  ) {
    const isContextChord =
      event.button === 2 ||
      (event.button === 0 && event.ctrlKey && !event.metaKey);
    if (!isContextChord) return;
    contextMenuSelectionRef.current = {
      side,
      names: new Set(
        side === "phone" ? selectedFilesRef.current : macSelectedRef.current,
      ),
    };
  }

  const mac = useMacExplorer({
    showHiddenFiles,
    setActivePane,
    macPaneHandleRef,
    snapshotSelectionForContextMenu,
    paneCanvasIgnoreSelector: PANE_CANVAS_IGNORE,
  });

  const phone = usePhoneListing({
    selectedDevice,
    currentPath,
    setCurrentPath,
    detectedStoragePath,
    setError,
    showHiddenFiles,
    thumbnailsEnabled,
    setMacSelected: mac.setMacSelected,
    setMacLastSelectedIndex: mac.setMacLastSelectedIndex,
    setActivePane,
    viewMode,
  });

  /**
   * Copy / delete / rename / New folder used to call phone.loadFiles only, which
   * updates List and Icons but left Columns on a stale columnFiles map. Route every
   * phone reload through this ref so Columns rebuilds the same way as the Refresh
   * button. Wired after usePhoneColumns below.
   */
  const reloadPhoneListingRef = useRef<PhoneListingReload>(phone.loadFiles);

  const folder = useNewFolder({
    selectedDevice,
    currentPath,
    setPlaceRefreshTick,
    setError,
    macPath: mac.macPath,
    setMacRefresh: mac.setMacRefresh,
    setSuccessMessage,
    loadFiles: () => reloadPhoneListingRef.current(),
  });

  const preview = useFilePreview({
    selectedDevice,
    currentPath,
    files: phone.files,
    setError,
    showHiddenFiles,
    selectedFiles: phone.selectedFiles,
    setSelectedFiles: phone.setSelectedFiles,
    searchMode: phone.searchMode,
    searchResults: phone.searchResults,
    sortColumn: phone.sortColumn,
    sortDirection: phone.sortDirection,
    viewMode,
    focusedIndex: phone.focusedIndex,
    setFocusedIndex: phone.setFocusedIndex,
    getDisplayFiles: phone.getDisplayFiles,
  });

  function applyContextMenuRowSelection(
    side: "phone" | "mac",
    fileName: string,
  ) {
    const snap = contextMenuSelectionRef.current;
    contextMenuSelectionRef.current = null;
    const prior = snap && snap.side === side ? snap.names : null;
    if (side === "phone") {
      if (prior?.has(fileName)) {
        phone.setSelectedFiles(prior);
      } else {
        phone.setSelectedFiles(new Set([fileName]));
      }
      return;
    }
    if (prior?.has(fileName)) {
      mac.setMacSelected(prior);
    } else {
      mac.setMacSelected(new Set([fileName]));
    }
  }

  const menu = useFileMenu({
    selectedDevice,
    currentPath,
    setError,
    macPath: mac.macPath,
    setActivePane,
    applyContextMenuRowSelection,
  });

  selectedFilesRef.current = phone.selectedFiles;
  macSelectedRef.current = mac.macSelected;

  /**
   * Selecting on both panes at once made Copy direction unclear. A non-empty
   * phone selection clears the Mac selection, and the reverse.
   */
  useEffect(() => {
    if (phone.selectedFiles.size === 0) return;
    mac.setMacSelected((prev) => (prev.size === 0 ? prev : new Set()));
    mac.setMacLastSelectedIndex(-1);
  }, [phone.selectedFiles]);

  useEffect(() => {
    if (mac.macSelected.size === 0) return;
    phone.setSelectedFiles((prev) => (prev.size === 0 ? prev : new Set()));
    phone.setLastSelectedIndex(-1);
    phone.setFocusedIndex(-1);
  }, [mac.macSelected]);

  const columns = usePhoneColumns({
    selectedDevice,
    currentPath,
    setCurrentPath,
    loading: phone.loading,
    showHiddenFiles,
    folderOpenClick,
    phonePaneRef,
    viewMode,
    columnPath: phone.columnPath,
    setColumnPath: phone.setColumnPath,
    columnFiles: phone.columnFiles,
    setColumnFiles: phone.setColumnFiles,
    columnSelected: phone.columnSelected,
    setColumnSelected: phone.setColumnSelected,
    setActiveColumnIndex: phone.setActiveColumnIndex,
    handleFileSelect: phone.handleFileSelect,
  });

  /**
   * List/Icons read `files`; Columns keeps its own listings. After copy, delete,
   * rename, sync, or New folder, reload the open folder and rebuild Columns when
   * that view is active so every mode shows the same names. Path-change loads
   * inside usePhoneListing still call phone.loadFiles directly (Columns follow
   * via their own path effect).
   */
  async function loadFiles() {
    await phone.loadFiles();
    if (viewMode === "column" && selectedDevice && currentPath) {
      await columns.initializeColumnView();
    }
  }
  reloadPhoneListingRef.current = loadFiles;

  /**
   * Refresh reloads the open folder on one pane. It does not look for phones
   * and does not run while a copy question or scan lock is up.
   */
  function refreshBlocked(): boolean {
    if (transferFlowBusyRef.current || conflictPromptResolver.current) {
      setError(
        "Finish or cancel the current copy question before refreshing the folder.",
      );
      return true;
    }
    return false;
  }

  async function refreshPhoneFolder() {
    if (refreshBlocked()) return;
    if (!selectedDevice || !currentPath) return;
    await loadFiles();
    void phone.loadStorageInfo();
  }

  function refreshMacFolder() {
    if (refreshBlocked()) return;
    if (!mac.macPath) return;
    mac.setMacRefresh((n) => n + 1);
  }

  return {
    paneCanvasIgnoreSelector: PANE_CANVAS_IGNORE,
    snapshotSelectionForContextMenu,
    ...mac,
    ...phone,
    ...folder,
    ...preview,
    ...menu,
    ...columns,
    loadFiles,
    refreshPhoneFolder,
    refreshMacFolder,
  };
}

export type BrowsePanes = ReturnType<typeof useBrowsePanes>;
