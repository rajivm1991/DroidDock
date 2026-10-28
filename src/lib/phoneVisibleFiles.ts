/**
 * Hidden-file filter, the typed name filter, and sort for the open phone
 * folder. List and Icons share this. Subfolder search keeps its own order.
 */

import type { FileEntry } from "./file-types";
import type { SortColumn } from "./sort";

export function filterAndSortPhoneFiles(
  files: FileEntry[],
  options: {
    showHiddenFiles: boolean;
    nameFilter: string;
    sortColumn: SortColumn;
    sortDirection: "asc" | "desc";
  },
): FileEntry[] {
  const visibleFiles = (options.showHiddenFiles
    ? files
    : files.filter(file => !file.name.startsWith('.'))
  ).filter((file) => {
    const needle = options.nameFilter.trim().toLowerCase();
    return needle.length === 0 || file.name.toLowerCase().includes(needle);
  });

  // Sort based on selected column and direction
  return visibleFiles.sort((a, b) => {
    // Always keep directories grouped (at top if asc, bottom if desc for most columns)
    const dirComparison = options.sortColumn === 'name' && options.sortDirection === 'desc'
      ? (a.is_directory && !b.is_directory ? 1 : !a.is_directory && b.is_directory ? -1 : 0)
      : (a.is_directory && !b.is_directory ? -1 : !a.is_directory && b.is_directory ? 1 : 0);

    if (dirComparison !== 0) return dirComparison;

    let comparison = 0;

    switch (options.sortColumn) {
      case 'name':
        comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        break;
      case 'size':
        const sizeA = a.is_directory ? 0 : parseInt(a.size);
        const sizeB = b.is_directory ? 0 : parseInt(b.size);
        comparison = sizeA - sizeB;
        break;
      case 'date':
        comparison = a.date.localeCompare(b.date);
        break;
    }

    return options.sortDirection === 'asc' ? comparison : -comparison;
  });
}
