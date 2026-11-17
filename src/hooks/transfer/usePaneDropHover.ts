/**
 * Where a drag is hovering, and whether that spot would accept a copy. Sets
 * the cursor classes. Starting the copy is usePaneDragDrop.
 */
import { RefObject, useEffect, useRef, useState } from "react";
import { type DragPoint, columnIndexForOpenPath, paneDropAcceptance } from "../../lib/columnViewFocus";
import { type DropHoverState } from "../../types/transfer";
import { type MacPaneHandle } from "../../components/explorer/MacPane";

export interface UsePaneDropHoverArgs {
  currentPath: string;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  macPaneRef: RefObject<HTMLElement | null>;
  viewMode: "table" | "grid" | "column";
  columnPath: string[];
  focusPhoneColumn: (
    columnIndex: number,
    selectedRowIndex?: number,
    behavior?: ScrollBehavior,
    horizontal?: boolean,
  ) => void;
}

export function usePaneDropHover({
  currentPath,
  macPaneHandleRef,
  phonePaneRef,
  macPaneRef,
  viewMode,
  columnPath,
  focusPhoneColumn,
}: UsePaneDropHoverArgs) {
  /**
   * With Tauri `dragDropEnabled`, the native handler marks every drag “handled”, so the
   * page never gets HTML5 drop for in-app row drags. Remember source on dragstart; on
   * dragend, copy only if the pointer is over the *other* pane (pane hit-test). Finder
   * drops unchanged. Does not copy on every dragend, export to Finder, or hit-test
   * Finder drops.
   */
  const inAppDragRef = useRef<{ side: "phone" | "mac"; names: string[] } | null>(
    null,
  );
  /**
   * Tauri swallows HTML5 dragover when dragDropEnabled is on, so the Finder “Drop to
   * copy…” overlay never saw page dragover. Track Finder enter (paths non-empty)
   * separately from in-app text drags.
   */
  const finderDragActiveRef = useRef(false);
  const dropLabelsRef = useRef({ phone: "phone", mac: "This Mac" });
  const applyDropHoverRef = useRef<(point: DragPoint | null) => void>(() => {});
  const clearDropHoverRef = useRef(() => {});
  /** Sync dropEffect on dragover (empty-deps listener); mirrors applyDropHover. */
  const dropAllowedAtRef = useRef<(point: DragPoint) => boolean>(() => false);
  const ensurePhoneOpenColumnVisibleForDragRef = useRef(() => {});

  /**
   * Overlay + Columns dim must work for Finder and in-app either way. Full-window dim
   * hid the column cue; hover state drives a floating chip.
   */
  const [dropHover, setDropHover] = useState<DropHoverState | null>(null);

  /** Throttle Columns scroll-on-drag so dragover does not spam rAF. */
  const lastPhoneColumnDragFocusAt = useRef(0);
  const lastMacColumnDragFocusAt = useRef(0);

  /**
   * During drag the person may have scrolled Columns sideways; bring the open-folder
   * column into view so the drop destination is visible. Does not change where the drop
   * lands (still currentPath / macPath).
   */
  function ensurePhoneOpenColumnVisibleForDrag() {
    if (viewMode !== "column") return;
    const now = Date.now();
    if (now - lastPhoneColumnDragFocusAt.current < 200) return;
    lastPhoneColumnDragFocusAt.current = now;
    focusPhoneColumn(
      columnIndexForOpenPath(columnPath, currentPath),
      undefined,
      "smooth",
    );
  }
  ensurePhoneOpenColumnVisibleForDragRef.current =
    ensurePhoneOpenColumnVisibleForDrag;

  function ensureMacOpenColumnVisibleForDrag() {
    const now = Date.now();
    if (now - lastMacColumnDragFocusAt.current < 200) return;
    lastMacColumnDragFocusAt.current = now;
    macPaneHandleRef.current?.focusOpenColumnForDrag();
  }

  /**
   * Native drag cursor follows dataTransfer.dropEffect, not CSS. Plus (copy) only when
   * the pointer is over the opposite open folder; stop (none) on the source pane,
   * chrome, and Columns non-Open columns. Does not allow link/move cursors, or treat
   * the source pane as a drop.
   */
  function dropAllowedAt(point: DragPoint): boolean {
    if (finderDragActiveRef.current) {
      return paneDropAcceptance(phonePaneRef.current, point).canDrop;
    }
    const session = inAppDragRef.current;
    if (!session) return false;
    if (session.side === "mac") {
      return paneDropAcceptance(phonePaneRef.current, point).canDrop;
    }
    return paneDropAcceptance(macPaneRef.current, point).canDrop;
  }

  /**
   * One hover path for Finder + in-app either direction — overlay text, Columns dim,
   * Open-column scroll, and copy vs stop cursor via allowed.
   */
  function applyDropHover(point: DragPoint | null) {
    if (!point) {
      clearDropHover();
      return;
    }
    const labels = dropLabelsRef.current;

    if (finderDragActiveRef.current) {
      const phone = paneDropAcceptance(phonePaneRef.current, point);
      if (phone.overPane) {
        ensurePhoneOpenColumnVisibleForDragRef.current();
      }
      setDropHover({
        target: "phone",
        folderLabel: labels.phone,
        allowed: phone.canDrop,
      });
      // Finder always targets phone; never dim Mac Columns for Finder.
      macPaneHandleRef.current?.setDropTargeting(false);
      return;
    }

    const session = inAppDragRef.current;
    if (!session) {
      clearDropHover();
      return;
    }

    if (session.side === "mac") {
      // Mac → phone — chip stays up for the whole drag; dim only over phone.
      const phone = paneDropAcceptance(phonePaneRef.current, point);
      if (phone.overPane) {
        ensurePhoneOpenColumnVisibleForDragRef.current();
      }
      setDropHover({
        target: "phone",
        folderLabel: labels.phone,
        allowed: phone.canDrop,
      });
      macPaneHandleRef.current?.setDropTargeting(false);
      return;
    }

    // Phone → Mac — chip stays up; dim Mac Columns only while over This Mac.
    const mac = paneDropAcceptance(macPaneRef.current, point);
    if (mac.overPane) {
      ensureMacOpenColumnVisibleForDrag();
      macPaneHandleRef.current?.setDropTargeting(true);
    } else {
      macPaneHandleRef.current?.setDropTargeting(false);
    }
    setDropHover({
      target: "mac",
      folderLabel: labels.mac,
      allowed: mac.canDrop,
    });
  }

  function clearDropHover() {
    setDropHover(null);
    macPaneHandleRef.current?.setDropTargeting(false);
  }

  applyDropHoverRef.current = applyDropHover;
  clearDropHoverRef.current = clearDropHover;
  dropAllowedAtRef.current = dropAllowedAt;

  useEffect(() => {
    document.body.classList.toggle("is-file-drop-hover", dropHover != null);
    document.body.classList.toggle(
      "drop-copy",
      dropHover != null && dropHover.allowed,
    );
    document.body.classList.toggle(
      "drop-not-allowed",
      dropHover != null && !dropHover.allowed,
    );
    return () => {
      document.body.classList.remove(
        "is-file-drop-hover",
        "drop-copy",
        "drop-not-allowed",
      );
    };
  }, [dropHover]);

  return {
    inAppDragRef,
    finderDragActiveRef,
    dropLabelsRef,
    applyDropHoverRef,
    clearDropHoverRef,
    dropAllowedAtRef,
    dropHover,
    setDropHover,
    dropAllowedAt,
    applyDropHover,
    clearDropHover,
  };
}
