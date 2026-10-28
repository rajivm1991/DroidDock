/**
 * Shown while a copy is being checked for name clashes and no question is up
 * yet. Cancel sets the flag the transfer flow reads before it asks anything
 * or starts copying.
 */
import type { RefObject, SetStateAction } from "react";

export interface TransferFlowBusySheetProps {
  setTransferFlowStatus: (value: SetStateAction<string>) => void;
  transferFlowStatus: string;
  transferFlowAbortRef: RefObject<boolean>;
}

export function TransferFlowBusySheet({
  setTransferFlowStatus,
  transferFlowStatus,
  transferFlowAbortRef,
}: TransferFlowBusySheetProps) {
  return (
    <div className="modal-overlay">
      <div
        className="modal-dialog download-options-dialog"
        role="dialog"
        aria-modal="true"
        aria-live="polite"
      >
        <p className="download-options-summary">
          {transferFlowStatus || "Checking for existing files…"}
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => {
              transferFlowAbortRef.current = true;
              setTransferFlowStatus("Cancelling…");
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
