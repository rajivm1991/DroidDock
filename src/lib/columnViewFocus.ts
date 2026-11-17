/**
 * Deep folder chains overflow columns horizontally; without scrolling, drill-in
 * and path rebuilds could leave the viewport on the leftmost panes so the open
 * folder looked like it jumped to the first column. Keyboard navigation already
 * scrolled; this module is the shared scroll and drop-hit path for clicks,
 * init, breadcrumbs, and drag-over. It scrolls a pane-scoped `.column-list`
 * into view (Finder-like: open column toward the right edge), optionally
 * scrolls a selected row vertically inside that column, and hit-tests drops so
 * Columns mode only accepts them on the open folder. Queries stay within `root`
 * so phone and Mac columns do not steal focus from each other, and work is
 * scheduled after layout via rAF. It does not change `currentPath` or accept
 * drops on ancestor columns when Columns mode is active.
 */

export type ColumnScrollBehavior = ScrollBehavior;

export type ScrollColumnBrowserOptions = {
  /** Index of the `.column-list[data-column-index]` to bring into view. */
  columnIndex: number;
  /** Optional row index within that column (`.column-item`). */
  selectedRowIndex?: number;
  /** Default `smooth` for clicks; use `instant` after large rebuilds. */
  behavior?: ColumnScrollBehavior;
  /**
   * When false, only scroll the row vertically inside its column. Used for
   * ancestor “opened folder” rows so horizontal scroll does not kick the Open
   * column off-screen. Default true.
   */
  horizontal?: boolean;
};

export type DragPoint = { x: number; y: number };

export type PaneDropAcceptance = {
  overPane: boolean;
  /** True when the pointer may complete a drop into the open folder. */
  canDrop: boolean;
  isColumnView: boolean;
};

/**
 * Tauri drag coordinates may be physical or logical pixels, so a single pair
 * can miss the pane. These helpers try the raw point, point ÷ devicePixelRatio,
 * and point × DPR against an element’s box; only `paneDropAcceptance` uses them.
 * A miss on all three candidates is not treated as a successful drop.
 */
function clientPointCandidates(point: DragPoint): DragPoint[] {
  const dpr = window.devicePixelRatio || 1;
  return [
    point,
    { x: point.x / dpr, y: point.y / dpr },
    { x: point.x * dpr, y: point.y * dpr },
  ];
}

function pointHitsElement(
  el: Element | null | undefined,
  point: DragPoint,
): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  return clientPointCandidates(point).some(
    (p) =>
      p.x >= rect.left &&
      p.x <= rect.right &&
      p.y >= rect.top &&
      p.y <= rect.bottom,
  );
}

/** Drops must land in the open folder; in Columns that column may be off-screen while ancestors stay visible. List/Icons accept the whole pane; Columns only `.column-list.is-open-folder`. */
export function paneDropAcceptance(
  paneRoot: Element | null | undefined,
  point: DragPoint,
): PaneDropAcceptance {
  if (!(paneRoot instanceof HTMLElement)) {
    return { overPane: false, canDrop: false, isColumnView: false };
  }
  const overPane = pointHitsElement(paneRoot, point);
  if (!overPane) {
    return { overPane: false, canDrop: false, isColumnView: false };
  }
  const columnLists = paneRoot.querySelectorAll(".column-list");
  if (columnLists.length === 0) {
    return { overPane: true, canDrop: true, isColumnView: false };
  }
  const openCol = paneRoot.querySelector(".column-list.is-open-folder");
  return {
    overPane: true,
    canDrop: pointHitsElement(openCol, point),
    isColumnView: true,
  };
}

/**
 * Scroll the target column (and optional row) into view inside a pane root.
 * Safe no-op when the root or column is missing (e.g. view just left Columns).
 */
export function scrollColumnBrowserIntoView(
  root: ParentNode | null | undefined,
  options: ScrollColumnBrowserOptions,
): void {
  if (!root) return;
  const {
    columnIndex,
    selectedRowIndex,
    behavior = "smooth",
    horizontal = true,
  } = options;

  // Double rAF: wait for React commit + column width layout before scrolling.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const column = root.querySelector(
        `.column-list[data-column-index="${columnIndex}"]`,
      );
      if (!(column instanceof HTMLElement)) return;

      if (horizontal) {
        // Scroll by the measured gap, and only when the column is clipped.
        // `offsetLeft` is relative to a positioned ancestor outside
        // `.column-view`, so it produced targets far past the real maximum.
        // Writing `scrollLeft` back later (a delayed "restore") cancelled the
        // smooth scroll in flight and left Open off-screen, so nothing here
        // writes a saved scroll position.
        const scroller = column.closest(".column-view");
        if (scroller instanceof HTMLElement) {
          const col = column.getBoundingClientRect();
          const view = scroller.getBoundingClientRect();
          let delta = 0;
          if (col.right > view.right) delta = col.right - view.right;
          else if (col.left < view.left) delta = col.left - view.left;
          if (Math.abs(delta) >= 1) {
            scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior });
          }
        }
      }

      if (selectedRowIndex == null || selectedRowIndex < 0) return;
      const row = column.querySelectorAll(".column-item")[selectedRowIndex];
      if (!(row instanceof HTMLElement)) return;
      // Assign scrollTop on this column only; scrollIntoView would also move
      // the horizontal strip.
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const viewTop = column.scrollTop;
      const viewBottom = viewTop + column.clientHeight;
      if (rowTop < viewTop) {
        column.scrollTop = rowTop;
      } else if (rowBottom > viewBottom) {
        column.scrollTop = rowBottom - column.clientHeight;
      }
    });
  });
}

/**
 * Resolve the column index that lists an open folder’s contents
 * (`columnPath[i] === openPath`), or the last column as a fallback.
 */
export function columnIndexForOpenPath(
  columnPath: string[],
  openPath: string,
): number {
  if (columnPath.length === 0) return 0;
  const idx = columnPath.indexOf(openPath);
  return idx >= 0 ? idx : columnPath.length - 1;
}
