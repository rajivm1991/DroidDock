/**
 * Finder and Explorer ask before overwriting; Copy between phone and Mac needs the
 * same guardrails without surfacing every sync power-user rule. This module covers
 * a pre-transfer bulk dialog, a per-item dialog, and a separate confirmation before
 * any folder is permanently replaced. Files get Skip, Replace, Keep both, or Ask for
 * each; folders get Merge, Replace, Keep both, Skip, or Ask for each; file-vs-folder
 * clashes get Skip or Keep both. Per-item mode can apply the choice to the rest of
 * this transfer (off by default so Ask for each really asks each). Remember for next
 * time appears only when a bulk file choice is selected — not while Ask for each is
 * on. There is no size/date compare, overwrite-if-newer, or Folder Sync actions.
 *
 * Continue stays disabled briefly after open so Enter or click-through from a prior
 * dialog (e.g. Download Options) cannot confirm before the person picks an option.
 */

import { useEffect, useId, useRef, useState } from "react";
import type {
  FileConflictAction,
  FolderConflictAction,
  MismatchAction,
  TransferConflictPolicy,
} from "../../lib/transferConflicts";

export type ConflictDialogMode = "preflight" | "perItem";

export interface PerItemConflict {
  displayName: string;
  /**
   * file: name taken by a file; unknown: the phone could not say;
   * folder: folder name taken by a folder; mismatch: file vs folder.
   */
  kind: "file" | "unknown" | "folder" | "mismatch";
  detail?: string;
}

interface TransferConflictDialogProps {
  mode: ConflictDialogMode;
  /** Lines such as “N of M files already exist…” and the folder count. */
  summary: string[];
  hasFolderConflicts: boolean;
  hasFileConflicts: boolean;
  hasTypeMismatch: boolean;
  perItem?: PerItemConflict;
  initialFileAction: FileConflictAction;
  initialFolderAction: FolderConflictAction;
  showRemember: boolean;
  onCancel: () => void;
  onConfirm: (policy: TransferConflictPolicy, applyToRemaining: boolean) => void;
}

const FILE_OPTIONS: {
  value: FileConflictAction;
  label: string;
  hint: string;
}[] = [
  {
    value: "skip",
    label: "Skip duplicates",
    hint: "Files that already exist are left alone",
  },
  {
    value: "replace",
    label: "Replace",
    hint: "Files that already exist are overwritten once the new copy finishes",
  },
  {
    value: "keepBoth",
    label: "Keep both",
    hint: 'Duplicates are saved as "name (1).ext"',
  },
  {
    value: "ask",
    label: "Ask for each file",
    hint: "Choose Skip / Replace / Keep both for each conflict before any copy starts",
  },
];

const FOLDER_OPTIONS: {
  value: FolderConflictAction;
  label: string;
  hint: string;
}[] = [
  {
    value: "merge",
    label: "Merge folders",
    hint: "Add into the existing folder; same-named files follow the choice above",
  },
  {
    value: "replace",
    label: "Replace folders",
    hint: "Permanently delete the existing folder, then copy the new one (you confirm next)",
  },
  {
    value: "keepBoth",
    label: "Keep both folders",
    hint: 'The new folder is saved as "name (1)"',
  },
  {
    value: "skip",
    label: "Skip folders",
    hint: "Leave existing folders alone; skip their contents in this copy",
  },
  {
    value: "ask",
    label: "Ask for each folder",
    hint: "Choose for each folder before any copy starts",
  },
];

const MISMATCH_OPTIONS: {
  value: MismatchAction;
  label: string;
  hint: string;
}[] = [
  {
    value: "skip",
    label: "Skip",
    hint: "Leave what is there; do not copy this item",
  },
  {
    value: "keepBoth",
    label: "Keep both",
    hint: 'Copy the incoming item under a new name, like "name (1)"',
  },
];

/** Ignore Enter / primary click for this long after open (modal click-through). */
const ARM_CONTINUE_MS = 450;

/** Continue is unarmed briefly after mount; the shell (not Continue) gets focus. */
function useArmedContinue() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    const timer = window.setTimeout(() => setArmed(true), ARM_CONTINUE_MS);
    dialogRef.current?.focus();
    return () => window.clearTimeout(timer);
  }, []);
  return { dialogRef, armed };
}

