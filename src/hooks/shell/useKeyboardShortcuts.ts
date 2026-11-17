/**
 * Window key handlers. They call the same actions as the buttons, and they
 * stay quiet while a dialog is up except for Escape (and arrows in preview).
 * Pane-scoped keys (arrows, history, view mode, copy) follow activePane so
 * This Mac and Phone each keep their own focus and open folder.
 *
 * Shortcut history that matters for maintainers:
 * - Return opens a folder (Cmd+O was removed — Return is the natural “go in”
 *   key on a Mac keyboard).
 * - Cmd+Return renames on Phone (Return used to rename; that fought “open”).
 * - Delete / Backspace (no Cmd) goes to the parent folder. That replaced
 *   Cmd+↑, which was easy to confuse with plain arrow navigation. The Mac
 *   keycap labeled Delete sends Backspace.
 * - While the file menu is open, ↑↓ and Return are handled in FileMenu
 *   (capture), not here.
 */
import { RefObject, SetStateAction, useEffect, useRef } from "react";
import { visibleColumnEntries, joinColumnPath, collapseEmptyIntermediatePaths, basenameSegment } from "../../lib/columnPathCollapse";
import { type FileEntry } from "../../lib/file-types";
import { calculateGridColumns } from "../../lib/fileDisplay";
import { anyModalOpen } from "../../lib/shortcutGuards";
import { nextIconSize, prevIconSize, type IconSize } from "../../lib/iconSize";
import { type FilePreview, type ConflictPromptState } from "../../types/transfer";
import type { MacPaneHandle } from "../../components/explorer/mac/macPaneTypes";

/** In-app Cmd+C buffer — not the system clipboard. */
export type PaneCopyBuffer = {
  side: "phone" | "mac";
  path: string;
  names: string[];
};

export interface UseKeyboardShortcutsArgs {
  selectedDevice: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  currentPath: string;
  newFolderDialog: { side: "phone" | "mac"; } | null;
  setNewFolderDialog: (value: SetStateAction<{ side: "phone" | "mac"; } | null>) => void;
  loading: boolean;
  setError: (value: SetStateAction<string>) => void;
  setShowHiddenFiles: (value: SetStateAction<boolean>) => void;
  showHiddenFiles: boolean;
  setThumbnailsEnabled: (value: SetStateAction<boolean>) => void;
  thumbnailsEnabled: boolean;
  setSettingsOpen: (value: SetStateAction<boolean>) => void;
  settingsOpen: boolean;
  selectedFiles: Set<string>;
  setSelectedFiles: (value: SetStateAction<Set<string>>) => void;
  setShowDeleteConfirm: (value: SetStateAction<boolean>) => void;
  showDeleteConfirm: boolean;
  deleting: boolean;
  setShowPreview: (value: SetStateAction<boolean>) => void;
  showPreview: boolean;
  setPreviewData: (value: SetStateAction<FilePreview | null>) => void;
  previewLoading: boolean;
  searchMode: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  macSelected: Set<string>;
  macPath: string;
  activePane: "phone" | "mac";
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  conflictPrompt: ConflictPromptState | null;
  transferFlowBusy: boolean;
  downloadOptionsOpen: boolean;
  setDownloadOptionsOpen: (value: SetStateAction<boolean>) => void;
  setViewMode: (value: SetStateAction<"table" | "grid" | "column">) => void;
  viewMode: "table" | "grid" | "column";
  iconSize: IconSize;
  iconSizeMax: IconSize;
  setIconSize: (value: SetStateAction<IconSize>) => void;
  columnPath: string[];
  setColumnPath: (value: SetStateAction<string[]>) => void;
  columnFiles: Map<string, FileEntry[]>;
  setColumnFiles: (value: SetStateAction<Map<string, FileEntry[]>>) => void;
  columnSelected: Map<string, number>;
  setColumnSelected: (value: SetStateAction<Map<string, number>>) => void;
  activeColumnIndex: number;
  setActiveColumnIndex: (value: SetStateAction<number>) => void;
  focusPhoneColumn: (
    columnIndex: number,
    selectedRowIndex?: number,
    behavior?: ScrollBehavior,
    horizontal?: boolean,
  ) => void;
  focusedIndex: number;
  setFocusedIndex: (value: SetStateAction<number>) => void;
  setShowShortcutsHelp: (value: SetStateAction<boolean>) => void;
  showShortcutsHelp: boolean;
  tutorialOpen: boolean;
  closeTutorial: (dismissed: boolean) => void;
  renamingIndex: number;
  syncDialogOpen: boolean;
  syncPreviewing: boolean;
  syncing: boolean;
  fileMenu: { x: number; y: number; name: string; isDirectory: boolean; side: "phone" | "mac"; dir?: string } | null;
  setFileMenu: (
    value: SetStateAction<{
      x: number;
      y: number;
      name: string;
      isDirectory: boolean;
      side: "phone" | "mac";
    } | null>,
  ) => void;
  openFileMenuAt: (
    side: "phone" | "mac",
    x: number,
    y: number,
    name: string,
    isDirectory: boolean,
  ) => void;
  phoneHistoryBack: () => void;
  phoneHistoryForward: () => void;
  macHistoryBack: () => void;
  macHistoryForward: () => void;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  macDestinationLabel: () => string;
  phoneDestinationLabel: () => string;
  copyHint: string;
  setCopyHint: (value: SetStateAction<string>) => void;
  copyBufferRef: RefObject<PaneCopyBuffer | null>;
  copyPhoneNamesToMac: (names: string[]) => Promise<void>;
  sendMacNames: (names: string[]) => Promise<void>;
  expandEmptyPhoneColumnOpen: (startPath: string, initialListing: FileEntry[]) => Promise<{ chainPaths: string[]; filesByPath: Map<string, FileEntry[]>; openPath: string; }>;
  loadColumnFiles: (path: string) => Promise<FileEntry[]>;
  navigateToDirectory: (dirName: string) => void;
  navigateUp: () => void;
  selectAll: () => void;
  selectAllMac: () => void;
  clearSelection: () => void;
  performDelete: () => Promise<void>;
  beginRename: (name: string, dir?: string) => void;
  cancelRename: () => void;
  exitSearchMode: () => void;
  copyPhoneSelectionToMac: () => void;
  copyMacSelectionToPhone: () => void;
  cancelTransferFlowFromKeyboard: () => void;
  previewFileByName: (fileName: string) => Promise<void>;
  handlePreviewNavigation: (key: string) => Promise<void>;
  handleOpenSyncDialog: () => void;
  handleCloseSyncDialog: () => void;
  getDisplayFiles: () => FileEntry[];
}

