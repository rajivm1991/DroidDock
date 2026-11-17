/**
 * The conflict question currently on screen, and the lock that refuses a
 * second Copy or drop while a scan or question is open. A late cleanup cannot
 * release a newer flow’s lock. Finding the clashes is useTransferConflictResolver.
 */
import { RefObject, SetStateAction, useEffect, useRef, useState } from "react";
import { type ConflictMode, type ConflictPromptState, type ConflictPromptResult, FINDER_DROP_ACK_KEY } from "../../types/transfer";
import { type TransferConflictPolicy } from "../../lib/transferConflicts";
import { readStoredBoolean } from "../../lib/storage";
import { type PerItemConflict } from "../../components/transfer/TransferConflictDialog";
import { type TransferJob } from "../../components/transfer/TransferPanel";

export interface UseTransferPromptsArgs {
  setError: (value: SetStateAction<string>) => void;
  transferJobRef: RefObject<TransferJob | null>;
  phoneDestinationLabel: () => string;
}

export function useTransferPrompts({
  setError,
  transferJobRef,
  phoneDestinationLabel,
}: UseTransferPromptsArgs) {
  const [conflictMode, setConflictMode] = useState<ConflictMode>(() => {
    const saved = localStorage.getItem("droiddock-download-conflict-mode");
    if (saved === "skip" || saved === "replace" || saved === "keepBoth") {
      return saved;
    }
    // Migrate the legacy skip-duplicates toggle.
    const legacy = readStoredBoolean("droiddock-skip-duplicate-downloads");
    if (legacy !== null) {
      return legacy ? "skip" : "replace";
    }
    return "skip";
  });
  /**
   * Primary Copy must ask when names already exist (Finder/Explorer), not silently use
   * the last preference; mid-queue asks need a promise + dialog. Transfer-scoped
   * conflict prompt state for preflight and per-item. Resolver lives in a ref so a
   * click-through / stale render cannot settle the wrong promise while bytes are
   * already moving. Does not persist “apply to remaining” across transfers.
   */
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPromptState | null>(
    null,
  );
  const conflictPromptResolver = useRef<
    ((result: ConflictPromptResult) => void) | null
  >(null);
  /** True while waiting on conflict UI — runTransferQueue must not start. */
  const conflictDialogOpenRef = useRef(false);
  const conflictPromptSeq = useRef(0);
  /**
   * A second Copy / drop / Cmd+D while a scan or conflict dialog was up replaced the
   * single dialog resolver, so the first flow never finished (and a mid-copy question
   * could hang the queue forever). One transfer-flow lock covering expand → scan →
   * every dialog, with a visible “Checking for existing files…” sheet while no dialog
   * is shown. Block both panes, Copy buttons, drops, and transfer/navigation shortcuts;
   * a new flow attempt is rejected with a visible message. Does not queue the rejected
   * request, or lock browsing while a copy runs without a question on screen.
   */
  const transferFlowBusyRef = useRef(false);
  const [transferFlowBusy, setTransferFlowBusy] = useState(false);
  const [transferFlowStatus, setTransferFlowStatus] = useState("");
  const transferFlowAbortRef = useRef(false);
  /**
   * Lock owner token: only the flow that took the lock may release it, so a
   * late cleanup from a finished copy can never unlock a newer flow.
   */
  const transferFlowTokenRef = useRef(0);

  // Save download preferences; the legacy key is superseded by conflict mode
  useEffect(() => {
    localStorage.setItem("droiddock-download-conflict-mode", conflictMode);
    localStorage.removeItem("droiddock-skip-duplicate-downloads");
  }, [conflictMode]);

  function settleConflictPrompt(result: ConflictPromptResult) {
    const resolve = conflictPromptResolver.current;
    conflictPromptResolver.current = null;
    conflictDialogOpenRef.current = false;
    setConflictPrompt(null);
    resolve?.(result);
  }

  function cancelConflictPrompt(prompt: ConflictPromptState) {
    switch (prompt.mode) {
      case "preflight":
        settleConflictPrompt({ kind: "preflight", policy: null });
        break;
      case "perItem":
        settleConflictPrompt({ kind: "perItem", result: null });
        break;
      case "confirmReplace":
        settleConflictPrompt({ kind: "confirmReplace", ok: false });
        break;
      case "finderDropTip":
        settleConflictPrompt({ kind: "finderDropTip", ok: false, dontShowAgain: false });
        break;
      default: {
        const unreachable: never = prompt;
        throw new Error(`Unhandled conflict prompt: ${String(unreachable)}`);
      }
    }
  }

  /**
   * Single resolver: a second question while one is open is refused (resolves
   * null = cancel for the caller), never allowed to overwrite the first.
   */
  function promptConflict(prompt: ConflictPromptState): Promise<ConflictPromptResult | null> {
    if (conflictPromptResolver.current) {
      setError("Finish the open copy question first.");
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      conflictDialogOpenRef.current = true;
      conflictPromptResolver.current = resolve;
      setConflictPrompt(prompt);
    });
  }

  function nextConflictPromptId(): number {
    conflictPromptSeq.current += 1;
    return conflictPromptSeq.current;
  }

  async function askPreflightConflicts(options: {
    summary: string[];
    hasFolderConflicts: boolean;
    hasFileConflicts: boolean;
    hasTypeMismatch: boolean;
  }): Promise<TransferConflictPolicy | null> {
    const result = await promptConflict({
      id: nextConflictPromptId(),
      mode: "preflight",
      ...options,
    });
    return result?.kind === "preflight" ? result.policy : null;
  }

  async function askPerItemConflict(options: {
    summary: string[];
    perItem: PerItemConflict;
  }): Promise<{ policy: TransferConflictPolicy; applyToRemaining: boolean } | null> {
    const result = await promptConflict({
      id: nextConflictPromptId(),
      mode: "perItem",
      ...options,
    });
    return result?.kind === "perItem" ? result.result : null;
  }

  async function askReplaceFoldersConfirm(options: {
    folders: string[];
    where: string;
    warnings: string[];
  }): Promise<boolean> {
    const result = await promptConflict({
      id: nextConflictPromptId(),
      mode: "confirmReplace",
      ...options,
    });
    return result?.kind === "confirmReplace" ? result.ok : false;
  }

  /**
   * A drop from Finder always uploads into the open phone folder, even when it lands on
   * the This Mac pane (the window cannot tell panes apart for Finder drops, and Mac →
   * Mac copying is Finder's job). People need to know that once, before it surprises
   * them. A one-time tip, shown only while the ack key is missing. Continue → true
   * (persists the ack only if "Don't show again" was ticked); Cancel / Escape → false,
   * nothing persisted, nothing copied. Does not pick a target pane, or offer a Settings
   * switch to re-enable it.
   */
  async function confirmFinderDropTip(): Promise<boolean> {
    if (localStorage.getItem(FINDER_DROP_ACK_KEY) === "1") return true;
    const result = await promptConflict({
      id: nextConflictPromptId(),
      mode: "finderDropTip",
      folderLabel: phoneDestinationLabel(),
    });
    if (result?.kind !== "finderDropTip" || !result.ok) return false;
    if (result.dontShowAgain) localStorage.setItem(FINDER_DROP_ACK_KEY, "1");
    return true;
  }

  /**
   * Take the transfer-flow lock, or explain (visibly) why not. Rejected
   * requests are dropped, not queued.
   */
  function tryBeginTransferFlow(): number | null {
    if (transferFlowBusyRef.current || conflictPromptResolver.current) {
      setError(
        "Finish or cancel the current copy question before starting another copy.",
      );
      return null;
    }
    if (transferJobRef.current && transferJobRef.current.finishedAt == null) {
      setError("A copy is already running. Wait for it to finish or cancel it first.");
      return null;
    }
    transferFlowTokenRef.current += 1;
    transferFlowBusyRef.current = true;
    transferFlowAbortRef.current = false;
    setTransferFlowBusy(true);
    setTransferFlowStatus("Checking for existing files…");
    return transferFlowTokenRef.current;
  }

  /** Release the lock only if `token` still owns it (idempotent). */
  function endTransferFlow(token: number) {
    if (!transferFlowBusyRef.current || transferFlowTokenRef.current !== token) return;
    transferFlowBusyRef.current = false;
    transferFlowAbortRef.current = false;
    setTransferFlowBusy(false);
    setTransferFlowStatus("");
  }

  /** Escape while locked: cancel the question on screen, or stop the scan. */
  function cancelTransferFlowFromKeyboard() {
    if (conflictPrompt) {
      cancelConflictPrompt(conflictPrompt);
      return;
    }
    if (transferFlowBusyRef.current) {
      transferFlowAbortRef.current = true;
      setTransferFlowStatus("Cancelling…");
    }
  }

  return {
    conflictMode,
    setConflictMode,
    conflictPrompt,
    conflictPromptResolver,
    conflictDialogOpenRef,
    transferFlowBusyRef,
    transferFlowBusy,
    transferFlowStatus,
    setTransferFlowStatus,
    transferFlowAbortRef,
    settleConflictPrompt,
    cancelConflictPrompt,
    askPreflightConflicts,
    askPerItemConflict,
    askReplaceFoldersConfirm,
    confirmFinderDropTip,
    tryBeginTransferFlow,
    endTransferFlow,
    cancelTransferFlowFromKeyboard,
  };
}
