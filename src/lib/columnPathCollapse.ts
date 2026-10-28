import type { FileEntry } from "./file-types";

/**
 * Android FUSE parents (e.g. …/emulated) often list empty while a deeper open
 * folder still has files, which left a dead “No visible files” Miller pane
 * between the parent and Open. Shared helpers filter visible rows, synthesize a
 * missing next segment, collapse empty non-open intermediates, and name
 * emulated→0 probes. Pure path/listing helpers for phone and Mac Columns. Does
 * not call ADB/local FS, auto-navigate, or change breadcrumbs.
 */

export function visibleColumnEntries(
  files: FileEntry[],
  showHidden: boolean,
): FileEntry[] {
  return showHidden ? files : files.filter((file) => !file.name.startsWith("."));
}

export function syntheticDirectoryEntry(name: string): FileEntry {
  return {
    name,
    permissions: "drwxr-xr-x",
    size: "0",
    date: "",
    is_directory: true,
    extension: null,
  };
}

export function joinColumnPath(parent: string, name: string): string {
  if (name.startsWith("/")) return name;
  if (parent === "/") return `/${name}`;
  return `${parent}/${name}`;
}

export function basenameSegment(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/**
 * Index of the child folder row in a parent column listing. Used when going
 * back (←, Delete, history) so the opened folder stays highlighted and
 * scrolled into view. Accepts a full child path or a single name.
 */
export function columnHighlightIndexForChild(
  listing: FileEntry[],
  childPathOrName: string,
  showHidden: boolean,
): number {
  const name = childPathOrName.includes("/")
    ? basenameSegment(childPathOrName)
    : childPathOrName;
  if (!name) return -1;
  return visibleColumnEntries(listing, showHidden).findIndex(
    (file) => file.name === name,
  );
}

/**
 * Deep jumps know the next folder name even when ls omitted it. Append a
 * directory row for `childName` when missing. Does not invent unrelated siblings
 * or mark selection.
 */
export function ensureChildInListing(
  files: FileEntry[],
  childName: string,
): FileEntry[] {
  if (!childName) return files;
  if (files.some((file) => file.name === childName)) return files;
  return [...files, syntheticDirectoryEntry(childName)];
}

/**
 * Users should never see an empty pane between a parent and Open when a deeper
 * column already exists. Keep the first column and the open path; drop other
 * paths whose visible listing is empty. Does not hide a truly empty Open folder
 * or alter file maps.
 */
export function collapseEmptyIntermediatePaths(
  paths: string[],
  filesByPath: Map<string, FileEntry[]>,
  openPath: string,
  showHidden: boolean,
): string[] {
  if (paths.length === 0) return paths;
  return paths.filter((path, index) => {
    if (index === 0) return true;
    if (path === openPath) return true;
    const visible = visibleColumnEntries(
      filesByPath.get(path) || [],
      showHidden,
    );
    return visible.length > 0;
  });
}

/**
 * …/emulated rarely lists children over ADB while …/emulated/0 is the real user
 * volume. Return absolute candidate paths to probe (currently only `0`). Does
 * not check existence or open those paths.
 */
export function emulatedRecoveryCandidatePaths(parentPath: string): string[] {
  if (basenameSegment(parentPath) !== "emulated") return [];
  return [joinColumnPath(parentPath, "0")];
}

/** Cap auto-drill through recovered single children (avoid loops). */
export const COLUMN_AUTO_CONTINUE_MAX_DEPTH = 3;
