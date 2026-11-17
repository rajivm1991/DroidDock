/**
 * Shows the dialog that matches the conflict prompt currently open. The
 * transfer flow still owns the prompt and the answer.
 */
import { TransferConflictDialog, ReplaceFoldersConfirmDialog, FinderDropTipDialog } from "./TransferConflictDialog";
import { type ConflictPromptState, type ConflictPromptResult } from "../../types/transfer";

export interface ConflictPromptHostProps {
  conflictMode: "replace" | "skip" | "keepBoth";
  conflictPrompt: ConflictPromptState;
  settleConflictPrompt: (result: ConflictPromptResult) => void;
  cancelConflictPrompt: (prompt: ConflictPromptState) => void;
}

export function ConflictPromptHost({
  conflictMode,
  conflictPrompt,
  settleConflictPrompt,
  cancelConflictPrompt,
}: ConflictPromptHostProps) {
  const prompt = conflictPrompt;
  switch (prompt.mode) {
    case "preflight":
      return (
        <TransferConflictDialog
          key={prompt.id}
          mode="preflight"
          summary={prompt.summary}
          hasFolderConflicts={prompt.hasFolderConflicts}
          hasFileConflicts={prompt.hasFileConflicts}
          hasTypeMismatch={prompt.hasTypeMismatch}
          initialFileAction={conflictMode}
          initialFolderAction="merge"
          showRemember
          onCancel={() => cancelConflictPrompt(prompt)}
          onConfirm={(policy) =>
            settleConflictPrompt({ kind: "preflight", policy })
          }
        />
      );
    case "perItem":
      return (
        <TransferConflictDialog
          key={prompt.id}
          mode="perItem"
          summary={prompt.summary}
          hasFolderConflicts={prompt.perItem.kind === "folder"}
          hasFileConflicts={
            prompt.perItem.kind === "file" || prompt.perItem.kind === "unknown"
          }
          hasTypeMismatch={prompt.perItem.kind === "mismatch"}
          perItem={prompt.perItem}
          initialFileAction={conflictMode}
          initialFolderAction="merge"
          showRemember={false}
          onCancel={() => cancelConflictPrompt(prompt)}
          onConfirm={(policy, applyToRemaining) =>
            settleConflictPrompt({
              kind: "perItem",
              result: { policy, applyToRemaining },
            })
          }
        />
      );
    case "confirmReplace":
      return (
        <ReplaceFoldersConfirmDialog
          key={prompt.id}
          folders={prompt.folders}
          where={prompt.where}
          warnings={prompt.warnings}
          onCancel={() => cancelConflictPrompt(prompt)}
          onConfirm={() =>
            settleConflictPrompt({ kind: "confirmReplace", ok: true })
          }
        />
      );
    case "finderDropTip":
      return (
        <FinderDropTipDialog
          key={prompt.id}
          folderLabel={prompt.folderLabel}
          onCancel={() => cancelConflictPrompt(prompt)}
          onContinue={(dontShowAgain) =>
            settleConflictPrompt({ kind: "finderDropTip", ok: true, dontShowAgain })
          }
        />
      );
    default: {
      const unreachable: never = prompt;
      throw new Error(`Unhandled conflict prompt: ${String(unreachable)}`);
    }
  }
          }
