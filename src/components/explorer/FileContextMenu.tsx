/**
 * Connects the shared right-click menu to the actions the shell already has.
 * It is mounted only while a menu target is set. Which items appear, and what
 * they do, stay with the file-menu hook.
 */
import type { SetStateAction } from "react";
import { FileMenu } from "./FileMenu";

export interface FileContextMenuProps {
  selectedDevice: string;
  currentPath: string;
  setShowDeleteConfirm: (value: SetStateAction<boolean>) => void;
  fileMenu: { x: number; y: number; name: string; isDirectory: boolean; side: "phone" | "mac"; dir?: string; };
  setFileMenu: (value: SetStateAction<{ x: number; y: number; name: string; isDirectory: boolean; side: "phone" | "mac"; dir?: string; } | null>) => void;
  macPath: string;
  beginRename: (name: string, dir?: string) => void;
  copyPhoneToMacLabel: () => string;
  copyMacToPhoneLabel: () => string;
  copyPhoneSelectionToMac: () => void;
  copyMacSelectionToPhone: () => void;
  previewFile: (fileName: string) => void;
  openMacSelectionInFinder: (name: string) => Promise<void>;
  copyMacAbsolutePath: (name: string) => Promise<void>;
  openNewFolderDialog: (side: "phone" | "mac") => void;
}

export function FileContextMenu({
  selectedDevice,
  currentPath,
  setShowDeleteConfirm,
  fileMenu,
  setFileMenu,
  macPath,
  beginRename,
  copyPhoneToMacLabel,
  copyMacToPhoneLabel,
  copyPhoneSelectionToMac,
  copyMacSelectionToPhone,
  previewFile,
  openMacSelectionInFinder,
  copyMacAbsolutePath,
  openNewFolderDialog,
}: FileContextMenuProps) {
  return (
    <FileMenu
      x={fileMenu.x}
      y={fileMenu.y}
      side={fileMenu.side}
      isDirectory={fileMenu.isDirectory}
      copyLabel={
        fileMenu.side === "phone" ? copyPhoneToMacLabel() : copyMacToPhoneLabel()
      }
      onClose={() => setFileMenu(null)}
      onCopy={
        fileMenu.name &&
        (fileMenu.side === "phone" || selectedDevice)
          ? () => {
              const side = fileMenu.side;
              setFileMenu(null);
              if (side === "phone") copyPhoneSelectionToMac();
              else copyMacSelectionToPhone();
            }
          : undefined
      }
      onNewFolder={
        fileMenu.side === "phone"
          ? selectedDevice && currentPath
            ? () => {
                setFileMenu(null);
                openNewFolderDialog("phone");
              }
            : undefined
          : macPath
            ? () => {
                setFileMenu(null);
                openNewFolderDialog("mac");
              }
            : undefined
      }
      onPreview={
        fileMenu.side === "phone" && fileMenu.name && !fileMenu.isDirectory
          ? () => {
              const name = fileMenu.name;
              setFileMenu(null);
              previewFile(name);
            }
          : undefined
      }
      onRename={
        fileMenu.side === "phone" && fileMenu.name
          ? () => {
              const { name, dir } = fileMenu;
              setFileMenu(null);
              beginRename(name, dir);
            }
          : undefined
      }
      onDelete={
        fileMenu.side === "phone" && fileMenu.name
          ? () => {
              setFileMenu(null);
              setShowDeleteConfirm(true);
            }
          : undefined
      }
      onOpenInFinder={
        fileMenu.side === "mac" && fileMenu.name
          ? () => {
              const name = fileMenu.name;
              setFileMenu(null);
              void openMacSelectionInFinder(name);
            }
          : undefined
      }
      onCopyAbsolutePath={
        fileMenu.side === "mac" && fileMenu.name
          ? () => {
              const name = fileMenu.name;
              setFileMenu(null);
              void copyMacAbsolutePath(name);
            }
          : undefined
      }
    />
  );
}
