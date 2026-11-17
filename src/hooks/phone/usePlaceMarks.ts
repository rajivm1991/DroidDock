/**
 * Saved folder shortcuts for the phone and This Mac, which of those paths
 * still exist, and the phone start-folder setting. Adding or removing a
 * shortcut is saved here. Opening one is the pane’s job.
 */
import { SetStateAction, useEffect, useRef, useState } from "react";
import { type PhoneDefaultFolder, loadPhoneDefaultFolder, type CustomPreset, loadCustomPresets, PHONE_PRESETS_KEY, MAC_PRESETS_KEY, normalizeFolderPath, PHONE_DEFAULT_FOLDER_KEY, saveCustomPresets, resolvePresetTargetPath, sameFolderPath, pathLeafLabel as presetPathLeaf, MAX_CUSTOM_PRESETS } from "../../lib/presets";
import { invoke } from "@tauri-apps/api/core";
import { type PlaceMarkItem } from "../../components/explorer/PlaceMarks";
import { type FileEntry } from "../../lib/file-types";

export interface UsePlaceMarksArgs {
  selectedDevice: string;
  currentPath: string;
  detectedStoragePath: string;
  placeRefreshTick: number;
  setPlaceRefreshTick: (value: SetStateAction<number>) => void;
  files: FileEntry[];
  setError: (value: SetStateAction<string>) => void;
  selectedFiles: Set<string>;
  searchResults: FileEntry[];
  macPath: string;
  macFiles: FileEntry[];
  macSelected: Set<string>;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  columnFiles: Map<string, FileEntry[]>;
  storageRoot: string;
}

