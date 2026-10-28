/** Shared List-view sort keys for phone and Mac explorers. */
export type SortColumn = "name" | "size" | "date";
export type SortDirection = "asc" | "desc";

/** List headers toggle sort column and direction (replacing the old dropdown): same column flips asc/desc, a new column starts ascending. Preference is not persisted across sessions. */
export function nextSortState(
  clicked: SortColumn,
  current: SortColumn,
  direction: SortDirection,
): { column: SortColumn; direction: SortDirection } {
  if (clicked === current) {
    return { column: current, direction: direction === "asc" ? "desc" : "asc" };
  }
  return { column: clicked, direction: "asc" };
}