export function TransferConflictDialog({
  mode,
  summary,
  hasFolderConflicts,
  hasFileConflicts,
  hasTypeMismatch,
  perItem,
  initialFileAction,
  initialFolderAction,
  showRemember,
  onCancel,
  onConfirm,
}: TransferConflictDialogProps) {
  const titleId = useId();
  const { dialogRef, armed: continueArmed } = useArmedContinue();
  const [fileAction, setFileAction] = useState<FileConflictAction>(() => {
    if (mode === "perItem" && initialFileAction === "ask") return "skip";
    return initialFileAction;
  });
  const [folderAction, setFolderAction] = useState<FolderConflictAction>(() => {
    if (mode === "perItem" && initialFolderAction === "ask") return "merge";
    return initialFolderAction;
  });
  // Always starts on a visible option (Skip) so Continue means the same thing
  // in preflight and in a mid-copy surprise.
  const [mismatchAction, setMismatchAction] = useState<MismatchAction>("skip");
  const [applyToRemaining, setApplyToRemaining] = useState(false);
  const [remember, setRemember] = useState(false);

  const perItemKind = perItem?.kind;
  const title =
    mode === "preflight"
      ? "Items already exist"
      : perItemKind === "folder"
        ? "Folder already exists"
        : perItemKind === "mismatch"
          ? "Name conflict"
          : perItemKind === "unknown"
            ? "Could not check this name"
            : "File already exists";

  const showFileOptions =
    mode === "preflight"
      ? hasFileConflicts || hasFolderConflicts
      : perItemKind === "file" || perItemKind === "unknown";

  const showFolderOptions =
    mode === "preflight" ? hasFolderConflicts : perItemKind === "folder";

  // In preflight, mismatches get their own bulk choice unless every conflict
  // is going to be asked one by one anyway.
  const showMismatchOptions =
    mode === "preflight"
      ? hasTypeMismatch && fileAction !== "ask"
      : perItemKind === "mismatch";

  const fileOptionsForUi =
    mode === "perItem" ? FILE_OPTIONS.filter((o) => o.value !== "ask") : FILE_OPTIONS;

  const folderOptionsForUi =
    mode === "perItem"
      ? FOLDER_OPTIONS.filter((o) => o.value !== "ask")
      : FOLDER_OPTIONS;

  const rememberVisible = showRemember && showFileOptions && fileAction !== "ask";

  function confirm() {
    if (!continueArmed) return;
    const policy: TransferConflictPolicy = {
      fileAction: showFileOptions ? fileAction : "skip",
      folderAction: showFolderOptions ? folderAction : "merge",
      mismatchAction,
      remember: rememberVisible && remember,
    };
    onConfirm(policy, mode === "perItem" ? applyToRemaining : true);
  }

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog download-options-dialog transfer-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>{title}</h3>
        {summary.map((line) => (
          <p key={line} className="download-options-summary">
            {line}
          </p>
        ))}
        {perItem?.detail ? (
          <p className="download-options-summary">{perItem.detail}</p>
        ) : null}

        {showFileOptions ? (
          <div className="conflict-options">
            {mode === "preflight" ? (
              <p className="conflict-section-label">When a file already exists</p>
            ) : null}
            {fileOptionsForUi.map(({ value, label, hint }) => (
              <label
                key={value}
                className={`conflict-option ${fileAction === value ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="file-conflict-action"
                  value={value}
                  checked={fileAction === value}
                  onChange={() => setFileAction(value)}
                />
                <span className="conflict-option-label">{label}</span>
                <span className="conflict-option-hint">{hint}</span>
              </label>
            ))}
          </div>
        ) : null}

        {showFolderOptions ? (
          <div className="conflict-options">
            <p className="conflict-section-label">When a folder already exists</p>
            {folderOptionsForUi.map(({ value, label, hint }) => (
              <label
                key={value}
                className={`conflict-option ${folderAction === value ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="folder-conflict-action"
                  value={value}
                  checked={folderAction === value}
                  onChange={() => setFolderAction(value)}
                />
                <span className="conflict-option-label">{label}</span>
                <span className="conflict-option-hint">{hint}</span>
              </label>
            ))}
          </div>
        ) : null}

        {showMismatchOptions ? (
          <div className="conflict-options">
            {mode === "preflight" ? (
              <p className="conflict-section-label">
                When a file and a folder share a name
              </p>
            ) : null}
            {MISMATCH_OPTIONS.map(({ value, label, hint }) => (
              <label
                key={value}
                className={`conflict-option ${mismatchAction === value ? "active" : ""}`}
              >
                <input
                  type="radio"
                  name="mismatch-conflict-action"
                  value={value}
                  checked={mismatchAction === value}
                  onChange={() => setMismatchAction(value)}
                />
                <span className="conflict-option-label">{label}</span>
                <span className="conflict-option-hint">{hint}</span>
              </label>
            ))}
          </div>
        ) : null}

        {mode === "perItem" ? (
          <label className="reveal-option">
            <input
              type="checkbox"
              checked={applyToRemaining}
              onChange={(e) => setApplyToRemaining(e.target.checked)}
            />
            <span>Use this for the rest of this transfer</span>
          </label>
        ) : null}

        {rememberVisible ? (
          <label className="reveal-option">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember file choice for next time</span>
          </label>
        ) : null}

        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="download-btn"
            disabled={!continueArmed}
            aria-disabled={!continueArmed}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Replace folders permanently deletes the whole destination folder, including files
 * this copy will never restore — a single radio click was too easy a path to that.
 * This dialog lists each affected folder and only the warnings that apply. Cancel
 * aborts the copy; actual deletion runs later, after the transfer queue accepts the
 * job. It does not delete anything itself, move items to Trash, or offer per-folder
 * toggles.
 */
export function ReplaceFoldersConfirmDialog({
  folders,
  where,
  warnings,
  onCancel,
  onConfirm,
}: {
  folders: string[];
  /** “on This Mac” / “on the phone”. */
  where: string;
  warnings: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const { dialogRef, armed } = useArmedContinue();
  const listed =
    folders.length === 1
      ? `“${folders[0]}”`
      : `${folders.length} folders (${folders.map((f) => `“${f}”`).join(", ")})`;

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog download-options-dialog transfer-conflict-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>Permanently replace folders?</h3>
        <p className="download-options-summary">
          {listed} {where} will be permanently deleted with everything inside,
          then the copy starts. This cannot be undone and the old contents do not
          go to the Trash.
        </p>
        <p className="download-options-summary conflict-warning">
          Anything in the old folder that is not part of this copy will be lost.
          If the copy is stopped or fails part-way, the new folder is left
          incomplete.
        </p>
        {warnings.map((line) => (
          <p key={line} className="download-options-summary conflict-warning">
            {line}
          </p>
        ))}
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (armed) onConfirm();
            }}
            className="confirm-delete-btn"
            disabled={!armed}
            aria-disabled={!armed}
          >
            Delete and replace
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A drop from Finder always copies into the open phone folder, even when files land
 * on the This Mac pane — without a heads-up it looks like the app ignored the drop
 * target. First-time tip names that phone folder (same leaf label as the Copy
 * buttons), with Continue, Cancel, and opt-in Don't show again. Continue passes the
 * checkbox (default off) to the caller for persistence; Cancel, Escape, or backdrop
 * dismiss copies nothing. Continue arms after the same short delay as conflict
 * dialogs. Copy text points people at in-app drag onto the other pane and the Copy
 * buttons; it does not persist settings, pick a pane, or handle Mac-to-Mac copies.
 */
export function FinderDropTipDialog({
  folderLabel,
  onCancel,
  onContinue,
}: {
  folderLabel: string;
  onCancel: () => void;
  onContinue: (dontShowAgain: boolean) => void;
}) {
  const titleId = useId();
  const { dialogRef, armed } = useArmedContinue();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal-dialog download-options-dialog transfer-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId}>Copy to “{folderLabel}” on the phone?</h3>
        <p className="download-options-summary">
          Files dragged in from Finder always go to the phone, into the folder
          open in the phone pane (“{folderLabel}”), even if you drop them on the
          This Mac side. They are never copied to This Mac.
        </p>
        <p className="download-options-summary">
          To copy between your Mac and phone inside DroidDock, drag a file onto
          the other pane, or use the Copy buttons. For Mac-to-Mac copies, use
          Finder.
        </p>
        <label className="reveal-option">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don't show again</span>
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} className="cancel-btn">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (armed) onContinue(dontShowAgain);
            }}
            className="download-btn"
            disabled={!armed}
            aria-disabled={!armed}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
