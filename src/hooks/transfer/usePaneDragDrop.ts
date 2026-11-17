/**
 * Drag between the panes, and drops from Finder onto the phone. Hover and the
 * copy-or-blocked cursor come from usePaneDropHover. The overlay chip is drawn
 * by the shell from that hover state.
 */
import { RefObject, SetStateAction, useEffect, useRef } from "react";
import { type DragPoint, paneDropAcceptance } from "../../lib/columnViewFocus";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type UploadSource, type ConflictPromptResult, type DropHoverState, type LockedTransferPlan } from "../../types/transfer";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyTransferDragImage, resolveDragItems } from "../../components/transfer/TransferMarksStack";
import { type FileEntry } from "../../lib/file-types";
import { type TransferJob } from "../../components/transfer/TransferPanel";
import { type TransferQueueItem } from "../../lib/transferConflicts";

export interface UsePaneDragDropArgs {
  selectedDevice: string;
  currentPath: string;
  files: FileEntry[];
  setError: (value: SetStateAction<string>) => void;
  selectedFiles: Set<string>;
  transferJobRef: RefObject<TransferJob | null>;
  macPath: string;
  conflictPromptResolver: RefObject<((result: ConflictPromptResult) => void) | null>;
  inAppDragRef: RefObject<{ side: "phone" | "mac"; names: string[]; } | null>;
  finderDragActiveRef: RefObject<boolean>;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  macPaneRef: RefObject<HTMLElement | null>;
  dropLabelsRef: RefObject<{ phone: string; mac: string; }>;
  applyDropHoverRef: RefObject<(point: DragPoint | null) => void>;
  clearDropHoverRef: RefObject<() => void>;
  dropAllowedAtRef: RefObject<(point: DragPoint) => boolean>;
  transferFlowBusyRef: RefObject<boolean>;
  setTransferFlowStatus: (value: SetStateAction<string>) => void;
  columnFiles: Map<string, FileEntry[]>;
  setDropHover: (value: SetStateAction<DropHoverState | null>) => void;
  dropAllowedAt: (point: DragPoint) => boolean;
  applyDropHover: (point: DragPoint | null) => void;
  clearDropHover: () => void;
  confirmFinderDropTip: () => Promise<boolean>;
  planTransfer: (options: { direction: "download" | "upload"; destination: string; errorPrefix: string; buildItems: () => Promise<TransferQueueItem[] | null>; confirmFirst?: () => Promise<boolean>; }) => Promise<LockedTransferPlan | null>;
  runPlannedTransfer: (direction: "download" | "upload", title: string, destination: string, plan: LockedTransferPlan) => Promise<void>;
  copyPhoneNamesToMac: (names: string[]) => Promise<void>;
  buildUploadItems: (sources: UploadSource[]) => Promise<TransferQueueItem[]>;
  sendMacNames: (names: string[]) => Promise<void>;
}

