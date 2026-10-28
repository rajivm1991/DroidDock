/**
 * Contract for the This Mac pane. App and the Mac explorer hook depend on the
 * imperative handle; the pane itself depends on these props. View state and
 * listing behavior live in the Mac hooks, not here.
 */
import type { MouseEvent, ReactNode, Ref } from "react";
import type { FileEntry } from "../../../lib/file-types";
import type { IconSize } from "../../../lib/iconSize";
import type { FolderOpenClick } from "../../../lib/presets";
import type { PlaceMarkItem } from "../PlaceMarks";

export type MacViewMode = "table" | "grid" | "column";

/** Same ladder as the phone pane, including the thumbnail-only sizes. */
export type MacIconSize = IconSize;

/** Visible rows for Shift+click range (same order as on screen). */
export type MacSelectRangeContext = {
  index: number;
  rangeSource: FileEntry[];
  /** Distinct list/column id so Shift does not span unrelated Columns panes. */
  rangeId?: string;
};

export interface MacPaneProps {
  path: string;
  files: FileEntry[];
  loading: boolean;
  error: string;
  permissionDenied: boolean;
  selected: Set<string>;
  showHidden: boolean;
  placeMarks: PlaceMarkItem[];
  onOpenFolder: (name: string) => void;
  onNavigatePath: (path: string) => void;
  /** Breadcrumb and root clicks; clears the selection. Defaults to onNavigatePath. */
  onCrumbNavigate?: (path: string) => void;
  onGrantFolderAccess: () => void;
  onAddPlaceMark: () => void;
  onRemovePlaceMark: (path: string) => void;
  /**
   * Click/Shift/Cmd selection. The parent clears the phone selection so only
   * one pane is selected. `rangeContext` is the visible row order for this
   * view so Shift+click can range-select.
   */
  onSelect: (
    name: string,
    event: MouseEvent,
    rangeContext?: MacSelectRangeContext,
  ) => void;
  /** Single- or double-click to open folders, matching the phone pane. */
  openFolderOn: FolderOpenClick;
  onContextMenu: (event: MouseEvent, file: FileEntry) => void;
  /** Right-click empty list space (New folder). */
  onEmptyContextMenu?: (event: MouseEvent) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onRefreshFolder: () => void;
  refreshDisabled?: boolean;
  onDropPhonePayload: (payload: string) => void;
  /**
   * Tauri’s native drop handler swallows HTML5 drop, so App completes in-app
   * Mac → phone copies on dragend when the pointer is over the phone pane,
   * using this name list.
   */
  onMacDragStart: (names: string[]) => void;
  /** Pane bounds for in-app drag hit-testing. App holds the ref. */
  rootRef?: Ref<HTMLElement | null>;
  /**
   * Columns keep their own listings. Bumping this from Refresh reloads every
   * column for the open Mac path without changing the path.
   */
  listEpoch: number;
  /**
   * Cmd+A needs a last-focused pane when nothing is selected. The parent sets
   * the active pane to Mac on mousedown here. This does not change selection
   * by itself.
   */
  onActivate?: (event: MouseEvent) => void;
  /** Shared Settings toggle. Icons view only. */
  thumbnailsEnabled?: boolean;
  /**
   * Largest Icons step right now. xlarge while thumbnails are off; a larger
   * photo step while they are on and the pane can show it.
   */
  iconSizeMax: IconSize;
  /**
   * Selection Clear/Copy render on this pane when Mac has the picks. The
   * parent builds the strip. Null or undefined hides it, with no empty gap.
   */
  selectionStrip?: ReactNode;
  /**
   * The status bar’s Selected size must see Columns and search rows, not only
   * the open-folder listing App holds. Push resolved entries when selection
   * or those pools change.
   */
  onSelectionEntriesChange?: (entries: FileEntry[]) => void;
  /**
   * Keyboard Shift+arrows extend the Mac selection without a synthetic click.
   * The parent still clears the phone set through the exclusive-selection effect.
   */
  onKeyboardSelectionChange?: (names: Set<string>) => void;
  /** Subtle active-pane ring when This Mac last received focus or a pane shortcut. */
  isActive?: boolean;
}

/**
 * Filter, sort, and search live inside the Mac pane. App’s Cmd+A must select
 * the same visible rows the person sees, or return null while Mac search is
 * showing so Cmd+A stays blocked the way phone search blocks it. Keyboard
 * shortcuts call the same handle for arrows, view mode, and the selection menu
 * anchor so This Mac keeps its own focus ring without lifting listing state to App.
 */
export type MacPaneHandle = {
  selectAllVisibleNames: () => string[] | null;
  /**
   * Tauri swallows HTML5 dragover, so App drives Columns scroll from the
   * native drag event. Scroll the open Mac column into view during a drop hover.
   */
  focusOpenColumnForDrag: () => void;
  /** Dim non-open Columns while a phone → Mac drag hovers This Mac. */
  setDropTargeting: (active: boolean) => void;
  setViewMode: (mode: MacViewMode) => void;
  setIconSize: (size: MacIconSize) => void;
  getViewMode: () => MacViewMode;
  getIconSize: () => MacIconSize;
  /** Focus the filter field for Cmd+F when This Mac is active. */
  focusFilterInput: () => void;
  /** Arrow / Shift+arrow navigation; Shift extends the Mac selection. */
  navigateArrow: (
    key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
    shiftKey: boolean,
  ) => void;
  /** Cmd+O — open the focused folder when it is a directory. */
  openFocusedFolder: () => void;
  /** Delete / Backspace — parent of the open Mac folder. */
  navigateParent: () => void;
  /**
   * Anchor for Ctrl+Return. When a row is focused or selected, returns that
   * name and on-screen point; when nothing is selected, returns null so the
   * caller can open the empty-canvas menu.
   */
  getContextMenuTarget: () => {
    x: number;
    y: number;
    name: string;
    isDirectory: boolean;
  } | null;
};
