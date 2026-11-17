/**
 * Pure labels and path helpers for the This Mac pane. No listing, selection,
 * or system-settings calls — those stay in the Mac hooks and the access panel.
 */
import type { FileEntry } from "../../../lib/file-types";
import type { PathCrumb } from "../PathBreadcrumb";
import type { SortColumn, SortDirection } from "../../../lib/sort";

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function kindLabel(file: FileEntry): string {
  if (file.is_directory) return "Folder";
  if (file.extension) return file.extension.replace(/^\./, "").toUpperCase();
  return "File";
}

/**
 * Middle-ellipsis hid folders, so the strip scrolls on one line. Every folder
 * segment is a clickable crumb. The middle is not collapsed and the path does
 * not wrap.
 */
export function macPathCrumbs(path: string, onNavigatePath: (path: string) => void): PathCrumb[] {
  const segments = path.split("/").filter(Boolean);
  const crumbs: PathCrumb[] = [];
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    const target = acc;
    crumbs.push({
      label: segment,
      onClick: () => onNavigatePath(target),
    });
  }
  return crumbs;
}

/** Folders stay grouped ahead of files except when Name is sorted descending. */
export function sortFiles(
  list: FileEntry[],
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): FileEntry[] {
  return [...list].sort((a, b) => {
    const dirComparison =
      sortColumn === "name" && sortDirection === "desc"
        ? a.is_directory && !b.is_directory
          ? 1
          : !a.is_directory && b.is_directory
            ? -1
            : 0
        : a.is_directory && !b.is_directory
          ? -1
          : !a.is_directory && b.is_directory
            ? 1
            : 0;
    if (dirComparison !== 0) return dirComparison;
    let comparison = 0;
    switch (sortColumn) {
      case "name":
        comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        break;
      case "size": {
        const sizeA = a.is_directory ? 0 : parseInt(a.size, 10) || 0;
        const sizeB = b.is_directory ? 0 : parseInt(b.size, 10) || 0;
        comparison = sizeA - sizeB;
        break;
      }
      case "date":
        comparison = a.date.localeCompare(b.date);
        break;
      default: {
        const _exhaustive: never = sortColumn;
        void _exhaustive;
        break;
      }
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });
}

export function joinMacPath(base: string, name: string): string {
  if (name.startsWith("/")) return name;
  if (base === "/" || base === "") return `/${name}`;
  return base.endsWith("/") ? `${base}${name}` : `${base}/${name}`;
}