export function usePlaceMarks({
  selectedDevice,
  currentPath,
  detectedStoragePath,
  placeRefreshTick,
  setPlaceRefreshTick,
  files,
  setError,
  selectedFiles,
  searchResults,
  macPath,
  macFiles,
  macSelected,
  setSuccessMessage,
  columnFiles,
  storageRoot,
}: UsePlaceMarksArgs) {
  /**
   * Camera-as-start leaves empty Camera folders open; people also want
   * Screenshots/Downloads/Internal as the first view, with empty → storage root.
   */
  const [phoneDefaultFolder, setPhoneDefaultFolder] = useState<PhoneDefaultFolder>(
    () => loadPhoneDefaultFolder(),
  );
  const [phoneCustomPresets, setPhoneCustomPresets] = useState<CustomPreset[]>(() =>
    loadCustomPresets(PHONE_PRESETS_KEY),
  );
  const [macCustomPresets, setMacCustomPresets] = useState<CustomPreset[]>(() =>
    loadCustomPresets(MAC_PRESETS_KEY),
  );
  const [phoneExistingPaths, setPhoneExistingPaths] = useState<Set<string>>(new Set());
  const [macExistingPaths, setMacExistingPaths] = useState<Set<string>>(new Set());
  const [macHomePath, setMacHomePath] = useState("");
  const [phoneDefaultMenuOpen, setPhoneDefaultMenuOpen] = useState(false);
  const phoneDefaultPickerRef = useRef<HTMLDivElement>(null);

  /**
   * Close custom picker menus on outside click or Escape so they do not stick open.
   * Does not use a native <select> menu.
   */
  useEffect(() => {
    if (!phoneDefaultMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!phoneDefaultPickerRef.current?.contains(event.target as Node)) {
        setPhoneDefaultMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhoneDefaultMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [phoneDefaultMenuOpen]);

  /**
   * Hide place marks for folders that are not on this phone; refresh when the device
   * connects, disconnects, or switches, and when custom presets change.
   */
  useEffect(() => {
    let cancelled = false;
    async function refreshPhonePlaces() {
      if (!selectedDevice) {
        setPhoneExistingPaths(new Set());
        return;
      }
      const root = detectedStoragePath || "/storage/emulated/0";
      const candidates = [
        root,
        `${root}/DCIM/Camera`,
        `${root}/DCIM/Screenshots`,
        `${root}/Download`,
        ...phoneCustomPresets.map((preset) => preset.path),
      ];
      const unique = [...new Set(candidates.map(normalizeFolderPath))];
      const existing = new Set<string>();
      await Promise.all(
        unique.map(async (path) => {
          try {
            const ok = await invoke<boolean>("phone_path_exists", {
              deviceId: selectedDevice,
              path,
            });
            if (ok) existing.add(path);
          } catch {
            /* skip */
          }
        }),
      );
      if (!cancelled) setPhoneExistingPaths(existing);
    }
    void refreshPhonePlaces();
    return () => {
      cancelled = true;
    };
  }, [selectedDevice, detectedStoragePath, phoneCustomPresets, placeRefreshTick]);

  /**
   * Mac custom/built-in chips should hide deleted folders; TCC-blocked folders still
   * show (local_path_is_dir treats denial as present).
   */
  useEffect(() => {
    let cancelled = false;
    async function refreshMacPlaces() {
      if (!macHomePath) {
        setMacExistingPaths(new Set());
        return;
      }
      const candidates = [
        macHomePath,
        `${macHomePath}/Desktop`,
        `${macHomePath}/Documents`,
        `${macHomePath}/Downloads`,
        ...macCustomPresets.map((preset) => preset.path),
      ];
      const unique = [...new Set(candidates.map(normalizeFolderPath))];
      const existing = new Set<string>();
      await Promise.all(
        unique.map(async (path) => {
          try {
            const ok = await invoke<boolean>("local_path_is_dir", { path });
            if (ok) existing.add(path);
          } catch {
            /* skip */
          }
        }),
      );
      if (!cancelled) setMacExistingPaths(existing);
    }
    void refreshMacPlaces();
    return () => {
      cancelled = true;
    };
  }, [macHomePath, macCustomPresets, placeRefreshTick]);

  useEffect(() => {
    localStorage.setItem(PHONE_DEFAULT_FOLDER_KEY, phoneDefaultFolder);
  }, [phoneDefaultFolder]);

  useEffect(() => {
    saveCustomPresets(PHONE_PRESETS_KEY, phoneCustomPresets);
  }, [phoneCustomPresets]);

  useEffect(() => {
    saveCustomPresets(MAC_PRESETS_KEY, macCustomPresets);
  }, [macCustomPresets]);

  useEffect(() => {
    let cancelled = false;
    void invoke<string>("mac_home_folder")
      .then((home) => {
        if (!cancelled) setMacHomePath(home);
      })
      .catch(() => {
        if (!cancelled) setMacHomePath("");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const phoneBuiltInPlaces: PlaceMarkItem[] = [
    { id: "phone-internal", label: "Internal storage", path: storageRoot },
    { id: "phone-camera", label: "Camera", path: `${storageRoot}/DCIM/Camera` },
    {
      id: "phone-screenshots",
      label: "Screenshots",
      path: `${storageRoot}/DCIM/Screenshots`,
    },
    { id: "phone-downloads", label: "Downloads", path: `${storageRoot}/Download` },
  ];
  /**
   * Deleted/renamed custom folders left dead chips; always-showing them was wrong for
   * reconnect too. Keep customs in Settings/storage; only show a chip when that path
   * exists on the connected phone (reappears after reconnect if restored). Optimistic
   * add still marks the path existing so + does not flash-hide.
   */
  const phonePlaceMarks: PlaceMarkItem[] = [
    ...phoneBuiltInPlaces.filter((place) => phoneExistingPaths.has(place.path)),
    ...phoneCustomPresets
      .filter((preset) =>
        phoneExistingPaths.has(normalizeFolderPath(preset.path)),
      )
      .map((preset) => ({
        id: `phone-custom-${preset.path}`,
        label: preset.label,
        path: normalizeFolderPath(preset.path),
        removable: true,
      })),
  ];

  const macBuiltInPlaces: PlaceMarkItem[] = macHomePath
    ? [
        { id: "mac-home", label: "Home", path: normalizeFolderPath(macHomePath) },
        {
          id: "mac-desktop",
          label: "Desktop",
          path: normalizeFolderPath(`${macHomePath}/Desktop`),
        },
        {
          id: "mac-documents",
          label: "Documents",
          path: normalizeFolderPath(`${macHomePath}/Documents`),
        },
        {
          id: "mac-downloads",
          label: "Downloads",
          path: normalizeFolderPath(`${macHomePath}/Downloads`),
        },
      ]
    : [];
  /**
   * Same as phone: hide missing Mac custom chips; keep the saved preset.
   */
  const macPlaceMarks: PlaceMarkItem[] = [
    ...macBuiltInPlaces.filter((place) => macExistingPaths.has(place.path)),
    ...macCustomPresets
      .filter((preset) => macExistingPaths.has(normalizeFolderPath(preset.path)))
      .map((preset) => ({
        id: `mac-custom-${preset.path}`,
        label: preset.label,
        path: normalizeFolderPath(preset.path),
        removable: true,
      })),
  ];

  function addPhonePresetFromCurrent() {
    if (!selectedDevice) {
      setError("Connect a phone first, then add a folder preset.");
      return;
    }
    /**
     * Selecting DCIM/Music then + used to save Internal storage (the open parent),
     * which is already a built-in — so every add said “already a preset” while Settings
     * stayed empty. Prefer one selected folder (list/icons/columns/search); else the
     * open folder.
     */
    const columnEntries = Array.from(columnFiles.values()).flat();
    const path = resolvePresetTargetPath(
      currentPath,
      Array.from(selectedFiles),
      [...files, ...searchResults, ...columnEntries],
    );
    if (!path) {
      setError("Open a phone folder first, then add it as a preset.");
      return;
    }
    const builtInPlace = phoneBuiltInPlaces.find((place) =>
      sameFolderPath(place.path, path),
    );
    if (builtInPlace) {
      setError(
        `“${builtInPlace.label}” is already pinned. Open or select a subfolder (for example DCIM or Music), then press +.`,
      );
      return;
    }
    const duplicate = phoneCustomPresets.some((preset) =>
      sameFolderPath(preset.path, path),
    );
    const label = presetPathLeaf(path, "Folder");
    if (duplicate) {
      setError(`“${label}” is already in your phone presets.`);
      return;
    }
    if (phoneCustomPresets.length >= MAX_CUSTOM_PRESETS) {
      setError(`You can save up to ${MAX_CUSTOM_PRESETS} phone presets.`);
      return;
    }
    setPhoneCustomPresets((prev) => [...prev, { label, path }]);
    setPhoneExistingPaths((prev) => new Set(prev).add(path));
    setPlaceRefreshTick((tick) => tick + 1);
    setSuccessMessage(`Saved “${label}” as a phone preset.`);
  }

  function removePhonePreset(path: string) {
    const normalized = normalizeFolderPath(path);
    setPhoneCustomPresets((prev) =>
      prev.filter((preset) => normalizeFolderPath(preset.path) !== normalized),
    );
  }

  function addMacPresetFromCurrent() {
    const path = resolvePresetTargetPath(
      macPath,
      Array.from(macSelected),
      macFiles,
    );
    if (!path) {
      setError("Open a Mac folder first, then add it as a preset.");
      return;
    }
    const builtInPlace = macBuiltInPlaces.find((place) =>
      sameFolderPath(place.path, path),
    );
    if (builtInPlace) {
      setError(
        `“${builtInPlace.label}” is already pinned. Open or select a subfolder, then press +.`,
      );
      return;
    }
    const duplicate = macCustomPresets.some((preset) =>
      sameFolderPath(preset.path, path),
    );
    const label = presetPathLeaf(path, "Folder");
    if (duplicate) {
      setError(`“${label}” is already in your Mac presets.`);
      return;
    }
    if (macCustomPresets.length >= MAX_CUSTOM_PRESETS) {
      setError(`You can save up to ${MAX_CUSTOM_PRESETS} Mac presets.`);
      return;
    }
    setMacCustomPresets((prev) => [...prev, { label, path }]);
    setMacExistingPaths((prev) => new Set(prev).add(path));
    setPlaceRefreshTick((tick) => tick + 1);
    setSuccessMessage(`Saved “${label}” as a Mac preset.`);
  }

  function removeMacPreset(path: string) {
    const normalized = normalizeFolderPath(path);
    setMacCustomPresets((prev) =>
      prev.filter((preset) => normalizeFolderPath(preset.path) !== normalized),
    );
  }

  return {
    phoneDefaultFolder,
    setPhoneDefaultFolder,
    phoneCustomPresets,
    macCustomPresets,
    phoneDefaultMenuOpen,
    setPhoneDefaultMenuOpen,
    phoneDefaultPickerRef,
    phonePlaceMarks,
    macPlaceMarks,
    addPhonePresetFromCurrent,
    removePhonePreset,
    addMacPresetFromCurrent,
    removeMacPreset,
  };
}