function isShortcutsHelpChord(e: KeyboardEvent): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
  return e.key === "/" || e.code === "Slash";
}

function itemCountLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

export function useKeyboardShortcuts({
  selectedDevice,
  setCurrentPath,
  currentPath,
  newFolderDialog,
  setNewFolderDialog,
  loading,
  setError,
  setShowHiddenFiles,
  showHiddenFiles,
  setThumbnailsEnabled,
  thumbnailsEnabled,
  setSettingsOpen,
  settingsOpen,
  selectedFiles,
  setSelectedFiles,
  setShowDeleteConfirm,
  showDeleteConfirm,
  deleting,
  setShowPreview,
  showPreview,
  setPreviewData,
  previewLoading,
  searchMode,
  searchInputRef,
  uploading,
  macSelected,
  macPath,
  activePane,
  setActivePane,
  conflictPrompt,
  transferFlowBusy,
  downloadOptionsOpen,
  setDownloadOptionsOpen,
  setViewMode,
  viewMode,
  iconSize,
  iconSizeMax,
  setIconSize,
  columnPath,
  setColumnPath,
  columnFiles,
  setColumnFiles,
  columnSelected,
  setColumnSelected,
  activeColumnIndex,
  setActiveColumnIndex,
  focusPhoneColumn,
  focusedIndex,
  setFocusedIndex,
  setShowShortcutsHelp,
  showShortcutsHelp,
  tutorialOpen,
  closeTutorial,
  renamingIndex,
  syncDialogOpen,
  syncPreviewing,
  syncing,
  fileMenu,
  setFileMenu,
  openFileMenuAt,
  phoneHistoryBack,
  phoneHistoryForward,
  macHistoryBack,
  macHistoryForward,
  macPaneHandleRef,
  phonePaneRef,
  macDestinationLabel,
  phoneDestinationLabel,
  copyHint,
  setCopyHint,
  copyBufferRef,
  copyPhoneNamesToMac,
  sendMacNames,
  expandEmptyPhoneColumnOpen,
  loadColumnFiles,
  navigateToDirectory,
  navigateUp,
  selectAll,
  selectAllMac,
  clearSelection,
  performDelete,
  beginRename,
  cancelRename,
  exitSearchMode,
  copyPhoneSelectionToMac,
  copyMacSelectionToPhone,
  cancelTransferFlowFromKeyboard,
  previewFileByName,
  handlePreviewNavigation,
  handleOpenSyncDialog,
  handleCloseSyncDialog,
  getDisplayFiles,
}: UseKeyboardShortcutsArgs) {
  // Keep latest values for the document listener without rebinding every keystroke.
  const argsRef = useRef({
    selectedDevice,
    currentPath,
    newFolderDialog,
    loading,
    showHiddenFiles,
    thumbnailsEnabled,
    settingsOpen,
    selectedFiles,
    showDeleteConfirm,
    deleting,
    showPreview,
    previewLoading,
    searchMode,
    uploading,
    macSelected,
    macPath,
    activePane,
    conflictPrompt,
    transferFlowBusy,
    downloadOptionsOpen,
    viewMode,
    iconSize,
    iconSizeMax,
    columnPath,
    columnFiles,
    columnSelected,
    activeColumnIndex,
    focusedIndex,
    showShortcutsHelp,
    tutorialOpen,
    renamingIndex,
    syncDialogOpen,
    syncPreviewing,
    syncing,
    fileMenu,
    copyHint,
  });
  argsRef.current = {
    selectedDevice,
    currentPath,
    newFolderDialog,
    loading,
    showHiddenFiles,
    thumbnailsEnabled,
    settingsOpen,
    selectedFiles,
    showDeleteConfirm,
    deleting,
    showPreview,
    previewLoading,
    searchMode,
    uploading,
    macSelected,
    macPath,
    activePane,
    conflictPrompt,
    transferFlowBusy,
    downloadOptionsOpen,
    viewMode,
    iconSize,
    iconSizeMax,
    columnPath,
    columnFiles,
    columnSelected,
    activeColumnIndex,
    focusedIndex,
    showShortcutsHelp,
    tutorialOpen,
    renamingIndex,
    syncDialogOpen,
    syncPreviewing,
    syncing,
    fileMenu,
    copyHint,
  };

  useEffect(() => {
    /**
     * Cmd+. is macOS cancel. In this WKWebView it leaves fullscreen and the
     * web view stops receiving keys until a click lands in the file list.
     * Capture + preventDefault keeps the shortcut from reaching AppKit.
     * Focus is put back on the active pane in case the key still blurs it.
     */
    const swallowCancelChord = (e: KeyboardEvent) => {
      const isPeriod = e.key === "." || e.code === "Period";
      if (!isPeriod || e.altKey || e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const pane = document.querySelector(
        argsRef.current.activePane === "mac" ? ".mac-pane" : ".phone-pane",
      );
      if (pane instanceof HTMLElement) {
        if (!pane.hasAttribute("tabindex")) pane.tabIndex = -1;
        pane.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", swallowCancelChord, true);
    return () => window.removeEventListener("keydown", swallowCancelChord, true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = argsRef.current;
      const isTyping =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA";

      // Includes the first-run tour, which only handles a few keys itself.
      const isModalOpen = anyModalOpen(s);

      if (s.transferFlowBusy || s.conflictPrompt) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelTransferFlowFromKeyboard();
        }
        return;
      }

      const isPreviewNavKey =
        s.showPreview &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key);

      if (s.showDeleteConfirm && e.key === "Enter") {
        e.preventDefault();
        if (!s.deleting) {
          void performDelete();
        }
        return;
      }

      if (isModalOpen && e.key !== "Escape" && !isPreviewNavKey) {
        return;
      }

      // Ctrl/Cmd + /: Show keyboard shortcuts (key or code — layouts vary)
      if (isShortcutsHelpChord(e)) {
        e.preventDefault();
        setShowShortcutsHelp(true);
        return;
      }

      // Ctrl/Cmd + ,: Open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // Ctrl+Tab: switch active pane (not Cmd+Tab — that is the OS app switcher)
      if (e.ctrlKey && !e.metaKey && e.key === "Tab") {
        e.preventDefault();
        setActivePane((prev) => (prev === "phone" ? "mac" : "phone"));
        return;
      }

      // Cmd+[ / Cmd+]: back / forward on the active pane (no Shift — avoid browser tab chords)
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "[" || e.code === "BracketLeft")
      ) {
        e.preventDefault();
        if (s.activePane === "mac") macHistoryBack();
        else phoneHistoryBack();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        (e.key === "]" || e.code === "BracketRight")
      ) {
        e.preventDefault();
        if (s.activePane === "mac") macHistoryForward();
        else phoneHistoryForward();
        return;
      }

      // Ctrl+Return: context menu for the focused/selected item on the active pane
      if (e.ctrlKey && !e.metaKey && e.key === "Enter") {
        e.preventDefault();
        openContextMenuForActivePane(s);
        return;
      }

      // Cmd+Return: rename on Phone (Return alone opens a folder)
      if (
        !isTyping &&
        e.metaKey &&
        !e.ctrlKey &&
        e.key === "Enter" &&
        s.activePane === "phone"
      ) {
        e.preventDefault();
        renameFocusedPhoneItem(s);
        return;
      }

      // Cmd+C / Cmd+V — in-app copy buffer (leave system clipboard alone while typing)
      if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        handleCopyChord(s);
        return;
      }
      if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        void handlePasteChord(s);
        return;
      }

      // Cmd+1/2/3: view mode on the active pane
      if ((e.ctrlKey || e.metaKey) && e.key === "1") {
        e.preventDefault();
        if (s.activePane === "mac") macPaneHandleRef.current?.setViewMode("table");
        else setViewMode("table");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "2") {
        e.preventDefault();
        if (s.activePane === "mac") macPaneHandleRef.current?.setViewMode("grid");
        else setViewMode("grid");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "3") {
        e.preventDefault();
        if (s.activePane === "mac") macPaneHandleRef.current?.setViewMode("column");
        else setViewMode("column");
        return;
      }

      // Cmd+F: focus filter/search on the active pane
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        if (s.activePane === "mac") macPaneHandleRef.current?.focusFilterInput();
        else searchInputRef.current?.focus();
        return;
      }

      // Cmd+A: select all on the active pane
      if (!isTyping && (e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        if (s.activePane === "mac") selectAllMac();
        else if (!s.searchMode) selectAll();
        return;
      }

      /**
       * Parent folder: Delete / Backspace without Cmd. Replaces Cmd+↑ so arrow
       * chords stay for list/grid/columns only. On Mac the keycap “Delete”
       * usually sends Backspace.
       */
      if (
        !isTyping &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.key === "Delete" || e.key === "Backspace")
      ) {
        e.preventDefault();
        if (s.activePane === "mac") macPaneHandleRef.current?.navigateParent();
        else navigateUp();
        return;
      }

      // Cmd+=/−: zoom icons on the active pane’s Icons view. The ceiling is
      // xlarge until thumbnails are on; then it follows the pane size.
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        if (s.activePane === "mac") {
          const mac = macPaneHandleRef.current;
          if (mac?.getViewMode() === "grid") {
            e.preventDefault();
            mac.setIconSize(nextIconSize(mac.getIconSize(), s.iconSizeMax));
          }
          return;
        }
        if (s.viewMode === "grid") {
          e.preventDefault();
          setIconSize(nextIconSize(s.iconSize, s.iconSizeMax));
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        if (s.activePane === "mac") {
          const mac = macPaneHandleRef.current;
          if (mac?.getViewMode() === "grid") {
            e.preventDefault();
            mac.setIconSize(prevIconSize(mac.getIconSize()));
          }
          return;
        }
        if (s.viewMode === "grid") {
          e.preventDefault();
          setIconSize(prevIconSize(s.iconSize));
        }
        return;
      }

      // App-wide toggles
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ".") {
        e.preventDefault();
        setShowHiddenFiles(!s.showHiddenFiles);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        setThumbnailsEnabled(!s.thumbnailsEnabled);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        if (s.selectedDevice) handleOpenSyncDialog();
        return;
      }

      // Space — Phone preview only (This Mac has no preview)
      if (!isTyping && e.key === " " && s.activePane === "phone") {
        e.preventDefault();
        if (s.showPreview) {
          setShowPreview(false);
        } else if (s.focusedIndex >= 0 && s.focusedIndex < getDisplayFiles().length) {
          const file = getDisplayFiles()[s.focusedIndex];
          if (file && !file.is_directory) {
            setSelectedFiles(new Set([file.name]));
            void previewFileByName(file.name);
          }
        }
        return;
      }

      if (
        !isTyping &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        e.preventDefault();
        if (s.activePane === "mac") {
          macPaneHandleRef.current?.navigateArrow(
            e.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
            e.shiftKey,
          );
          return;
        }
        handlePhoneArrow(e, s);
        return;
      }

      /**
       * Cmd+Delete does not delete on the phone, so a slip does not remove
       * files; delete stays on the menu and the selection strip.
       */

      // Cmd+D: copy the active pane’s selection into the open folder on the other side
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        if (s.activePane === "phone" && s.selectedFiles.size > 0) {
          copyPhoneSelectionToMac();
        } else if (s.activePane === "mac" && s.macSelected.size > 0) {
          copyMacSelectionToPhone();
        }
        return;
      }

      // Return: open the focused folder on the active pane (List, Icons, or Columns)
      if (!isTyping && !s.loading && e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (s.activePane === "mac") {
          macPaneHandleRef.current?.openFocusedFolder();
          return;
        }
        openFocusedPhoneFolder(s);
        return;
      }

      if (e.key === "Escape") {
        /**
         * Without preventDefault, macOS / WKWebView still treats Escape as leave
         * fullscreen (maximized window shrinks) even when a dialog was meant to
         * close. Consume Escape whenever we dismiss UI; a later Escape with
         * nothing open can still leave fullscreen.
         */
        const dismissOverlay = () => {
          e.preventDefault();
          e.stopPropagation();
        };
        // Dialogs before the Cmd+C tip so Escape closes help / settings first.
        if (s.tutorialOpen) {
          dismissOverlay();
          closeTutorial(true);
        } else if (s.fileMenu) {
          dismissOverlay();
          setFileMenu(null);
        } else if (s.downloadOptionsOpen) {
          dismissOverlay();
          setDownloadOptionsOpen(false);
        } else if (s.syncDialogOpen) {
          dismissOverlay();
          handleCloseSyncDialog();
        } else if (s.settingsOpen) {
          dismissOverlay();
          setSettingsOpen(false);
        } else if (s.renamingIndex >= 0) {
          dismissOverlay();
          cancelRename();
        } else if (s.showShortcutsHelp) {
          dismissOverlay();
          setShowShortcutsHelp(false);
        } else if (s.newFolderDialog) {
          dismissOverlay();
          setNewFolderDialog(null);
        } else if (s.showDeleteConfirm) {
          dismissOverlay();
          setShowDeleteConfirm(false);
        } else if (s.showPreview) {
          dismissOverlay();
          setShowPreview(false);
          setPreviewData(null);
          setError("");
        } else if (s.copyHint) {
          dismissOverlay();
          setCopyHint("");
        } else if (isTyping) {
          /**
           * Filter / search fields used to fall through so Escape left
           * fullscreen. Blur the field and put focus back on the file pane.
           */
          dismissOverlay();
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
          const paneSel =
            s.activePane === "mac" ? ".mac-pane.is-active" : ".phone-pane.is-active";
          const pane = document.querySelector(paneSel);
          if (pane instanceof HTMLElement) {
            if (!pane.hasAttribute("tabindex")) pane.tabIndex = -1;
            pane.focus({ preventScroll: true });
          }
        } else if (s.searchMode) {
          dismissOverlay();
          exitSearchMode();
        } else if (s.selectedFiles.size > 0 || s.macSelected.size > 0) {
          dismissOverlay();
          clearSelection();
        } else if (s.focusedIndex >= 0) {
          dismissOverlay();
          setFocusedIndex(-1);
        }
      }
    };

    function handleCopyChord(s: typeof argsRef.current) {
      const side = s.activePane;
      const names =
        side === "phone"
          ? Array.from(s.selectedFiles)
          : Array.from(s.macSelected);
      if (names.length === 0) {
        setCopyHint("Select a file or folder, then press ⌘C.");
        return;
      }
      const path = side === "phone" ? s.currentPath : s.macPath;
      if (!path) {
        setCopyHint("Open a folder, then press ⌘C.");
        return;
      }
      copyBufferRef.current = { side, path, names };
      const otherLabel =
        side === "phone" ? macDestinationLabel() : phoneDestinationLabel();
      const otherSide = side === "phone" ? "This Mac" : "Phone";
      const pronoun = names.length === 1 ? "it" : "them";
      setCopyHint(
        `${itemCountLabel(names.length)} ready to copy. On ${otherSide}, press ⌘V to put ${pronoun} in ${otherLabel}.`,
      );
    }

    async function handlePasteChord(s: typeof argsRef.current) {
      const buf = copyBufferRef.current;
      if (!buf || buf.names.length === 0) {
        setCopyHint("Press ⌘C on a selection first, then ⌘V on the other side.");
        return;
      }
      if (s.activePane === buf.side) {
        const other = buf.side === "phone" ? "This Mac" : "Phone";
        const from = buf.side === "phone" ? "Phone" : "This Mac";
        setCopyHint(
          `You copied from ${from}. Press ⌘V on ${other} to copy into the folder open there.`,
        );
        return;
      }
      if (buf.side === "phone") {
        if (buf.path !== s.currentPath) {
          setCopyHint(
            "Those files are no longer in the open phone folder. Press ⌘C again from that folder.",
          );
          return;
        }
        setCopyHint("");
        await copyPhoneNamesToMac(buf.names);
        return;
      }
      if (buf.path !== s.macPath) {
        setCopyHint(
          "Those files are no longer in the open This Mac folder. Press ⌘C again from that folder.",
        );
        return;
      }
      setCopyHint("");
      await sendMacNames(buf.names);
    }

    function menuPointForEntry(
      root: HTMLElement | null,
      name: string,
    ): { x: number; y: number } {
      const paneRect = root?.getBoundingClientRect();
      const fallback = {
        x: (paneRect?.left ?? 40) + 40,
        y: (paneRect?.top ?? 80) + 80,
      };
      if (!root || !name) return fallback;
      const row = root.querySelector(
        `[data-entry-name="${CSS.escape(name)}"]`,
      ) as HTMLElement | null;
      if (!row) return fallback;
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
      const rect = row.getBoundingClientRect();
      return {
        x: rect.left + Math.min(24, rect.width / 2),
        y: rect.top + Math.min(12, rect.height / 2),
      };
    }

    function phoneColumnFocusedEntry(
      s: typeof argsRef.current,
    ): FileEntry | null {
      if (s.activeColumnIndex < 0 || s.activeColumnIndex >= s.columnPath.length) {
        return null;
      }
      const path = s.columnPath[s.activeColumnIndex]!;
      const visible = visibleColumnEntries(
        s.columnFiles.get(path) || [],
        s.showHiddenFiles,
      );
      const idx = s.columnSelected.get(path) ?? -1;
      if (idx < 0 || idx >= visible.length) return null;
      return visible[idx] ?? null;
    }

    function openContextMenuForActivePane(s: typeof argsRef.current) {
      if (s.activePane === "mac") {
        const target = macPaneHandleRef.current?.getContextMenuTarget();
        if (target) {
          openFileMenuAt("mac", target.x, target.y, target.name, target.isDirectory);
          return;
        }
        const root = document.querySelector(".mac-pane") as HTMLElement | null;
        const point = menuPointForEntry(root, "");
        openFileMenuAt("mac", point.x, point.y, "", true);
        return;
      }

      const display = getDisplayFiles();
      let name = "";
      let isDirectory = true;
      if (s.viewMode === "column") {
        const focused = phoneColumnFocusedEntry(s);
        if (focused) {
          name = focused.name;
          isDirectory = focused.is_directory;
        } else if (s.selectedFiles.size > 0) {
          name = Array.from(s.selectedFiles)[0]!;
          const hit =
            display.find((f) => f.name === name) ||
            Array.from(s.columnFiles.values())
              .flat()
              .find((f) => f.name === name);
          isDirectory = hit?.is_directory ?? false;
        }
      } else if (
        s.focusedIndex >= 0 &&
        s.focusedIndex < display.length
      ) {
        const file = display[s.focusedIndex]!;
        name = file.name;
        isDirectory = file.is_directory;
      } else if (s.selectedFiles.size > 0) {
        name = Array.from(s.selectedFiles)[0]!;
        const hit = display.find((f) => f.name === name);
        isDirectory = hit?.is_directory ?? false;
      }

      const root = phonePaneRef.current;
      if (!name) {
        const point = menuPointForEntry(root, "");
        openFileMenuAt("phone", point.x, point.y, "", true);
        return;
      }
      const point = menuPointForEntry(root, name);
      openFileMenuAt("phone", point.x, point.y, name, isDirectory);
    }

    function openFocusedPhoneFolder(s: typeof argsRef.current) {
      if (s.viewMode === "column") {
        const focused = phoneColumnFocusedEntry(s);
        if (focused?.is_directory) navigateToDirectory(focused.name);
        return;
      }
      const display = getDisplayFiles();
      // Prefer the single selection so a stale focus index cannot open a
      // different row than the highlighted selection after going up.
      if (s.selectedFiles.size === 1) {
        const name = Array.from(s.selectedFiles)[0]!;
        const selected = display.find((f) => f.name === name);
        if (selected?.is_directory) {
          navigateToDirectory(selected.name);
          return;
        }
      }
      if (s.focusedIndex < 0 || s.focusedIndex >= display.length) return;
      const file = display[s.focusedIndex];
      if (file?.is_directory) navigateToDirectory(file.name);
    }

    function renameFocusedPhoneItem(s: typeof argsRef.current) {
      if (s.viewMode === "column") {
        const focused = phoneColumnFocusedEntry(s);
        if (focused) beginRename(focused.name);
        return;
      }
      if (s.focusedIndex < 0 || s.focusedIndex >= getDisplayFiles().length) return;
      const file = getDisplayFiles()[s.focusedIndex];
      if (file) beginRename(file.name);
    }

    function handlePhoneArrow(
      e: KeyboardEvent,
      s: typeof argsRef.current,
    ) {
      if (s.showPreview && !e.shiftKey) {
        void handlePreviewNavigation(e.key);
        return;
      }

      if (s.viewMode === "column") {
        /**
         * Columns match Finder-style Miller keys: ↑↓ move the highlight only so
         * you can pick any folder; → opens that folder (or steps into a column
         * already open); ← goes back a column. Up/down used to open on every
         * folder highlight and forced the first child.
         */
        if (e.key === "ArrowLeft") {
          if (s.activeColumnIndex > 0) {
            const newActiveIndex = s.activeColumnIndex - 1;
            const parentPath = s.columnPath[newActiveIndex]!;
            const leavingPath = s.columnPath[s.activeColumnIndex]!;
            const parentListing = s.columnFiles.get(parentPath) || [];
            const visibleParent = visibleColumnEntries(
              parentListing,
              s.showHiddenFiles,
            );
            let row = s.columnSelected.get(parentPath) ?? -1;
            if (row < 0 || !visibleParent[row]) {
              const childName = basenameSegment(leavingPath);
              row = visibleParent.findIndex((file) => file.name === childName);
            }
            const nextSelected = new Map(s.columnSelected);
            if (row >= 0) nextSelected.set(parentPath, row);
            setColumnSelected(nextSelected);
            setActiveColumnIndex(newActiveIndex);
            setCurrentPath(parentPath);
            const newPaths = s.columnPath.slice(0, newActiveIndex + 1);
            if (newPaths.length !== s.columnPath.length) {
              setColumnPath(newPaths);
            }
            const highlight = row >= 0 ? visibleParent[row] : undefined;
            if (highlight) {
              setSelectedFiles(new Set([highlight.name]));
              setFocusedIndex(row);
            }
            focusPhoneColumn(
              newActiveIndex,
              row >= 0 ? row : undefined,
              "smooth",
            );
          }
        } else if (e.key === "ArrowRight") {
          if (s.activeColumnIndex < 0 || s.activeColumnIndex >= s.columnPath.length) {
            return;
          }
          const path = s.columnPath[s.activeColumnIndex]!;
          const files = s.columnFiles.get(path) || [];
          const visibleFiles = visibleColumnEntries(files, s.showHiddenFiles);
          const currentSelected = s.columnSelected.get(path) ?? -1;
          const selectedFile =
            currentSelected >= 0 ? visibleFiles[currentSelected] : undefined;

          if (s.activeColumnIndex < s.columnPath.length - 1) {
            const childPath = s.columnPath[s.activeColumnIndex + 1]!;
            const matchesHighlight =
              selectedFile?.is_directory &&
              joinColumnPath(path, selectedFile.name) === childPath;
            if (matchesHighlight || !selectedFile?.is_directory) {
              const newActiveIndex = s.activeColumnIndex + 1;
              setActiveColumnIndex(newActiveIndex);
              setCurrentPath(childPath);
              if (currentSelected >= 0) {
                focusPhoneColumn(
                  s.activeColumnIndex,
                  currentSelected,
                  "instant",
                  false,
                );
              }
              focusPhoneColumn(newActiveIndex, undefined, "smooth");
              return;
            }
          }

          if (!selectedFile?.is_directory) return;

          const selectedPath = joinColumnPath(path, selectedFile.name);
          const prefix = s.columnPath.slice(0, s.activeColumnIndex + 1);
          const highlightIndex = currentSelected;
          void loadColumnFiles(selectedPath).then(async (fileList) => {
            const expanded = await expandEmptyPhoneColumnOpen(
              selectedPath,
              fileList,
            );
            const mergedFiles = new Map(s.columnFiles);
            for (const [dir, listed] of expanded.filesByPath) {
              mergedFiles.set(dir, listed);
            }
            const newPaths = collapseEmptyIntermediatePaths(
              [...prefix, ...expanded.chainPaths],
              mergedFiles,
              expanded.openPath,
              s.showHiddenFiles,
            );
            const keptFiles = new Map<string, FileEntry[]>();
            for (const dir of newPaths) {
              const listed = mergedFiles.get(dir);
              if (listed) keptFiles.set(dir, listed);
            }
            const newColumnSelected = new Map<string, number>();
            for (const dir of prefix) {
              const existingSelection = s.columnSelected.get(dir);
              if (existingSelection !== undefined) {
                newColumnSelected.set(dir, existingSelection);
              }
            }
            newColumnSelected.set(path, highlightIndex);
            for (let i = 0; i < newPaths.length - 1; i++) {
              const dir = newPaths[i]!;
              if (newColumnSelected.has(dir)) continue;
              const nextName = basenameSegment(newPaths[i + 1]!);
              const visible = visibleColumnEntries(
                keptFiles.get(dir) || [],
                s.showHiddenFiles,
              );
              const idx = visible.findIndex((entry) => entry.name === nextName);
              if (idx >= 0) newColumnSelected.set(dir, idx);
            }
            setColumnFiles(keptFiles);
            setColumnPath(newPaths);
            setColumnSelected(newColumnSelected);
            setCurrentPath(expanded.openPath);
            if (highlightIndex >= 0) {
              focusPhoneColumn(
                s.activeColumnIndex,
                highlightIndex,
                "instant",
                false,
              );
            }
            focusPhoneColumn(newPaths.length - 1, undefined, "smooth");
          });
        } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          if (s.activeColumnIndex < 0 || s.activeColumnIndex >= s.columnPath.length) {
            return;
          }
          const path = s.columnPath[s.activeColumnIndex]!;
          const files = s.columnFiles.get(path) || [];
          const visibleFiles = visibleColumnEntries(files, s.showHiddenFiles);
          if (visibleFiles.length === 0) return;

          const currentSelected = s.columnSelected.get(path) ?? -1;
          let newSelected = currentSelected;
          if (currentSelected < 0) newSelected = 0;
          else if (e.key === "ArrowUp") {
            newSelected =
              currentSelected <= 0 ? visibleFiles.length - 1 : currentSelected - 1;
          } else {
            newSelected =
              currentSelected >= visibleFiles.length - 1 ? 0 : currentSelected + 1;
          }

          const highlight = visibleFiles[newSelected];
          const newPaths = s.columnPath.slice(0, s.activeColumnIndex + 1);
          const newColumnSelected = new Map(s.columnSelected);
          newColumnSelected.set(path, newSelected);
          setColumnSelected(newColumnSelected);
          if (newPaths.length !== s.columnPath.length) {
            setColumnPath(newPaths);
          }
          // Do not change the open path on ↑↓. That re-ran column sync and
          // scrolled the Open column off-screen on the first highlight.
          // Arrows select the highlight so Cmd+C / Cmd+D work without a mouse click.
          if (highlight) {
            if (e.shiftKey) {
              setSelectedFiles(new Set([...s.selectedFiles, highlight.name]));
            } else {
              setSelectedFiles(new Set([highlight.name]));
            }
          }
          // Vertical only — horizontal scroll on ↑↓ shoved Open off-screen.
          focusPhoneColumn(s.activeColumnIndex, newSelected, "smooth", false);
        }
        return;
      }

      const displayFiles = getDisplayFiles();
      if (displayFiles.length === 0) return;

      /**
       * Arrow keys move focus and select that row (Finder-style) so copy/paste
       * shortcuts work without a mouse click. Shift+Arrow extends the selection.
       */
      if (e.shiftKey) {
        if (s.focusedIndex < 0) {
          setFocusedIndex(0);
          const file = displayFiles[0]!;
          setSelectedFiles(new Set([...s.selectedFiles, file.name]));
          setTimeout(() => {
            const el = phonePaneRef.current?.querySelector(
              ".file-row.focused, .grid-item.focused",
            );
            el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }, 0);
          return;
        }
        const currentFile = displayFiles[s.focusedIndex]!;
        let updatedSelection = new Set(s.selectedFiles);
        updatedSelection.add(currentFile.name);
        let newIndex = s.focusedIndex;
        if (s.viewMode === "table") {
          if (e.key === "ArrowUp") newIndex = Math.max(0, s.focusedIndex - 1);
          else if (e.key === "ArrowDown") {
            newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + 1);
          }
        } else {
          const cols = calculateGridColumns(phonePaneRef.current);
          if (e.key === "ArrowUp") newIndex = Math.max(0, s.focusedIndex - cols);
          else if (e.key === "ArrowDown") {
            newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + cols);
          } else if (e.key === "ArrowLeft") {
            newIndex = Math.max(0, s.focusedIndex - 1);
          } else if (e.key === "ArrowRight") {
            newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + 1);
          }
        }
        setFocusedIndex(newIndex);
        updatedSelection.add(displayFiles[newIndex]!.name);
        setSelectedFiles(updatedSelection);
        setTimeout(() => {
          const el = phonePaneRef.current?.querySelector(
            ".file-row.focused, .grid-item.focused",
          );
          el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 0);
        return;
      }

      if (s.focusedIndex < 0) {
        setFocusedIndex(0);
        setSelectedFiles(new Set([displayFiles[0]!.name]));
        setTimeout(() => {
          const el = phonePaneRef.current?.querySelector(
            ".file-row.focused, .grid-item.focused",
          );
          el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }, 0);
        return;
      }

      let newIndex = s.focusedIndex;
      if (s.viewMode === "table") {
        if (e.key === "ArrowUp") newIndex = Math.max(0, s.focusedIndex - 1);
        else if (e.key === "ArrowDown") {
          newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + 1);
        }
      } else {
        const cols = calculateGridColumns(phonePaneRef.current);
        if (e.key === "ArrowUp") newIndex = Math.max(0, s.focusedIndex - cols);
        else if (e.key === "ArrowDown") {
          newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + cols);
        } else if (e.key === "ArrowLeft") {
          newIndex = Math.max(0, s.focusedIndex - 1);
        } else if (e.key === "ArrowRight") {
          newIndex = Math.min(displayFiles.length - 1, s.focusedIndex + 1);
        }
      }
      setFocusedIndex(newIndex);
      setSelectedFiles(new Set([displayFiles[newIndex]!.name]));
      setTimeout(() => {
        const el = phonePaneRef.current?.querySelector(
          ".file-row.focused, .grid-item.focused",
        );
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 0);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    cancelTransferFlowFromKeyboard,
    performDelete,
    setShowShortcutsHelp,
    setSettingsOpen,
    setActivePane,
    macHistoryBack,
    macHistoryForward,
    phoneHistoryBack,
    phoneHistoryForward,
    openFileMenuAt,
    copyBufferRef,
    setCopyHint,
    macDestinationLabel,
    phoneDestinationLabel,
    copyPhoneNamesToMac,
    sendMacNames,
    macPaneHandleRef,
    searchInputRef,
    selectAllMac,
    selectAll,
    navigateUp,
    getDisplayFiles,
    navigateToDirectory,
    setViewMode,
    setIconSize,
    setShowHiddenFiles,
    setThumbnailsEnabled,
    handleOpenSyncDialog,
    setShowPreview,
    setSelectedFiles,
    previewFileByName,
    setShowDeleteConfirm,
    copyPhoneSelectionToMac,
    copyMacSelectionToPhone,
    beginRename,
    closeTutorial,
    setFileMenu,
    setDownloadOptionsOpen,
    handleCloseSyncDialog,
    cancelRename,
    setNewFolderDialog,
    setPreviewData,
    setError,
    exitSearchMode,
    clearSelection,
    setFocusedIndex,
    handlePreviewNavigation,
    setActiveColumnIndex,
    setCurrentPath,
    setColumnPath,
    focusPhoneColumn,
    loadColumnFiles,
    expandEmptyPhoneColumnOpen,
    setColumnFiles,
    setColumnSelected,
    phonePaneRef,
  ]);
}
