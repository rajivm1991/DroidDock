/**
 * Copy, sync, shortcuts, and place marks.
 *
 * App calls this immediately after useBrowsePanes. The hooks inside stay in
 * the same order they had in App: drop hover, sync, phone actions, conflict
 * checks, the transfer queue, drag and drop, keyboard shortcuts, then place
 * marks and storage-path detection. This does not list folders or own the
 * phone path. The Finder-drop folder name is written into a ref App already
 * passed to the earlier prompt hook, so that hook does not have to move.
 */
import { useEffect, useRef, useState, type RefObject, type SetStateAction } from "react";
import type { IconSize } from "../../lib/iconSize";
import { invoke } from "@tauri-apps/api/core";
import type { MacPaneHandle } from "../../components/explorer/mac/macPaneTypes";
import type { FileEntry } from "../../lib/file-types";
import { normalizeFolderPath, phoneDefaultFolderPath } from "../../lib/presets";
import { usePhoneActions } from "../phone/usePhoneActions";
import { usePlaceMarks } from "../phone/usePlaceMarks";
import {
  useKeyboardShortcuts,
  type PaneCopyBuffer,
} from "./useKeyboardShortcuts";
import type { BrowsePanes } from "./useBrowsePanes";
import { usePaneDragDrop } from "../transfer/usePaneDragDrop";
import { usePaneDropHover } from "../transfer/usePaneDropHover";
import { useSyncFlow } from "../sync/useSyncFlow";
import { useTransferConflictResolver } from "../transfer/useTransferConflictResolver";
import { useTransferFlow } from "../transfer/useTransferFlow";
import { useTransferJob } from "../transfer/useTransferJob";
import { useTransferPrompts } from "../transfer/useTransferPrompts";
import { useTransferQueue } from "../transfer/useTransferQueue";

type TransferJobState = ReturnType<typeof useTransferJob>;
type TransferPrompts = ReturnType<typeof useTransferPrompts>;

export interface UseCopyPipelineArgs {
  browse: BrowsePanes;
  job: TransferJobState;
  prompts: TransferPrompts;
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  detectedStoragePath: string;
  setDetectedStoragePath: (value: SetStateAction<string>) => void;
  setError: (value: SetStateAction<string>) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  setShowHiddenFiles: (value: SetStateAction<boolean>) => void;
  thumbnailsEnabled: boolean;
  setThumbnailsEnabled: (value: SetStateAction<boolean>) => void;
  settingsOpen: boolean;
  setSettingsOpen: (value: SetStateAction<boolean>) => void;
  activePane: "phone" | "mac";
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  viewMode: "table" | "grid" | "column";
  setViewMode: (value: SetStateAction<"table" | "grid" | "column">) => void;
  iconSize: IconSize;
  iconSizeMax: IconSize;
  setIconSize: (value: SetStateAction<IconSize>) => void;
  showShortcutsHelp: boolean;
  setShowShortcutsHelp: (value: SetStateAction<boolean>) => void;
  tutorialOpen: boolean;
  closeTutorial: (dismissed: boolean) => void;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  macPaneRef: RefObject<HTMLElement | null>;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  /** Written each render so the earlier prompt hook can name the open phone folder. */
  phoneDestinationLabelRef: { current: () => string };
  placeRefreshTick: number;
  setPlaceRefreshTick: (value: SetStateAction<number>) => void;
}

