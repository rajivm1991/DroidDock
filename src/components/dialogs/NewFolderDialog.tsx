/**
 * Name prompt for a new folder on the phone or on This Mac. The parent decides
 * when it is open and creates the folder.
 */
import type { RefObject } from "react";

export interface NewFolderDialogProps {
  newFolderDialog: { side: "phone" | "mac" };
  setNewFolderDialog: (value: null) => void;
  newFolderName: string;
  setNewFolderName: (value: string) => void;
  newFolderBusy: boolean;
  newFolderInputRef: RefObject<HTMLInputElement | null>;
  confirmNewFolder: () => Promise<void>;
}

export function NewFolderDialog({
  newFolderDialog,
  setNewFolderDialog,
  newFolderName,
  setNewFolderName,
  newFolderBusy,
  newFolderInputRef,
  confirmNewFolder,
}: NewFolderDialogProps) {
  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!newFolderBusy) setNewFolderDialog(null);
      }}
    >
      {/*
        Both panes need an in-app mkdir without leaving for Finder/ADB. Name field
        + Create in the open folder on that side. Does not nest under the
        right-clicked row — always the open directory.
      */}
      <div
        className="modal-dialog new-folder-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-folder-title"
      >
        <h3 id="new-folder-title">New folder</h3>
        <p>
          Creates a folder in{" "}
          {newFolderDialog.side === "phone" ? "the open phone folder" : "the open Mac folder"}
          .
        </p>
        <input
          ref={newFolderInputRef}
          type="text"
          className="new-folder-input"
          value={newFolderName}
          disabled={newFolderBusy}
          aria-label="Folder name"
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmNewFolder();
            }
          }}
        />
        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            disabled={newFolderBusy}
            onClick={() => setNewFolderDialog(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-btn"
            disabled={newFolderBusy || !newFolderName.trim()}
            onClick={() => void confirmNewFolder()}
          >
            {newFolderBusy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
