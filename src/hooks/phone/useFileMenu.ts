/**
 * Where the right-click menu is, and what it was opened on. Phone and Mac
 * rows and empty space all come through here. Open in Finder and Copy path
 * run here; FileContextMenu draws the menu. A right-click restores the
 * selection that was in place when the button went down, and does not clear
 * a multi-selection on its own.
 */
import { SetStateAction, useState } from "react";
import { type FileEntry } from "../../lib/file-types";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

export interface UseFileMenuArgs {
  selectedDevice: string;
  currentPath: string;
  setError: (value: SetStateAction<string>) => void;
  macPath: string;
  setActivePane: (value: SetStateAction<"phone" | "mac">) => void;
  applyContextMenuRowSelection: (side: "phone" | "mac", fileName: string) => void;
}

export function useFileMenu({
  selectedDevice,
  currentPath,
  setError,
  macPath,
  setActivePane,
  applyContextMenuRowSelection,
}: UseFileMenuArgs) {
  const [fileMenu, setFileMenu] = useState<{
    x: number;
    y: number;
    name: string;
    isDirectory: boolean;
    side: "phone" | "mac";
    /** Folder of the Columns pane the row sits in, when it was in Columns. */
    dir?: string;
  } | null>(null);

  /**
   * Right-click after Cmd+A / multi-select collapsed to one row, so Copy and Delete
   * only acted on that file. A WebView click can wipe the set before this handler runs.
   * Restore from the mousedown snapshot when the row was selected; otherwise select
   * only that row (Finder-style). Does not clear Mac selection beyond the
   * exclusive-selection effect.
   */
  function openFileMenu(event: React.MouseEvent, file: FileEntry) {
    event.preventDefault();
    event.stopPropagation();
    setActivePane("phone");
    applyContextMenuRowSelection("phone", file.name);
    const columnDir =
      event.target instanceof Element
        ? event.target.closest(".column-list")?.getAttribute("data-column-path") ??
          undefined
        : undefined;
    setFileMenu({
      x: event.clientX,
      y: event.clientY,
      name: file.name,
      isDirectory: file.is_directory,
      side: "phone",
      dir: columnDir,
    });
  }

  /**
   * New folder should work from empty list space, not only on a row. Phone empty-canvas
   * context menu with New folder only. Does not change selection or invent a target
   * outside the open folder.
   */
  function openPhoneEmptyMenu(event: React.MouseEvent) {
    if (!selectedDevice || !currentPath) return;
    event.preventDefault();
    event.stopPropagation();
    setFileMenu({
      x: event.clientX,
      y: event.clientY,
      name: "",
      isDirectory: true,
      side: "phone",
    });
  }

  /**
   * Mac rows showed the WebView/OS context menu instead of DroidDock’s; right-click
   * after multi-select also collapsed to one name (same as phone). In-app menu; restore
   * multi-selection from the mousedown snapshot when the row was selected, otherwise
   * select only that row. Copy uses the set. Does not change Open in Finder / Copy
   * absolute path — those still use the right-clicked name.
   */
  function openMacFileMenu(event: React.MouseEvent, file: FileEntry) {
    event.preventDefault();
    event.stopPropagation();
    setActivePane("mac");
    applyContextMenuRowSelection("mac", file.name);
    setFileMenu({
      x: event.clientX,
      y: event.clientY,
      name: file.name,
      isDirectory: file.is_directory,
      side: "mac",
    });
  }

  /**
   * Parity with phone — New folder from empty Mac list space. Does not show Copy when
   * nothing is selected.
   */
  function openMacEmptyMenu(event: React.MouseEvent) {
    if (!macPath) return;
    event.preventDefault();
    event.stopPropagation();
    setFileMenu({
      x: event.clientX,
      y: event.clientY,
      name: "",
      isDirectory: true,
      side: "mac",
    });
  }

  /**
   * Mac menu had copy only; people still need the same item in Finder (the Mac file
   * browser) without leaving DroidDock to hunt for it. Context “Open in Finder” for the
   * right-clicked Mac row. Join the open Mac folder + name, then reveal_in_finder
   * (folder opens; file is selected in its parent). Does not change DroidDock’s folder
   * or copy.
   */
  async function openMacSelectionInFinder(name: string) {
    if (!macPath) {
      setError("Open a Mac folder first, then try Open in Finder.");
      return;
    }
    try {
      const fullPath = await join(macPath, name);
      await invoke("reveal_in_finder", { path: fullPath });
    } catch (err) {
      setError(`Could not open in Finder: ${err}`);
    }
  }

  /**
   * Pasting the file somewhere else needs the full path; the list only shows the name.
   * Context “Copy absolute path” for the right-clicked Mac row. Join the open Mac
   * folder and the name, then put that string on the clipboard. Does not open Finder,
   * start a transfer, or copy a relative or phone path.
   */
  async function copyMacAbsolutePath(name: string) {
    if (!macPath) {
      setError("Open a Mac folder first, then try Copy absolute path.");
      return;
    }
    try {
      const fullPath = await join(macPath, name);
      await navigator.clipboard.writeText(fullPath);
    } catch (err) {
      setError(`Could not copy path: ${err}`);
    }
  }

  /**
   * Ctrl+Return opens the same menu as a right-click, anchored on the named
   * row in the active pane. Restores multi-selection when that row was already
   * selected; otherwise selects only that name. Empty name opens the
   * New-folder-only empty menu.
   */
  function openFileMenuAt(
    side: "phone" | "mac",
    x: number,
    y: number,
    name: string,
    isDirectory: boolean,
  ) {
    setActivePane(side);
    if (name) {
      applyContextMenuRowSelection(side, name);
    }
    setFileMenu({ x, y, name, isDirectory, side });
  }

  return {
    fileMenu,
    setFileMenu,
    openFileMenu,
    openPhoneEmptyMenu,
    openMacFileMenu,
    openMacEmptyMenu,
    openFileMenuAt,
    openMacSelectionInFinder,
    copyMacAbsolutePath,
  };
}
