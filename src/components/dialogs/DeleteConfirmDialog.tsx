/**
 * Asks before deleting the phone selection. The parent opens it and runs the
 * delete.
 */
import type { SetStateAction } from "react";

export interface DeleteConfirmDialogProps {
  selectedFiles: Set<string>;
  setShowDeleteConfirm: (value: SetStateAction<boolean>) => void;
  deleting: boolean;
  performDelete: () => Promise<void>;
}

export function DeleteConfirmDialog({
  selectedFiles,
  setShowDeleteConfirm,
  deleting,
  performDelete,
}: DeleteConfirmDialogProps) {
  return (
    <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Confirm Deletion</h3>
        <p>
          Are you sure you want to delete {selectedFiles.size} item(s)?
        </p>
        <p className="warning-text">
          This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button
            onClick={() => setShowDeleteConfirm(false)}
            disabled={deleting}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button
            onClick={performDelete}
            disabled={deleting}
            className="confirm-delete-btn"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
