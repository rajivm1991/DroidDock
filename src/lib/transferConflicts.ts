/**
 * Copy must resolve name clashes before and during transfer without burying
 * rules in App queue code. Shared types, destination-kind lookup, a scan
 * summary, and Keep-both folder sibling labels (`name (n)`) classify file,
 * folder, type-mismatch, and unreadable ("unknown") conflicts from destination
 * checks. This module does not talk to ADB, show UI, compare contents or
 * mtimes, or rewrite the planned item list — callers apply Skip, Keep both,
 * Replace, and Merge; `numberedFolderName` only builds the sibling label.
 */

export type FileConflictAction = "skip" | "replace" | "keepBoth" | "ask";
export type FolderConflictAction =
  | "merge"
  | "replace"
  | "keepBoth"
  | "skip"
  | "ask";
/**
 * File vs folder with the same name. Replace / Merge would write into the
 * wrong type, so only Skip or Keep both (rename the incoming item) exist.
 */
export type MismatchAction = "skip" | "keepBoth";

/**
 * "unknown" = the phone gave no readable answer. It is treated as a conflict
 * (ask), never as free — a silent Replace must not follow a failed check.
 */
export type DestKind = "missing" | "file" | "directory" | "unknown";

export interface DestConflict {
  path: string;
  kind: string;
}

export interface TransferQueueItem {
  name: string;
  total: number;
  devicePath: string;
  localPath: string;
}

export interface TypeMismatch {
  /** Top-level folder root, or the full relative item name for a file. */
  name: string;
  destKind: DestKind;
  sourceIsFolder: boolean;
}

export interface ConflictScanResult {
  /** Item names whose planned file destination already exists as a file. */
  fileConflicts: string[];
  /** Item names whose phone destination could not be checked. */
  unknownFiles: string[];
  /** Top-level folder names that already exist (or may exist) as a folder. */
  folderConflicts: string[];
  /** Same name, but file vs folder (either direction). */
  typeMismatches: TypeMismatch[];
  /**
   * Planned FILE destinations that exist, are unreadable, or are blocked by a
   * wrong-type name (including files inside a folder whose root name is
   * taken by a file). Folder conflicts are reported separately.
   */
  fileConflictCount: number;
  totalItems: number;
}

export interface TransferConflictPolicy {
  fileAction: FileConflictAction;
  folderAction: FolderConflictAction;
  mismatchAction: MismatchAction;
  remember: boolean;
}

/** Map of destination path → kind from Rust check_*_destinations. */
export function kindByPath(entries: DestConflict[]): Map<string, DestKind> {
  const map = new Map<string, DestKind>();
  for (const entry of entries) {
    const kind: DestKind =
      entry.kind === "file" ||
      entry.kind === "directory" ||
      entry.kind === "missing" ||
      entry.kind === "unknown"
        ? entry.kind
        : "unknown";
    map.set(entry.path, kind);
  }
  return map;
}

/** Top-level segment of a relative item name (`Camera/a.jpg` → `Camera`). */
export function itemRoot(name: string): string {
  const slash = name.indexOf("/");
  return slash > 0 ? name.slice(0, slash) : name;
}

/**
 * Top-level folder roots from expanded relative names (`Camera/a.jpg` → `Camera`).
 * Single-segment names are files at the destination root, not folder roots.
 */
export function folderRootsFromItems(items: TransferQueueItem[]): Set<string> {
  const roots = new Set<string>();
  for (const item of items) {
    const slash = item.name.indexOf("/");
    if (slash > 0) {
      roots.add(item.name.slice(0, slash));
    }
  }
  return roots;
}

export function summarizeConflicts(options: {
  items: TransferQueueItem[];
  kinds: Map<string, DestKind>;
  /** Destination path for a top-level name (folder or file). */
  topLevelDestPath: (name: string) => string;
  /** Destination path for an expanded queue item. */
  itemDestPath: (item: TransferQueueItem) => string;
}): ConflictScanResult {
  const folderRoots = folderRootsFromItems(options.items);
  const fileConflicts: string[] = [];
  const unknownFiles: string[] = [];
  const folderConflicts: string[] = [];
  const typeMismatches: TypeMismatch[] = [];
  const blockedRoots = new Set<string>();

  for (const root of folderRoots) {
    const kind = options.kinds.get(options.topLevelDestPath(root)) ?? "unknown";
    if (kind === "directory" || kind === "unknown") {
      folderConflicts.push(root);
    } else if (kind === "file") {
      typeMismatches.push({ name: root, destKind: "file", sourceIsFolder: true });
      blockedRoots.add(root);
    }
  }

  let fileConflictCount = 0;
  for (const item of options.items) {
    if (item.name.includes("/") && blockedRoots.has(itemRoot(item.name))) {
      fileConflictCount += 1;
      continue;
    }
    const kind = options.kinds.get(options.itemDestPath(item)) ?? "unknown";
    switch (kind) {
      case "missing":
        break;
      case "file":
        fileConflicts.push(item.name);
        fileConflictCount += 1;
        break;
      case "directory":
        typeMismatches.push({ name: item.name, destKind: "directory", sourceIsFolder: false });
        fileConflictCount += 1;
        break;
      case "unknown":
        unknownFiles.push(item.name);
        fileConflictCount += 1;
        break;
      default: {
        const unreachable: never = kind;
        throw new Error(`Unhandled destination kind: ${String(unreachable)}`);
      }
    }
  }

  return {
    fileConflicts,
    unknownFiles,
    folderConflicts,
    typeMismatches,
    fileConflictCount,
    totalItems: options.items.length,
  };
}

/** Keep both uses `name (n)` for a folder sibling; callers probe the destination and pick `n`. Does not search for a free name, strip extensions, or rewrite queue items. */
export function numberedFolderName(name: string, n: number): string {
  return `${name} (${n})`;
}
