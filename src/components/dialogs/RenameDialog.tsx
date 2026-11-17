/**
 * Name prompt for renaming one phone item from the selection strip. Used where
 * there is no inline rename field (Icons and Columns). The parent owns the
 * target and performs the rename.
 */
import { useEffect, useRef } from "react";

export interface RenameDialogProps {
  /** Current name of the item being renamed. */
  name: string;
  value: string;
  setValue: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RenameDialog({
  name,
  value,
  setValue,
  busy,
  onCancel,
  onConfirm,
}: RenameDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const unchanged = value.trim() === name;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="modal-dialog new-folder-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
      >
        <h3 id="rename-title">Rename</h3>
        <input
          ref={inputRef}
          type="text"
          className="new-folder-input"
          value={value}
          disabled={busy}
          aria-label="New name"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !busy && value.trim() && !unchanged) {
              e.preventDefault();
              onConfirm();
            } else if (e.key === "Escape" && !busy) {
              e.preventDefault();
              onCancel();
            }
          }}
        />
        <div className="modal-actions">
          <button type="button" className="cancel-btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-btn"
            disabled={busy || !value.trim() || unchanged}
            onClick={onConfirm}
          >
            {busy ? "Renaming…" : "Rename"}
          </button>
        </div>
      </div>
    </div>
  );
}