export function useCopyPipeline({
  browse,
  job,
  prompts,
  selectedDevice,
  currentPath,
  setCurrentPath,
  detectedStoragePath,
  setDetectedStoragePath,
  setError,
  setSuccessMessage,
  showHiddenFiles,
  setShowHiddenFiles,
  thumbnailsEnabled,
  setThumbnailsEnabled,
  settingsOpen,
  setSettingsOpen,
  activePane,
  setActivePane,
  viewMode,
  setViewMode,
  iconSize,
  iconSizeMax,
  setIconSize,
  showShortcutsHelp,
  setShowShortcutsHelp,
  tutorialOpen,
  closeTutorial,
  phonePaneRef,
  macPaneRef,
  macPaneHandleRef,
  phoneDestinationLabelRef,
  placeRefreshTick,
  setPlaceRefreshTick,
}: UseCopyPipelineArgs) {
  /**
   * Cmd+C remembers an in-app selection for Cmd+V on the other pane. Quiet chip
   * above the status bar (same corner as the drag tip). Not the system clipboard.
   */
  const [copyHint, setCopyHint] = useState("");
  const copyBufferRef = useRef<PaneCopyBuffer | null>(null);

  useEffect(() => {
    if (!copyHint) return;
    const timer = window.setTimeout(() => setCopyHint(""), 4500);
    return () => window.clearTimeout(timer);
  }, [copyHint]);

  const hover = usePaneDropHover({
    currentPath,
    macPaneHandleRef,
    phonePaneRef,
    macPaneRef,
    viewMode,
    columnPath: browse.columnPath,
    focusPhoneColumn: browse.focusPhoneColumn,
  });

  const sync = useSyncFlow({
    selectedDevice,
    currentPath,
    setError,
    loadFiles: browse.loadFiles,
  });

  const actions = usePhoneActions({
    selectedDevice,
    currentPath,
    setCurrentPath,
    detectedStoragePath,
    setPlaceRefreshTick,
    files: browse.files,
    setLoading: browse.setLoading,
    setError,
    selectedFiles: browse.selectedFiles,
    setSelectedFiles: browse.setSelectedFiles,
    setShowDeleteConfirm: browse.setShowDeleteConfirm,
    setDeleting: browse.setDeleting,
    setLastSelectedIndex: browse.setLastSelectedIndex,
    searchQuery: browse.searchQuery,
    setSearchQuery: browse.setSearchQuery,
    searchMode: browse.searchMode,
    setSearchMode: browse.setSearchMode,
    setSearchRecursive: browse.setSearchRecursive,
    searchResults: browse.searchResults,
    setSearchResults: browse.setSearchResults,
    setSearching: browse.setSearching,
    setMacSelected: browse.setMacSelected,
    setMacLastSelectedIndex: browse.setMacLastSelectedIndex,
    setActivePane,
    snapshotSelectionForContextMenu: browse.snapshotSelectionForContextMenu,
    setSuccessMessage,
    viewMode,
    columnPath: browse.columnPath,
    columnFiles: browse.columnFiles,
    activeColumnIndex: browse.activeColumnIndex,
    setColumnPath: browse.setColumnPath,
    setActiveColumnIndex: browse.setActiveColumnIndex,
    focusPhoneColumn: browse.focusPhoneColumn,
    focusedIndex: browse.focusedIndex,
    setFocusedIndex: browse.setFocusedIndex,
    focusedIndexHistory: browse.focusedIndexHistory,
    renamingIndex: browse.renamingIndex,
    setRenamingIndex: browse.setRenamingIndex,
    renameValue: browse.renameValue,
    setRenameValue: browse.setRenameValue,
    renameInputRef: browse.renameInputRef,
    justRenamedFile: browse.justRenamedFile,
    breadcrumbNavRef: browse.breadcrumbNavRef,
    loadFiles: browse.loadFiles,
    paneCanvasIgnoreSelector: browse.paneCanvasIgnoreSelector,
    getDisplayFiles: browse.getDisplayFiles,
  });

  /** Short folder name for Copy labels (last path segment). */
  function pathLeafLabel(path: string, emptyLabel: string): string {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1]! : emptyLabel;
  }

  function macDestinationLabel(): string {
    if (!browse.macPath) return "This Mac";
    return pathLeafLabel(browse.macPath, "Home");
  }

  function phoneDestinationLabel(): string {
    const segments = actions.phoneDisplaySegments();
    if (segments.length === 0) return "phone";
    return segments[segments.length - 1]!.label;
  }

  // Keep drag-overlay labels fresh for the Tauri hover listener (empty deps).
  hover.dropLabelsRef.current = {
    phone: phoneDestinationLabel(),
    mac: macDestinationLabel(),
  };
  phoneDestinationLabelRef.current = phoneDestinationLabel;

  /**
   * Copy buttons name the selection and the open folder on the other pane.
   * The same text is used on the selection strip and the context menu. The
   * source filename stays off the button.
   */
  function copyPhoneToMacLabel(): string {
    return `Copy selection to ${macDestinationLabel()} on This Mac`;
  }

  function copyMacToPhoneLabel(): string {
    return `Copy selection to ${phoneDestinationLabel()} on phone`;
  }

  const conflicts = useTransferConflictResolver({
    selectedDevice,
    showHiddenFiles,
    setSuccessMessage,
    setConflictMode: prompts.setConflictMode,
    setTransferFlowStatus: prompts.setTransferFlowStatus,
    transferFlowAbortRef: prompts.transferFlowAbortRef,
    askPreflightConflicts: prompts.askPreflightConflicts,
    askPerItemConflict: prompts.askPerItemConflict,
    askReplaceFoldersConfirm: prompts.askReplaceFoldersConfirm,
  });

  const queue = useTransferQueue({
    selectedDevice,
    setError,
    setSelectedFiles: browse.setSelectedFiles,
    setLastSelectedIndex: browse.setLastSelectedIndex,
    setTransferHistory: job.setTransferHistory,
    setDownloading: job.setDownloading,
    setUploading: job.setUploading,
    setDownloadProgress: job.setDownloadProgress,
    setUploadProgress: job.setUploadProgress,
    setTransferJob: job.setTransferJob,
    transferJobRef: job.transferJobRef,
    transferControl: job.transferControl,
    setMacSelected: browse.setMacSelected,
    setMacLastSelectedIndex: browse.setMacLastSelectedIndex,
    setSuccessMessage,
    conflictPrompt: prompts.conflictPrompt,
    conflictDialogOpenRef: prompts.conflictDialogOpenRef,
    inFlightTransferIdRef: job.inFlightTransferIdRef,
    revealAfterDownload: job.revealAfterDownload,
    loadFiles: browse.loadFiles,
    updateTransferFile: job.updateTransferFile,
    cancelConflictPrompt: prompts.cancelConflictPrompt,
    askPerItemConflict: prompts.askPerItemConflict,
    checkDestKinds: conflicts.checkDestKinds,
    setJobAwaitingConflict: job.setJobAwaitingConflict,
    cancelRemainingRows: job.cancelRemainingRows,
  });

  const flow = useTransferFlow({
    selectedDevice,
    currentPath,
    files: browse.files,
    setError,
    showHiddenFiles,
    selectedFiles: browse.selectedFiles,
    setSelectedFiles: browse.setSelectedFiles,
    searchResults: browse.searchResults,
    transferJobRef: job.transferJobRef,
    macPath: browse.macPath,
    macFiles: browse.macFiles,
    macSelected: browse.macSelected,
    setMacRefresh: browse.setMacRefresh,
    setSuccessMessage,
    setTransferFlowStatus: prompts.setTransferFlowStatus,
    transferFlowAbortRef: prompts.transferFlowAbortRef,
    setDownloadOptionsOpen: job.setDownloadOptionsOpen,
    tryBeginTransferFlow: prompts.tryBeginTransferFlow,
    endTransferFlow: prompts.endTransferFlow,
    resolveTransferConflicts: conflicts.resolveTransferConflicts,
    runTransferQueue: queue.runTransferQueue,
  });

  const drag = usePaneDragDrop({
    selectedDevice,
    currentPath,
    files: browse.files,
    setError,
    selectedFiles: browse.selectedFiles,
    transferJobRef: job.transferJobRef,
    macPath: browse.macPath,
    conflictPromptResolver: prompts.conflictPromptResolver,
    inAppDragRef: hover.inAppDragRef,
    finderDragActiveRef: hover.finderDragActiveRef,
    phonePaneRef,
    macPaneRef,
    dropLabelsRef: hover.dropLabelsRef,
    applyDropHoverRef: hover.applyDropHoverRef,
    clearDropHoverRef: hover.clearDropHoverRef,
    dropAllowedAtRef: hover.dropAllowedAtRef,
    transferFlowBusyRef: prompts.transferFlowBusyRef,
    setTransferFlowStatus: prompts.setTransferFlowStatus,
    columnFiles: browse.columnFiles,
    setDropHover: hover.setDropHover,
    dropAllowedAt: hover.dropAllowedAt,
    applyDropHover: hover.applyDropHover,
    clearDropHover: hover.clearDropHover,
    confirmFinderDropTip: prompts.confirmFinderDropTip,
    planTransfer: flow.planTransfer,
    runPlannedTransfer: flow.runPlannedTransfer,
    copyPhoneNamesToMac: flow.copyPhoneNamesToMac,
    buildUploadItems: flow.buildUploadItems,
    sendMacNames: flow.sendMacNames,
  });

  useKeyboardShortcuts({
    selectedDevice,
    setCurrentPath,
    currentPath,
    newFolderDialog: browse.newFolderDialog,
    setNewFolderDialog: browse.setNewFolderDialog,
    loading: browse.loading,
    setError,
    setShowHiddenFiles,
    showHiddenFiles,
    setThumbnailsEnabled,
    thumbnailsEnabled,
    setSettingsOpen,
    settingsOpen,
    selectedFiles: browse.selectedFiles,
    setSelectedFiles: browse.setSelectedFiles,
    setShowDeleteConfirm: browse.setShowDeleteConfirm,
    showDeleteConfirm: browse.showDeleteConfirm,
    deleting: browse.deleting,
    setShowPreview: browse.setShowPreview,
    showPreview: browse.showPreview,
    setPreviewData: browse.setPreviewData,
    previewLoading: browse.previewLoading,
    searchMode: browse.searchMode,
    searchInputRef: browse.searchInputRef,
    uploading: job.uploading,
    macSelected: browse.macSelected,
    macPath: browse.macPath,
    activePane,
    setActivePane,
    conflictPrompt: prompts.conflictPrompt,
    transferFlowBusy: prompts.transferFlowBusy,
    downloadOptionsOpen: job.downloadOptionsOpen,
    setDownloadOptionsOpen: job.setDownloadOptionsOpen,
    setViewMode,
    viewMode,
    iconSize,
    iconSizeMax,
    setIconSize,
    columnPath: browse.columnPath,
    setColumnPath: browse.setColumnPath,
    columnFiles: browse.columnFiles,
    setColumnFiles: browse.setColumnFiles,
    columnSelected: browse.columnSelected,
    setColumnSelected: browse.setColumnSelected,
    activeColumnIndex: browse.activeColumnIndex,
    setActiveColumnIndex: browse.setActiveColumnIndex,
    focusPhoneColumn: browse.focusPhoneColumn,
    focusedIndex: browse.focusedIndex,
    setFocusedIndex: browse.setFocusedIndex,
    setShowShortcutsHelp,
    showShortcutsHelp,
    tutorialOpen,
    closeTutorial,
    renamingIndex: browse.renamingIndex,
    syncDialogOpen: sync.syncDialogOpen,
    syncPreviewing: sync.syncPreviewing,
    syncing: sync.syncing,
    fileMenu: browse.fileMenu,
    setFileMenu: browse.setFileMenu,
    openFileMenuAt: browse.openFileMenuAt,
    phoneHistoryBack: browse.phoneHistoryBack,
    phoneHistoryForward: browse.phoneHistoryForward,
    macHistoryBack: browse.macHistoryBack,
    macHistoryForward: browse.macHistoryForward,
    macPaneHandleRef,
    phonePaneRef,
    macDestinationLabel,
    phoneDestinationLabel,
    copyHint,
    setCopyHint,
    copyBufferRef,
    copyPhoneNamesToMac: flow.copyPhoneNamesToMac,
    sendMacNames: flow.sendMacNames,
    expandEmptyPhoneColumnOpen: browse.expandEmptyPhoneColumnOpen,
    loadColumnFiles: browse.loadColumnFiles,
    navigateToDirectory: actions.navigateToDirectory,
    navigateUp: actions.navigateUp,
    selectAll: browse.selectAll,
    selectAllMac: browse.selectAllMac,
    clearSelection: actions.clearSelection,
    performDelete: actions.performDelete,
    beginRename: actions.beginRename,
    cancelRename: actions.cancelRename,
    exitSearchMode: actions.exitSearchMode,
    copyPhoneSelectionToMac: flow.copyPhoneSelectionToMac,
    copyMacSelectionToPhone: flow.copyMacSelectionToPhone,
    cancelTransferFlowFromKeyboard: prompts.cancelTransferFlowFromKeyboard,
    previewFileByName: browse.previewFileByName,
    handlePreviewNavigation: browse.handlePreviewNavigation,
    handleOpenSyncDialog: sync.handleOpenSyncDialog,
    handleCloseSyncDialog: sync.handleCloseSyncDialog,
    getDisplayFiles: browse.getDisplayFiles,
  });

  /**
   * Full-name place marks and custom shortcuts. Paths that do not exist on
   * this phone are hidden. Jumping to a mark is the pane’s job. This does not
   * replace the breadcrumb.
   */
  const storageRoot = normalizeFolderPath(detectedStoragePath || "/storage/emulated/0");
  const places = usePlaceMarks({
    selectedDevice,
    currentPath,
    detectedStoragePath,
    placeRefreshTick,
    setPlaceRefreshTick,
    files: browse.files,
    setError,
    selectedFiles: browse.selectedFiles,
    searchResults: browse.searchResults,
    macPath: browse.macPath,
    macFiles: browse.macFiles,
    macSelected: browse.macSelected,
    setSuccessMessage,
    columnFiles: browse.columnFiles,
    storageRoot,
  });

  /**
   * An empty Camera start folder used to trap people there. Settings picks the
   * start folder, and an empty or missing folder falls back to Internal
   * storage. This runs only when the device (or that setting) changes.
   */
  async function detectStoragePath() {
    if (!selectedDevice) return;

    try {
      const detectedPath = await invoke<string>("detect_storage_path", {
        deviceId: selectedDevice,
      });
      setDetectedStoragePath(detectedPath);
      const preferred = phoneDefaultFolderPath(detectedPath, places.phoneDefaultFolder);
      if (preferred === detectedPath) {
        setCurrentPath(detectedPath);
        return;
      }
      try {
        const listed = await invoke<FileEntry[]>("list_files", {
          deviceId: selectedDevice,
          path: preferred,
        });
        setCurrentPath(listed.length > 0 ? preferred : detectedPath);
      } catch {
        setCurrentPath(detectedPath);
      }
    } catch (err) {
      console.error(`Failed to detect storage path: ${err}`);
      setDetectedStoragePath("/storage/emulated/0");
      setCurrentPath("/storage/emulated/0");
    }
  }

  useEffect(() => {
    if (selectedDevice) {
      void detectStoragePath();
    }
  }, [selectedDevice, places.phoneDefaultFolder]);

  return {
    ...hover,
    ...sync,
    ...actions,
    copyPhoneToMacLabel,
    copyMacToPhoneLabel,
    copyHint,
    setCopyHint,
    ...queue,
    ...flow,
    ...drag,
    ...places,
  };
}
