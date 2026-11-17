/**
 * This Mac folder: path, listing, permission errors, selection, back/forward,
 * and the storage meter. The phone pane is separate. Selecting here clears
 * the phone selection in the shell, which can see both sides.
 */
import { RefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { type StorageInfo } from "../../components/explorer/StatusBar";
import { type FileEntry } from "../../lib/file-types";
import {
  type FolderHistory,
  descendantSegmentUnderAncestor,
  pushFolderHistory,
} from "../../lib/folderHistory";
import { invoke } from "@tauri-apps/api/core";
import { type MacPaneHandle } from "../../components/explorer/MacPane";

export interface UseMacExplorerArgs {
  showHiddenFiles: boolean;
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  snapshotSelectionForContextMenu: (side: "phone" | "mac", event: React.MouseEvent) => void;
  paneCanvasIgnoreSelector: ".file-row, .grid-item, .column-item, button, input, select, textarea, a, .phone-menu-panel, .selection-action-strip, th.sortable";
}

export function useMacExplorer({
  showHiddenFiles,
  setActivePane,
  macPaneHandleRef,
  snapshotSelectionForContextMenu,
  paneCanvasIgnoreSelector,
}: UseMacExplorerArgs) {
  const [macStorageInfo, setMacStorageInfo] = useState<StorageInfo | null>(null);
  // Dual-pane is the product (phone | Mac). Last successful folder is remembered; macOS
  // may still require Grant access (system folder picker) after an upgrade if that path
  // is not allowed yet. Does not offer Hide This Mac in the everyday UI.
  const [macPath, setMacPath] = useState(() => localStorage.getItem("droiddock-mac-path") || "");
  const [macFiles, setMacFiles] = useState<FileEntry[]>([]);
  const [macLoading, setMacLoading] = useState(false);
  const [macError, setMacError] = useState("");
  const [macPermissionDenied, setMacPermissionDenied] = useState(false);
  const [macSelected, setMacSelected] = useState<Set<string>>(new Set());
  const [macLastSelectedIndex, setMacLastSelectedIndex] = useState(-1);
  const [macLastSelectionRangeId, setMacLastSelectionRangeId] = useState("list");
  /**
   * Mac Columns/search rows are not always in `macFiles`; MacPane pushes resolved
   * entries here so status Selected can show size with count.
   */
  const [macSelectionEntries, setMacSelectionEntries] = useState<FileEntry[]>([]);

  /** Skip identical pushes so MacPane’s effect does not loop on new arrays. */
  function handleMacSelectionEntries(entries: FileEntry[]) {
    setMacSelectionEntries((prev) => {
      if (
        prev.length === entries.length &&
        prev.every(
          (entry, index) =>
            entry.name === entries[index]!.name &&
            entry.size === entries[index]!.size &&
            entry.is_directory === entries[index]!.is_directory,
        )
      ) {
        return prev;
      }
      return entries;
    });
  }
  const [macRefresh, setMacRefresh] = useState(0);
  const [macHistory, setMacHistory] = useState<FolderHistory>({ stack: [], index: -1 });
  const skipMacHistory = useRef(false);

  /** Last Mac path we listed — distinguishes navigate vs same-folder refresh. */
  const macListedPathRef = useRef<string | null>(null);
  /**
   * After Delete / history back / breadcrumb to a parent, re-select the folder
   * we just left so focus can land on that row (MacPane syncs the keyboard ring).
   */
  const pendingRestoreNameRef = useRef<string | null>(null);
  const previousMacPathRef = useRef(macPath);
  /** Breadcrumb jumps leave the folder they came from unselected (see phone). */
  const macBreadcrumbNavRef = useRef(false);
  const macRestoreSelectsRef = useRef(true);

  useEffect(() => {
    const prev = previousMacPathRef.current;
    previousMacPathRef.current = macPath;
    pendingRestoreNameRef.current = descendantSegmentUnderAncestor(prev, macPath);
    macRestoreSelectsRef.current = !macBreadcrumbNavRef.current;
    macBreadcrumbNavRef.current = false;
    // Drop the previous folder’s picks immediately. Waiting for the listing left
    // a parent selection (and MacPane focus sync) stuck inside the child.
    setMacSelected(new Set());
    setMacLastSelectedIndex(-1);
  }, [macPath]);

  /**
   * Defaulting to ~/Downloads without an Open-panel grant hits macOS TCC (“Operation
   * not permitted”). Prefer a listable start folder; when listing fails with
   * PERMISSION_DENIED, show Allow access instead of a raw os error.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let path = macPath;
      if (!path) {
        path = await invoke<string>("default_mac_folder");
        if (cancelled) return;
        setMacPath(path);
        return;
      }
      setMacLoading(true);
      try {
        const listed = await invoke<FileEntry[]>("list_local_directory", {
          path,
          showHidden: showHiddenFiles,
        });
        if (!cancelled) {
          const pathChanged = macListedPathRef.current !== path;
          macListedPathRef.current = path;
          setMacFiles(listed);
          setMacError("");
          setMacPermissionDenied(false);
          // New folder → restore the child we left, or clear. Same-folder refresh
          // keeps names still present.
          if (pathChanged) {
            const restoreName = pendingRestoreNameRef.current;
            pendingRestoreNameRef.current = null;
            if (
              restoreName &&
              macRestoreSelectsRef.current &&
              listed.some((file) => file.name === restoreName)
            ) {
              setMacSelected(new Set([restoreName]));
              // Display order may differ from the raw listing; MacPane sets the
              // keyboard ring by name. Reset the Shift-click anchor.
              setMacLastSelectedIndex(-1);
            } else {
              setMacSelected(new Set());
              setMacLastSelectedIndex(-1);
            }
          } else {
            setMacSelected((prev) => {
              if (prev.size === 0) return prev;
              const names = new Set(listed.map((file) => file.name));
              let changed = false;
              const next = new Set<string>();
              for (const name of prev) {
                if (names.has(name)) next.add(name);
                else changed = true;
              }
              return changed ? next : prev;
            });
          }
          localStorage.setItem("droiddock-mac-path", path);
        }
      } catch (err) {
        if (!cancelled) {
          /**
           * Some macOS TCC failures arrived without the PERMISSION_DENIED prefix (or as
           * a misleading “Not a folder”), so double-click into Documents children
           * looked empty instead of showing Grant access.
           */
          const raw = String(err);
          const denied =
            raw.includes("PERMISSION_DENIED:") ||
            raw.includes("Operation not permitted") ||
            /\bos error 1\b/i.test(raw);
          setMacPermissionDenied(denied);
          setMacError(
            denied
              ? raw.replace(/^PERMISSION_DENIED:/, "").replace(/^Error:\s*/i, "")
              : raw,
          );
          setMacFiles([]);
        }
      } finally {
        if (!cancelled) setMacLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [macPath, showHiddenFiles, macRefresh]);

  useEffect(() => {
    if (!macPath) return;
    if (skipMacHistory.current) {
      skipMacHistory.current = false;
      return;
    }
    setMacHistory((prev) => pushFolderHistory(prev, macPath));
  }, [macPath]);

  function macHistoryBack() {
    if (macHistory.index <= 0) return;
    const index = macHistory.index - 1;
    skipMacHistory.current = true;
    setMacHistory({ ...macHistory, index });
    setMacPath(macHistory.stack[index]);
  }

  function macHistoryForward() {
    if (macHistory.index < 0 || macHistory.index >= macHistory.stack.length - 1) return;
    const index = macHistory.index + 1;
    skipMacHistory.current = true;
    setMacHistory({ ...macHistory, index });
    setMacPath(macHistory.stack[index]);
  }

  async function chooseMacFolder() {
    try {
      const selected = await invoke<string | null>("pick_mac_folder", {
        startingPath: macPath || null,
      });
      if (!selected) return;
      setMacPath(selected);
      localStorage.setItem("droiddock-mac-path", selected);
      setMacPermissionDenied(false);
      setMacError("");
    } catch (err) {
      setMacError(String(err));
    }
  }

  // Mac volume for the open This Mac folder.
  useEffect(() => {
    if (!macPath) {
      setMacStorageInfo(null);
      return;
    }
    void loadMacStorageInfo(macPath);
  }, [macPath, macRefresh]);

  /**
   * Status bar had phone space only; Mac free space was invisible. Ask Rust for the
   * volume behind `macPath` via get_local_storage_info. Does not keep a stale meter
   * when the path is empty or unreadable.
   */
  async function loadMacStorageInfo(path: string) {
    try {
      const info = await invoke<StorageInfo>("get_local_storage_info", { path });
      setMacStorageInfo(info);
    } catch (err) {
      console.error(`Failed to get Mac storage info: ${err}`);
      setMacStorageInfo(null);
    }
  }

  /**
   * Cmd+A on This Mac must match the filtered/sorted list in MacPane. Asks MacPane for
   * visible names; no-ops during Mac search mode. Does not use the raw macFiles array
   * (that ignores the name filter).
   */
  function selectAllMac() {
    const names = macPaneHandleRef.current?.selectAllVisibleNames();
    if (names == null) return;
    setMacSelected(new Set(names));
  }

  /**
   * Breadcrumb or root click on This Mac. Drops the selection (and the action
   * strip) even when the clicked folder is already open, which changes no path.
   */
  function navigateMacFromCrumb(nextPath: string) {
    setMacSelected(new Set());
    setMacLastSelectedIndex(-1);
    if (nextPath !== macPath) macBreadcrumbNavRef.current = true;
    setMacPath(nextPath);
  }

  /**
   * Shift+arrow on This Mac extends the selection without a click. Marks This
   * Mac active so Cmd+A and paste stay on this side.
   */
  function setMacSelectionFromKeyboard(names: Set<string>) {
    setActivePane("mac");
    setMacSelected(names);
  }

  /**
   * Same empty-canvas deselect as the phone, for This Mac. Activates Mac, snapshots for
   * context menu, clears Mac selection on empty hits. Does not clear phone selection
   * (exclusivity still applies when Mac gains a real selection).
   */
  function handleMacPaneMouseDown(event: React.MouseEvent) {
    snapshotSelectionForContextMenu("mac", event);
    setActivePane("mac");
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(paneCanvasIgnoreSelector)) return;
    if (macSelected.size === 0) return;
    setMacSelected(new Set());
    setMacLastSelectedIndex(-1);
  }

  /**
   * Mac list used a toggle with no Shift/Cmd parity and left phone selection active.
   * Columns/List/Icons must pass the same visible row order used on screen so
   * Shift+click ranges correctly in every view. Same click / Cmd / Shift patterns as
   * the phone; exclusivity effects clear the phone set. `rangeContext` supplies index +
   * rows for that view.
   */
  function handleMacSelect(
    fileName: string,
    event: React.MouseEvent,
    rangeContext?: {
      index: number;
      rangeSource: FileEntry[];
      rangeId?: string;
    },
  ) {
    // macOS Control+click is a right-click; context menu owns selection.
    if (event.ctrlKey && !event.metaKey) return;
    setActivePane("mac");
    const visible =
      rangeContext?.rangeSource ??
      (showHiddenFiles
        ? macFiles
        : macFiles.filter((file) => !file.name.startsWith(".")));
    const index =
      rangeContext?.index ??
      visible.findIndex((file) => file.name === fileName);
    const rangeId = rangeContext?.rangeId ?? "list";

    if (
      event.shiftKey &&
      macLastSelectedIndex !== -1 &&
      index >= 0 &&
      rangeId === macLastSelectionRangeId
    ) {
      const start = Math.min(macLastSelectedIndex, index);
      const end = Math.max(macLastSelectedIndex, index);
      const range = visible.slice(start, end + 1).map((file) => file.name);
      setMacSelected((prev) => {
        const next = new Set(prev);
        range.forEach((name) => next.add(name));
        return next;
      });
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      setMacSelected((prev) => {
        const next = new Set(prev);
        if (next.has(fileName)) next.delete(fileName);
        else next.add(fileName);
        return next;
      });
      if (index >= 0) {
        setMacLastSelectedIndex(index);
        setMacLastSelectionRangeId(rangeId);
      }
      return;
    }

    setMacSelected(new Set([fileName]));
    if (index >= 0) {
      setMacLastSelectedIndex(index);
      setMacLastSelectionRangeId(rangeId);
    }
  }

  return {
    macStorageInfo,
    macPath,
    setMacPath,
    macFiles,
    macLoading,
    macError,
    macPermissionDenied,
    macSelected,
    setMacSelected,
    setMacLastSelectedIndex,
    macSelectionEntries,
    handleMacSelectionEntries,
    macRefresh,
    setMacRefresh,
    macHistory,
    macHistoryBack,
    macHistoryForward,
    chooseMacFolder,
    selectAllMac,
    setMacSelectionFromKeyboard,
    navigateMacFromCrumb,
    handleMacPaneMouseDown,
    handleMacSelect,
  };
}
