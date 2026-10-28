/**
 * Back and forward for one pane. A push that repeats the current path is
 * ignored, and the stack keeps the latest 50 folders. Nothing is saved
 * across launches.
 */

/** Browser-like folder history for one explorer pane. */
export type FolderHistory = { stack: string[]; index: number };

export function pushFolderHistory(prev: FolderHistory, path: string): FolderHistory {
  if (!path || prev.stack[prev.index] === path) return prev;
  const stack = [...prev.stack.slice(0, prev.index + 1), path].slice(-50);
  return { stack, index: stack.length - 1 };
}

/**
 * When leaving a deeper folder for an ancestor (Delete, back, breadcrumb), the
 * first segment under that ancestor is the folder the person just left — Finder
 * keeps that row focused and selected. Returns null for sideways jumps, deeper
 * opens, or the same path.
 */
export function descendantSegmentUnderAncestor(
  fromPath: string,
  toPath: string,
): string | null {
  const normalize = (p: string) => {
    if (!p || p === "/") return "/";
    return p.replace(/\/+$/, "") || "/";
  };
  const from = normalize(fromPath);
  const to = normalize(toPath);
  if (from === to) return null;
  if (to === "/") {
    const segs = from.split("/").filter(Boolean);
    return segs[0] ?? null;
  }
  if (!from.startsWith(`${to}/`)) return null;
  const rest = from.slice(to.length + 1);
  return rest.split("/").filter(Boolean)[0] ?? null;
}

/**
 * Android's adb shell cannot list `/storage/emulated` (permission denied) even
 * though `/storage/emulated/0` works. Given a folder that failed that way and
 * the phone's internal-storage path, returns the next folder toward storage
 * (here `/storage/emulated/0`), or null when the failed folder is not an
 * ancestor of it and the error should be shown as usual.
 */
export function listableChildToward(
  deniedPath: string,
  storagePath: string,
): string | null {
  const trim = (p: string) => (p === "/" ? "/" : p.replace(/\/+$/, ""));
  const from = trim(deniedPath);
  const target = trim(storagePath);
  const prefix = from === "/" ? "/" : `${from}/`;
  if (!target.startsWith(prefix) || target === from) return null;
  const next = target.slice(prefix.length).split("/").filter(Boolean)[0];
  return next ? `${prefix}${next}` : null;
}
