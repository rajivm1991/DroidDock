/**
 * Phone and Mac each need saved folder shortcuts and a phone start-folder
 * preference, shared by the place row and Settings. This module loads and saves
 * custom presets and the default phone folder key; it does not verify paths on
 * disk or on the phone — callers refresh when needed.
 */

export const PHONE_PRESETS_KEY = "droiddock-phone-presets";
export const MAC_PRESETS_KEY = "droiddock-mac-presets";
export const PHONE_DEFAULT_FOLDER_KEY = "droiddock-phone-default-folder";
/** single = open folder on click; double = open on double-click (default). */
export const FOLDER_OPEN_CLICK_KEY = "droiddock-folder-open-click";
export const MAX_CUSTOM_PRESETS = 8;

export type FolderOpenClick = "single" | "double";

export function loadFolderOpenClick(): FolderOpenClick {
  const saved = localStorage.getItem(FOLDER_OPEN_CLICK_KEY);
  return saved === "single" ? "single" : "double";
}

/** Cmd/Ctrl/Shift (and friends) mean multi-select — never open on that click. */
export function isMultiSelectClick(event: {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey?: boolean;
}): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

export type CustomPreset = { label: string; path: string };

export type PhoneDefaultFolder =
  | "camera"
  | "screenshots"
  | "downloads"
  | "internal";

export function pathLeafLabel(path: string, emptyLabel = "Folder"): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : emptyLabel;
}

/** Strip a trailing slash except for filesystem root. */
export function normalizeFolderPath(path: string): string {
  if (!path) return path;
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

/**
 * With a single folder row selected, + should add that folder — not the open
 * parent (often a built-in like Internal storage). Absolute names from search
 * resolve as-is; when the lookup list omits the row, a single selection still
 * joins as a folder name. Exactly one selected directory uses that path;
 * otherwise `openFolder`. The filesystem is not probed here; callers confirm
 * existence later.
 */
export function resolvePresetTargetPath(
  openFolder: string,
  selectedNames: string[],
  entries: { name: string; is_directory: boolean }[],
): string {
  const base = normalizeFolderPath(openFolder);
  if (selectedNames.length !== 1) return base;

  const name = selectedNames[0]!;
  const entry = entries.find((file) => file.name === name);

  // Search hits and some column rows use an absolute path as the name.
  if (name.startsWith("/")) {
    if (entry && !entry.is_directory) return base;
    return normalizeFolderPath(name);
  }

  if (entry && !entry.is_directory) return base;

  // Prefer an explicit directory entry; if the row is missing from the lookup
  // list (column/filter edge cases), still treat a single selection as a folder
  // so + does not silently fall back to Internal storage / Home.
  if (entry?.is_directory || !entry) {
    if (base === "/" || base === "") return normalizeFolderPath(`/${name}`);
    return normalizeFolderPath(`${base}/${name}`);
  }

  return base;
}

/** True when two folder paths are the same after slash normalization. */
export function sameFolderPath(a: string, b: string): boolean {
  return normalizeFolderPath(a) === normalizeFolderPath(b);
}

export function loadCustomPresets(storageKey: string): CustomPreset[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CustomPreset =>
          !!item &&
          typeof item === "object" &&
          typeof (item as CustomPreset).label === "string" &&
          typeof (item as CustomPreset).path === "string",
      )
      .map((item) => ({
        label: item.label,
        path: normalizeFolderPath(item.path),
      }))
      .slice(0, MAX_CUSTOM_PRESETS);
  } catch {
    return [];
  }
}

export function saveCustomPresets(storageKey: string, presets: CustomPreset[]): void {
  localStorage.setItem(
    storageKey,
    JSON.stringify(presets.slice(0, MAX_CUSTOM_PRESETS)),
  );
}

export function loadPhoneDefaultFolder(): PhoneDefaultFolder {
  const saved = localStorage.getItem(PHONE_DEFAULT_FOLDER_KEY);
  if (
    saved === "camera" ||
    saved === "screenshots" ||
    saved === "downloads" ||
    saved === "internal"
  ) {
    return saved;
  }
  return "camera";
}

export function phoneDefaultFolderPath(
  storageRoot: string,
  choice: PhoneDefaultFolder,
): string {
  const root = normalizeFolderPath(storageRoot) || "/storage/emulated/0";
  switch (choice) {
    case "camera":
      return `${root}/DCIM/Camera`;
    case "screenshots":
      return `${root}/DCIM/Screenshots`;
    case "downloads":
      return `${root}/Download`;
    case "internal":
      return root;
    default: {
      const _exhaustive: never = choice;
      return _exhaustive;
    }
  }
}
