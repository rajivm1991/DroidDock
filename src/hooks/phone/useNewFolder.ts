/**
 * New-folder prompt: which pane, the typed name, and the create call into the
 * folder that pane has open. NewFolderDialog draws it. The caller decides
 * which folders are allowed to receive one.
 */
import { SetStateAction, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UseNewFolderArgs {
  selectedDevice: string;
  currentPath: string;
  setPlaceRefreshTick: (value: SetStateAction<number>) => void;
  setError: (value: SetStateAction<string>) => void;
  macPath: string;
  setMacRefresh: (value: SetStateAction<number>) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  loadFiles: () => Promise<void>;
}

export function useNewFolder({
  selectedDevice,
  currentPath,
  setPlaceRefreshTick,
  setError,
  macPath,
  setMacRefresh,
  setSuccessMessage,
  loadFiles,
}: UseNewFolderArgs) {
  const [newFolderDialog, setNewFolderDialog] = useState<{
    side: "phone" | "mac";
  } | null>(null);
  const [newFolderName, setNewFolderName] = useState("Untitled folder");
  const [newFolderBusy, setNewFolderBusy] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  /**
   * Both panes needed a way to make a folder without leaving for Finder/ADB. Context
   * “New folder” → name dialog → create in the open directory. Does not create inside
   * the right-clicked row (always the open folder).
   */
  function openNewFolderDialog(side: "phone" | "mac") {
    setNewFolderName("Untitled folder");
    setNewFolderDialog({ side });
    window.setTimeout(() => {
      newFolderInputRef.current?.focus();
      newFolderInputRef.current?.select();
    }, 0);
  }

  async function confirmNewFolder() {
    if (!newFolderDialog || newFolderBusy) return;
    const name = newFolderName.trim();
    if (!name) {
      setError("Enter a folder name.");
      return;
    }
    setNewFolderBusy(true);
    try {
      if (newFolderDialog.side === "phone") {
        if (!selectedDevice || !currentPath) {
          setError("Open a phone folder first.");
          return;
        }
        await invoke<string>("create_phone_folder", {
          deviceId: selectedDevice,
          parentPath: currentPath,
          name,
        });
        await loadFiles();
      } else {
        if (!macPath) {
          setError("Open a Mac folder first.");
          return;
        }
        await invoke<string>("create_local_folder", {
          parentPath: macPath,
          name,
        });
        setMacRefresh((tick) => tick + 1);
      }
      setPlaceRefreshTick((tick) => tick + 1);
      setNewFolderDialog(null);
      setSuccessMessage(`Created “${name}”.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setNewFolderBusy(false);
    }
  }

  return {
    newFolderDialog,
    setNewFolderDialog,
    newFolderName,
    setNewFolderName,
    newFolderBusy,
    newFolderInputRef,
    openNewFolderDialog,
    confirmNewFolder,
  };
}