export function usePaneDragDrop({
  selectedDevice,
  currentPath,
  files,
  setError,
  selectedFiles,
  transferJobRef,
  macPath,
  conflictPromptResolver,
  inAppDragRef,
  finderDragActiveRef,
  phonePaneRef,
  macPaneRef,
  dropLabelsRef,
  applyDropHoverRef,
  clearDropHoverRef,
  dropAllowedAtRef,
  transferFlowBusyRef,
  setTransferFlowStatus,
  columnFiles,
  setDropHover,
  dropAllowedAt,
  applyDropHover,
  clearDropHover,
  confirmFinderDropTip,
  planTransfer,
  runPlannedTransfer,
  copyPhoneNamesToMac,
  buildUploadItems,
  sendMacNames,
}: UsePaneDragDropArgs) {
  const inAppDragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const completeInAppPaneDragRef = useRef<
    (
      session: { side: "phone" | "mac"; names: string[] },
      point: { x: number; y: number },
    ) => Promise<void>
  >(async () => {});
  const handleFinderPathsDropRef = useRef<
    (paths: string[], point: DragPoint | null) => Promise<void>
  >(async () => {});

  /**
   * With `dragDropEnabled`, Tauri swallows HTML5 dragover/drop, so overlay + Columns
   * dim/scroll must come from `onDragDropEvent` (window and webview). Finder and in-app
   * either direction — overlay chip, Open-column scroll/dim, Open-column-only drop;
   * dragend fallback for in-app; capture dragover/dragenter that sets dropEffect
   * copy|none so the cursor is plus only on the opposite open folder and stop
   * everywhere else (source pane, chrome, Columns non-Open). Does not retarget
   * destination away from the open folder, or show move/link.
   */
  useEffect(() => {
    let disposed = false;
    const unlistens: Array<() => void> = [];

    const onTauriDragDrop = (payload: {
      type: string;
      paths?: string[];
      position?: { x: number; y: number };
    }) => {
      if (payload.type === "enter" && (payload.paths?.length ?? 0) > 0) {
        finderDragActiveRef.current = true;
        if (payload.position) {
          applyDropHoverRef.current({
            x: payload.position.x,
            y: payload.position.y,
          });
        } else {
          applyDropHoverRef.current({ x: 0, y: 0 });
        }
        return;
      }

      if (payload.type === "leave") {
        if (finderDragActiveRef.current) {
          finderDragActiveRef.current = false;
        }
        clearDropHoverRef.current();
        return;
      }

      if (payload.type === "over" && payload.position) {
        const raw = { x: payload.position.x, y: payload.position.y };
        if (finderDragActiveRef.current || inAppDragRef.current) {
          inAppDragPointerRef.current = raw;
          applyDropHoverRef.current(raw);
        }
        return;
      }

      if (payload.type === "drop" && payload.position) {
        const raw = { x: payload.position.x, y: payload.position.y };
        const finderPaths = payload.paths ?? [];
        if (finderDragActiveRef.current || finderPaths.length > 0) {
          finderDragActiveRef.current = false;
          clearDropHoverRef.current();
          if (finderPaths.length > 0) {
            window.setTimeout(() => {
              void handleFinderPathsDropRef.current(finderPaths, raw);
            }, 0);
          }
          return;
        }

        const session = inAppDragRef.current;
        inAppDragRef.current = null;
        inAppDragPointerRef.current = null;
        clearDropHoverRef.current();
        if (!session) return;
        window.setTimeout(() => {
          void completeInAppPaneDragRef.current(session, raw);
        }, 0);
      }
    };

    const onEvent = (event: { payload: Parameters<typeof onTauriDragDrop>[0] }) => {
      onTauriDragDrop(event.payload);
    };

    // Webview owns dragDropEnabled; fall back to window if webview API fails.
    void getCurrentWebview()
      .onDragDropEvent(onEvent)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistens.push(unlisten);
      })
      .catch(() => {
        void getCurrentWindow()
          .onDragDropEvent(onEvent)
          .then((unlisten) => {
            if (disposed) {
              unlisten();
              return;
            }
            unlistens.push(unlisten);
          })
          .catch(() => {
            /* Dev / non-Tauri: HTML5 dragend only */
          });
      });

    const onDrag = (event: DragEvent) => {
      if (!inAppDragRef.current && !finderDragActiveRef.current) return;
      if (
        (event.clientX !== 0 || event.clientY !== 0) &&
        Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY)
      ) {
        const raw = { x: event.clientX, y: event.clientY };
        inAppDragPointerRef.current = raw;
        applyDropHoverRef.current(raw);
      }
    };
    /**
     * EffectAllowed "copy" alone leaves a plus on the source pane. The OS cursor
     * follows dropEffect on dragover/dragenter — copy only when dropAllowedAt is true;
     * none (stop) otherwise.
     */
    const syncDropEffect = (event: DragEvent) => {
      if (!inAppDragRef.current && !finderDragActiveRef.current) return;
      if (!event.dataTransfer) return;
      event.preventDefault();
      const raw = { x: event.clientX, y: event.clientY };
      if (
        (raw.x !== 0 || raw.y !== 0) &&
        Number.isFinite(raw.x) &&
        Number.isFinite(raw.y)
      ) {
        inAppDragPointerRef.current = raw;
        applyDropHoverRef.current(raw);
        event.dataTransfer.dropEffect = dropAllowedAtRef.current(raw)
          ? "copy"
          : "none";
      } else {
        event.dataTransfer.dropEffect = "none";
      }
    };
    const onDragEnd = (event: DragEvent) => {
      const session = inAppDragRef.current;
      const tracked = inAppDragPointerRef.current;
      inAppDragRef.current = null;
      inAppDragPointerRef.current = null;
      finderDragActiveRef.current = false;
      clearDropHoverRef.current();
      if (!session) return;
      const fromEnd =
        (event.clientX !== 0 || event.clientY !== 0) &&
        Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY)
          ? { x: event.clientX, y: event.clientY }
          : null;
      const point = tracked ?? fromEnd;
      if (!point) return;
      window.setTimeout(() => {
        void completeInAppPaneDragRef.current(session, point);
      }, 0);
    };
    window.addEventListener("drag", onDrag, true);
    window.addEventListener("dragover", syncDropEffect, true);
    window.addEventListener("dragenter", syncDropEffect, true);
    window.addEventListener("dragend", onDragEnd, true);

    return () => {
      disposed = true;
      for (const unlisten of unlistens) unlisten();
      window.removeEventListener("drag", onDrag, true);
      window.removeEventListener("dragover", syncDropEffect, true);
      window.removeEventListener("dragenter", syncDropEffect, true);
      window.removeEventListener("dragend", onDragEnd, true);
      clearDropHoverRef.current();
    };
  }, []);

  // Drag and drop handlers (HTML5 fallback; Tauri usually owns the hover path)
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const point = { x: e.clientX, y: e.clientY };
    applyDropHover(point);
    e.dataTransfer.dropEffect = dropAllowedAt(point) ? "copy" : "none";
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      clearDropHover();
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    clearDropHover();
  }

  /**
   * The window listener was registered once per device/folder change and closed over
   * stale state (hidden-files setting, transfer lock), and a dropped Finder folder went
   * up as a single item, so folder Merge / Replace / Keep both / Skip never applied to
   * it. A ref to the latest handler, folder expansion through the same
   * `list_local_files_under` path as Mac → phone Copy, and a short guard against the
   * same drop arriving under two Tauri event names. Upload into the open phone folder
   * through the normal plan → queue flow (lock, scan, dialogs). A drop while a copy
   * question is open, or a copy is running, is refused with a visible message. Product
   * decision: Finder drops upload into the open phone folder only. With Columns, the
   * pointer must be over the Open column; List/Icons accept anywhere on the phone pane.
   * Until acknowledged, `confirmFinderDropTip` explains Finder→phone first (Cancel =
   * nothing copied). Does not copy onto This Mac from Finder, or Mac → Mac.
   */
  const lastFinderDrop = useRef<{ key: string; at: number } | null>(null);

  /**
   * Finder drops must honor Open-column-only when phone is in Columns; positioned drops
   * from onDragDropEvent pass `point`; legacy listeners may omit it (then only the
   * open-folder rule applies, not geometry).
   */
  async function handleFinderPathsDrop(
    filePaths: string[],
    point: DragPoint | null,
  ) {
    clearDropHover();
    if (filePaths.length === 0) return;

    if (point) {
      const phone = paneDropAcceptance(phonePaneRef.current, point);
      if (!phone.overPane) {
        setError("Drop on the phone pane to copy into the open phone folder.");
        return;
      }
      if (!phone.canDrop) {
        setError("Drop on the Open column to copy into that phone folder.");
        return;
      }
    }

    const key = filePaths.join("\n");
    const now = Date.now();
    if (
      lastFinderDrop.current &&
      lastFinderDrop.current.key === key &&
      now - lastFinderDrop.current.at < 1500
    ) {
      return;
    }
    lastFinderDrop.current = { key, at: now };

    if (!selectedDevice) {
      setError("No device selected");
      return;
    }

    const destination = currentPath;
    const plan = await planTransfer({
      direction: "upload",
      destination,
      errorPrefix: "Could not prepare the dropped items",
      confirmFirst: confirmFinderDropTip,
      buildItems: async () => {
        setTransferFlowStatus("Listing folder contents…");
        const sources: UploadSource[] = [];
        for (const localPath of filePaths) {
          const name = localPath.split("/").pop() || localPath.split("\\").pop() || "file";
          const isDirectory = await invoke<boolean>("local_path_is_dir", { path: localPath });
          sources.push({ name, localPath, isDirectory, size: 0 });
        }
        const items = await buildUploadItems(sources);
        if (items.length === 0) {
          setError("Nothing to send. The drop may be an empty folder.");
          return null;
        }
        return items;
      },
    });
    if (!plan) return;
    await runPlannedTransfer("upload", "Uploading to phone", destination, plan);
  }
  handleFinderPathsDropRef.current = handleFinderPathsDrop;

  /**
   * A debug log of the raw payload was not part of the drop. Parse paths and hand them
   * to the Finder-drop upload. Does not print the payload, or use a pointer position.
   */
  async function handleFileDrop(payload: unknown, _eventName: string) {
    let filePaths: string[] = [];
    if (Array.isArray(payload)) {
      filePaths = payload.filter((p): p is string => typeof p === "string");
    } else if (typeof payload === "string") {
      filePaths = [payload];
    } else if (
      payload &&
      typeof payload === "object" &&
      Array.isArray((payload as { paths?: unknown }).paths)
    ) {
      filePaths = (payload as { paths: unknown[] }).paths.filter(
        (p): p is string => typeof p === "string",
      );
    } else {
      return;
    }
    if (filePaths.length === 0) return;
    await handleFinderPathsDrop(filePaths, null);
  }
  const fileDropHandlerRef = useRef(handleFileDrop);
  fileDropHandlerRef.current = handleFileDrop;

  // Listen for Tauri file drop events
  useEffect(() => {
    // Try multiple event names for Tauri v2 compatibility
    const eventNames = ['tauri://file-drop', 'tauri://drop', 'tauri://drag-drop', 'tauri://drop-over'];
    const unlisteners: Promise<() => void>[] = [];

    eventNames.forEach(eventName => {
      const unlisten = listen<unknown>(eventName, (event) => {
        void fileDropHandlerRef.current(event.payload, eventName);
      });
      unlisteners.push(unlisten);
    });

    return () => {
      unlisteners.forEach(unlisten => {
        unlisten.then(fn => fn());
      });
    };
  }, []);

  /**
   * A drag has to carry the phone selection into the Mac pane without a dialog. The
   * browser only keeps text across a drop inside this window. A `droiddock:` prefix so
   * Finder text drops are ignored. If the dragged row is part of a multi-selection, all
   * of those names travel together. Otherwise only that row. Does not include files
   * that are not in the current list, and does not start the copy. The Mac pane's drop
   * handler does that.
   */
  function phoneDragPayload(name: string): string {
    const names = selectedFiles.has(name) && selectedFiles.size > 1
      ? Array.from(selectedFiles)
      : [name];
    return `droiddock:${JSON.stringify({ side: "phone", names })}`;
  }

  function beginFileDrag(event: React.DragEvent, name: string) {
    const names =
      selectedFiles.has(name) && selectedFiles.size > 1
        ? Array.from(selectedFiles)
        : [name];
    /*
     * Default drag image was the List/Icons/Columns row under the pointer.
     * TransferPanel-style FileMark stack (one icon or scattered multi). Does not change
     * Finder OS ghosts or the destination chip.
     */
    applyTransferDragImage(
      event,
      resolveDragItems(names, [
        ...files,
        ...Array.from(columnFiles.values()).flat(),
      ]),
    );
    inAppDragRef.current = { side: "phone", names };
    event.dataTransfer.setData("text/plain", phoneDragPayload(name));
    event.dataTransfer.effectAllowed = "copy";
    // Chip immediately; allowed flips true over Mac Open (or whole Mac List).
    setDropHover({
      target: "mac",
      folderLabel: dropLabelsRef.current.mac,
      allowed: false,
    });
  }

  /**
   * HTML5 drop on the Mac pane may still fire in some builds; clear the dragend session
   * so we do not start two copies. Parse a phone-side `droiddock:` payload and call
   * `copyPhoneNamesToMac`.
   */
  async function receivePhoneDrop(payload: string) {
    inAppDragRef.current = null;
    if (!selectedDevice || !macPath || !payload.startsWith("droiddock:")) return;
    let parsed: { side?: string; names?: string[] };
    try {
      parsed = JSON.parse(payload.slice("droiddock:".length));
    } catch {
      return;
    }
    if (parsed.side !== "phone" || !parsed.names?.length) return;
    await copyPhoneNamesToMac(parsed.names);
  }

  /**
   * With Tauri eating HTML5 drop, Tauri Drop/Over + pane hit-test is the reliable
   * in-app signal . Copy into the other pane’s open folder only when release is over
   * that pane; in Columns, only the Open column accepts the drop. Does not copy on
   * every dragend, export to Finder, or hit-test Finder drops.
   */
  async function completeInAppPaneDrag(
    session: { side: "phone" | "mac"; names: string[] },
    point: { x: number; y: number },
  ) {
    const targetEl =
      session.side === "phone" ? macPaneRef.current : phonePaneRef.current;
    const acceptance = paneDropAcceptance(targetEl, point);
    if (!acceptance.overPane) return;
    if (!acceptance.canDrop) {
      setError(
        session.side === "phone"
          ? "Drop on the Open column on This Mac to copy into that folder."
          : "Drop on the Open column on the phone to copy into that folder.",
      );
      return;
    }

    if (transferFlowBusyRef.current || conflictPromptResolver.current) {
      setError(
        "Finish or cancel the current copy question before starting another copy.",
      );
      return;
    }
    if (transferJobRef.current && transferJobRef.current.finishedAt == null) {
      setError("A copy is already running. Wait for it to finish or cancel it first.");
      return;
    }
    if (session.names.length === 0) return;
    if (session.side === "phone") {
      if (!macPath) {
        setError("Open a Mac folder first, then drag files onto This Mac.");
        return;
      }
      if (!selectedDevice) {
        setError("Connect a phone first, then drag files.");
        return;
      }
      await copyPhoneNamesToMac(session.names);
      return;
    }
    if (!selectedDevice) {
      setError("Connect a phone first, then drag files onto the phone pane.");
      return;
    }
    if (!macPath) {
      setError("Open a Mac folder first, then drag files to the phone.");
      return;
    }
    await sendMacNames(session.names);
  }
  completeInAppPaneDragRef.current = completeInAppPaneDrag;

  return {
    handleDragOver,
    handleDragLeave,
    handleDrop,
    beginFileDrag,
    receivePhoneDrop,
  };
}
