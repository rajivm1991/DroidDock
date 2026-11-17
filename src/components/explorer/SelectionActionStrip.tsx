/**
 * Per-pane selection actions above that pane’s file list. Clear selection, then
 * directional Copy with a descriptive label, then Preview and Delete as a paired
 * icon group beside Copy. Each pane keeps a same-height slot (placeholder when
 * idle) so the list does not jump. Icons use aria-label and tooltips, not emoji.
 * File count and size stay on the status bar; Sync and device chrome live elsewhere.
 */

export type SelectionActionSide = "phone" | "mac";

interface SelectionActionStripProps {
  side: SelectionActionSide;
  /** Phone only: Preview when exactly one file is selected. */
  showPreview?: boolean;
  previewLoading?: boolean;
  copyLabel: string;
  copyDisabled: boolean;
  copying: boolean;
  /** Phone only: Rename when exactly one item is selected. */
  showRename?: boolean;
  showDelete?: boolean;
  deleteDisabled?: boolean;
  deleting?: boolean;
  onClear: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  /** Spotlight target id for the one-time tutorial overlay. */
  tutorialTarget?: string;
}

/** Same height as the action strip; holds the idle pane steady. */
export function SelectionActionStripPlaceholder({
  tutorialTarget,
}: {
  /** Spotlight target when the strip is idle (tutorial still points here). */
  tutorialTarget?: string;
} = {}) {
  return (
    <div
      className="selection-action-strip is-empty"
      aria-hidden
      data-tutorial={tutorialTarget}
    />
  );
}

function PreviewIcon() {
  return (
    <svg
      className="selection-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 5c-5 0-9.27 3.11-11 7.5C2.73 16.89 7 20 12 20s9.27-3.11 11-7.5C21.27 8.11 17 5 12 5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
      />
    </svg>
  );
}

function RenameIcon() {
  return (
    <svg
      className="selection-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg
      className="selection-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

export function SelectionActionStrip({
  side,
  showPreview = false,
  previewLoading = false,
  copyLabel,
  copyDisabled,
  copying,
  showRename = false,
  showDelete = false,
  deleteDisabled = false,
  deleting = false,
  onClear,
  onPreview,
  onRename,
  onCopy,
  onDelete,
  tutorialTarget,
}: SelectionActionStripProps) {
  const copyText = copying ? "Copying…" : copyLabel;
  const previewLabel = previewLoading ? "Loading preview…" : "Preview file";
  const deleteLabel = deleting ? "Deleting…" : "Delete";

  return (
    <div
      className="selection-action-strip"
      role="toolbar"
      aria-label={side === "phone" ? "Phone selection actions" : "Mac selection actions"}
      data-tutorial={tutorialTarget}
    >
      <button type="button" className="selection-action-btn clear-btn" onClick={onClear}>
        Clear selection
      </button>
      <button
        type="button"
        className="selection-action-btn copy-btn"
        onClick={onCopy}
        disabled={copyDisabled}
        title={copyLabel}
      >
        {side === "mac" && (
          <span className="selection-copy-dir" aria-hidden>
            ←
          </span>
        )}
        <span className="selection-copy-label">{copyText}</span>
        {side === "phone" && (
          <span className="selection-copy-dir" aria-hidden>
            →
          </span>
        )}
      </button>
      {(showPreview && onPreview) ||
      (showRename && onRename) ||
      (showDelete && onDelete) ? (
        <div className="selection-action-icon-group" role="group" aria-label="More actions">
          {showPreview && onPreview && (
            <button
              type="button"
              className="selection-action-btn selection-action-icon-btn preview-btn"
              onClick={onPreview}
              disabled={previewLoading}
              aria-label={previewLabel}
              title={previewLabel}
              data-tooltip={previewLabel}
            >
              <PreviewIcon />
            </button>
          )}
          {showRename && onRename && (
            <button
              type="button"
              className="selection-action-btn selection-action-icon-btn rename-btn"
              onClick={onRename}
              aria-label="Rename"
              title="Rename"
              data-tooltip="Rename"
            >
              <RenameIcon />
            </button>
          )}
          {showDelete && onDelete && (
            <button
              type="button"
              className="selection-action-btn selection-action-icon-btn delete-btn"
              onClick={onDelete}
              disabled={deleteDisabled || deleting}
              aria-label={deleteLabel}
              title={deleteLabel}
              data-tooltip={deleteLabel}
            >
              <DeleteIcon />
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
