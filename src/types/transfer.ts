/**
 * Shapes for copy conflicts, drop hover, and the queue plan. The transfer
 * hooks still decide what to do with a clash; this file only names the values
 * they pass around, plus the Finder-drop tip key.
 */

import type { PerItemConflict } from "../components/transfer/TransferConflictDialog";
import type { TransferConflictPolicy, TransferQueueItem } from "../lib/transferConflicts";

/** Live drop hover for overlay + Columns dim (Finder or in-app either way). */
export type DropHoverState = {
  target: "phone" | "mac";
  folderLabel: string;
  /**
   * True only over the destination open folder (List/Icons: whole opposite
   * pane; Columns: Open column). Drives copy vs not-allowed cursor.
   */
  allowed: boolean;
};

export interface FilePreview {
  file_type: string;  // "image", "text", or "unsupported"
  content: string;    // base64 for images, text content for text files
  size: number;       // file size in bytes
}

/** Last remembered file conflict choice (optional permanent preference). */
export type ConflictMode = "skip" | "replace" | "keepBoth";

/**
 * `id` changes per prompt so each dialog mounts fresh (choices, apply-to-rest,
 * and the Continue arm delay never carry over from the previous prompt).
 */
export type ConflictPromptState =
  | {
      id: number;
      mode: "preflight";
      summary: string[];
      hasFolderConflicts: boolean;
      hasFileConflicts: boolean;
      hasTypeMismatch: boolean;
    }
  | {
      id: number;
      mode: "perItem";
      summary: string[];
      perItem: PerItemConflict;
    }
  | {
      id: number;
      mode: "confirmReplace";
      folders: string[];
      where: string;
      warnings: string[];
    }
  | {
      id: number;
      mode: "finderDropTip";
      /** Leaf label of the open phone folder, same style as the Copy buttons. */
      folderLabel: string;
    };

export type ConflictPromptResult =
  | { kind: "preflight"; policy: TransferConflictPolicy | null }
  | {
      kind: "perItem";
      result: { policy: TransferConflictPolicy; applyToRemaining: boolean } | null;
    }
  | { kind: "confirmReplace"; ok: boolean }
  | { kind: "finderDropTip"; ok: boolean; dontShowAgain: boolean };

/** A destination folder to wipe — only after the queue accepts the job. */
export interface ReplaceFolderPlan {
  root: string;
  destPath: string;
}

/** Everything the queue needs once every conflict choice is made. */
export interface TransferPlan {
  items: TransferQueueItem[];
  /** Mode for files without a per-file entry. Never "ask". */
  fileAction: ConflictMode;
  perFileModes: Map<string, ConflictMode>;
  replaceFolders: ReplaceFolderPlan[];
}

/** A plan that still holds the transfer-flow lock until its job is accepted. */
export type LockedTransferPlan = TransferPlan & { lockToken: number };

/**
 * Set only when someone ticks "Don't show again" and presses Continue on the
 * Finder-drop tip. Cancel never writes it.
 */
export const FINDER_DROP_ACK_KEY = "droiddock-finder-drop-to-phone-ack";

/** One Mac item picked for upload (Mac pane selection or Finder drop). */
export interface UploadSource {
  name: string;
  localPath: string;
  isDirectory: boolean;
  size: number;
}

/** One phone file in the copy queue, shared by the shell and the transfer hook. */
export interface DownloadItem {
  devicePath: string;
  relativePath: string;
}
