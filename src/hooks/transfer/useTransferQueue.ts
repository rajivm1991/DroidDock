/**
 * Copies the agreed list one file at a time, with pause, cancel, and a status
 * on each row. Cancel also tells Rust to stop the adb process already running.
 * Name clashes are already settled before this runs.
 */
import { RefObject, SetStateAction } from "react";
import { type ConflictMode, type ReplaceFolderPlan, type ConflictPromptState } from "../../types/transfer";
import { type TransferFile, type TransferJob } from "../../components/transfer/TransferPanel";
import { type MismatchAction, type TransferConflictPolicy, type DestKind } from "../../lib/transferConflicts";
import { invoke } from "@tauri-apps/api/core";
import { type PerItemConflict } from "../../components/transfer/TransferConflictDialog";

export interface UseTransferQueueArgs {
  selectedDevice: string;
  setError: (value: SetStateAction<string>) => void;
  setSelectedFiles: (value: SetStateAction<Set<string>>) => void;
  setLastSelectedIndex: (value: SetStateAction<number>) => void;
  setTransferHistory: (value: SetStateAction<TransferJob[]>) => void;
  setDownloading: (value: SetStateAction<boolean>) => void;
  setUploading: (value: SetStateAction<boolean>) => void;
  setDownloadProgress: (value: SetStateAction<string>) => void;
  setUploadProgress: (value: SetStateAction<string>) => void;
  setTransferJob: (value: SetStateAction<TransferJob | null>) => void;
  transferJobRef: RefObject<TransferJob | null>;
  transferControl: RefObject<{ pause: boolean; cancel: boolean; }>;
  setMacSelected: (value: SetStateAction<Set<string>>) => void;
  setMacLastSelectedIndex: (value: SetStateAction<number>) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  conflictPrompt: ConflictPromptState | null;
  conflictDialogOpenRef: RefObject<boolean>;
  inFlightTransferIdRef: RefObject<string | null>;
  revealAfterDownload: boolean;
  loadFiles: () => Promise<void>;
  updateTransferFile: (id: string, patch: Partial<TransferFile>) => void;
  cancelConflictPrompt: (prompt: ConflictPromptState) => void;
  askPerItemConflict: (options: { summary: string[]; perItem: PerItemConflict; }) => Promise<{ policy: TransferConflictPolicy; applyToRemaining: boolean; } | null>;
  checkDestKinds: (direction: "download" | "upload", paths: string[]) => Promise<Map<string, DestKind>>;
  setJobAwaitingConflict: (awaiting: boolean) => void;
  cancelRemainingRows: () => void;
}

export function useTransferQueue({
  selectedDevice,
  setError,
  setSelectedFiles,
  setLastSelectedIndex,
  setTransferHistory,
  setDownloading,
  setUploading,
  setDownloadProgress,
  setUploadProgress,
  setTransferJob,
  transferJobRef,
  transferControl,
  setMacSelected,
  setMacLastSelectedIndex,
  setSuccessMessage,
  conflictPrompt,
  conflictDialogOpenRef,
  inFlightTransferIdRef,
  revealAfterDownload,
  loadFiles,
  updateTransferFile,
  cancelConflictPrompt,
  askPerItemConflict,
  checkDestKinds,
  setJobAwaitingConflict,
  cancelRemainingRows,
}: UseTransferQueueArgs) {

  /**
   * People need overall progress, per-file progress, counts, size, percent, speed,
   * elapsed time, and time left, and they need to keep browsing. One job runs at a time
   * so two adb sessions do not fight over the same device. Conflict decisions are
   * finished in `resolveTransferConflicts` before this runs (including Ask-for-each).
   * Replace-folder deletes happen HERE, first, and only once this job is accepted — a
   * refused job never deletes. Before each delete the folder is checked again; if it is
   * now a file or cannot be checked, nothing is deleted and that folder's rows fail.
   * Each row is `preparing` (frozen bar) until Rust reports the first byte event; then
   * `active`. Mid-queue asks only cover surprises (type mismatch); the row stays
   * `awaiting_conflict` — never `active` — until a choice is made. Cancel on that
   * question stops the copy (rows cancelled). Pause waits between files. Cancel sets a
   * flag for the remaining files and `cancel_transfer` kills the file already in
   * flight. Retry builds a new job from rows still marked failed, using the paths
   * stored on each row. Source-pane selection stays until a fully successful finish.
   */
  async function runTransferQueue(options: {
    direction: "download" | "upload";
    title: string;
    destination: string;
    items: { name: string; total: number; devicePath: string; localPath: string }[];
    fileConflictMode: ConflictMode;
    perFileModes?: Map<string, ConflictMode>;
    replaceFolders?: ReplaceFolderPlan[];
    /** Called once the job exists (transferJobRef set); releases the plan lock. */
    onAccepted?: () => void;
  }) {
    if (!selectedDevice) return;
    // Preflight / Ask-for-each must finish first — never open the panel mid-dialog.
    if (conflictDialogOpenRef.current) {
      setError("Finish the conflict choices before the copy can start.");
      return;
    }
    if (transferJobRef.current && transferJobRef.current.finishedAt == null) {
      setError("A transfer is already running. Cancel it before starting another.");
      return;
    }

    const defaultMode = options.fileConflictMode;
    const perFileModes = options.perFileModes ?? new Map<string, ConflictMode>();
    transferControl.current = { pause: false, cancel: false };
    const stamp = Date.now();
    const files: TransferFile[] = options.items.map((item, index) => ({
      id: `${options.direction}-${stamp}-${index}`,
      name: item.name,
      status: "queued",
      bytes: 0,
      total: item.total,
      devicePath: item.devicePath,
      localPath: item.localPath,
    }));
    const job: TransferJob = {
      id: `job-${stamp}`,
      direction: options.direction,
      title: options.title,
      destination: options.destination,
      files,
      startedAt: stamp,
      finishedAt: null,
      paused: false,
      awaitingConflict: false,
      userCancelled: false,
    };
    transferJobRef.current = job;
    setTransferJob(job);
    // From here the running job itself blocks new copies (tryBeginTransferFlow
    // checks transferJobRef), so the plan lock can hand over with no gap.
    options.onAccepted?.();
    setError("");
    setSuccessMessage("");
    if (options.direction === "download") setDownloading(true);
    else setUploading(true);

    let failures = 0;
    let surpriseApplyRest: MismatchAction | null = null;
    const failedBeforeStart = new Set<string>();
    const where = options.direction === "download" ? "on This Mac" : "on the phone";

    for (const folder of options.replaceFolders ?? []) {
      if (transferControl.current.cancel) break;
      const rows = files.filter((file) => file.name.startsWith(`${folder.root}/`));
      rows.forEach((row) => updateTransferFile(row.id, { status: "preparing" }));
      let problem: string | null = null;
      try {
        const kinds = await checkDestKinds(options.direction, [folder.destPath]);
        const kind = kinds.get(folder.destPath) ?? "unknown";
        switch (kind) {
          case "directory":
            if (options.direction === "download") {
              await invoke("remove_local_path", { path: folder.destPath });
            } else {
              await invoke("delete_file", {
                deviceId: selectedDevice,
                filePath: folder.destPath,
                isDirectory: true,
              });
            }
            break;
          case "missing":
            break;
          case "file":
            problem = `A file now uses the name “${folder.root}” ${where}, so nothing was deleted and that folder was not copied.`;
            break;
          case "unknown":
            problem = `Could not check “${folder.root}” ${where}, so nothing was deleted and that folder was not copied.`;
            break;
          default: {
            const unreachable: never = kind;
            throw new Error(`Unhandled destination kind: ${String(unreachable)}`);
          }
        }
      } catch (err) {
        problem = `Could not remove the old “${folder.root}” ${where}: ${err}`;
      }
      if (problem) {
        for (const row of rows) {
          failedBeforeStart.add(row.id);
          updateTransferFile(row.id, { status: "failed", error: problem });
        }
        failures += rows.length;
        setError(problem);
      } else {
        rows.forEach((row) => updateTransferFile(row.id, { status: "queued" }));
      }
    }

    async function transferOne(file: TransferFile, conflictModeArg: ConflictMode) {
      inFlightTransferIdRef.current = file.id;
      try {
        await transferOneInner(file, conflictModeArg);
      } finally {
        if (inFlightTransferIdRef.current === file.id) inFlightTransferIdRef.current = null;
      }
    }

    async function transferOneInner(file: TransferFile, conflictModeArg: ConflictMode) {
      if (options.direction === "download") {
        const result = await invoke<string>("download_file", {
          deviceId: selectedDevice,
          devicePath: file.devicePath,
          localPath: file.localPath,
          conflictMode: conflictModeArg,
          transferId: file.id,
        });
        const status =
          result === "skipped" ? "skipped" : result === "renamed" ? "renamed" : "done";
        updateTransferFile(file.id, {
          status,
          bytes: file.total > 0 ? file.total : file.bytes,
        });
      } else {
        const result = await invoke<string>("upload_file", {
          deviceId: selectedDevice,
          localPath: file.localPath,
          devicePath: file.devicePath,
          conflictMode: conflictModeArg,
          transferId: file.id,
        });
        const status =
          result === "skipped" ? "skipped" : result === "renamed" ? "renamed" : "done";
        updateTransferFile(file.id, {
          status,
          bytes: file.total > 0 ? file.total : file.bytes,
        });
      }
    }

    for (const file of files) {
      if (failedBeforeStart.has(file.id)) continue;
      while (transferControl.current.pause && !transferControl.current.cancel) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (transferControl.current.cancel) {
        updateTransferFile(file.id, { status: "cancelled" });
        cancelRemainingRows();
        break;
      }

      // Preflight / Ask-for-each already decided every known conflict.
      const conflictModeArg: ConflictMode = perFileModes.get(file.name) ?? defaultMode;

      updateTransferFile(file.id, { status: "preparing", bytes: 0 });
      try {
        await transferOne(file, conflictModeArg);
      } catch (err) {
        const message = String(err);
        if (message.includes("Cancelled") || transferControl.current.cancel) {
          updateTransferFile(file.id, { status: "cancelled" });
          cancelRemainingRows();
          break;
        }
        if (message.includes("Type mismatch")) {
          let action: MismatchAction | null = surpriseApplyRest;
          if (!action) {
            updateTransferFile(file.id, { status: "awaiting_conflict" });
            setJobAwaitingConflict(true);
            const decision = await askPerItemConflict({
              summary: [
                `A folder named “${file.name}” now exists ${where}, where this file would go.`,
              ],
              perItem: {
                displayName: file.name,
                kind: "mismatch",
                detail:
                  "A file cannot replace a folder. Skip the file, or keep both by copying it as “name (1)”. Cancel stops this copy.",
              },
            });
            setJobAwaitingConflict(false);
            // The dialog covers the panel, so its Cancel is how the person
            // stops the copy here; the panel's Cancel also settles it as null.
            if (!decision || transferControl.current.cancel) {
              transferControl.current.cancel = true;
              updateTransferFile(file.id, { status: "cancelled" });
              cancelRemainingRows();
              break;
            }
            action = decision.policy.mismatchAction;
            if (decision.applyToRemaining) surpriseApplyRest = action;
          }
          try {
            updateTransferFile(file.id, { status: "preparing", bytes: 0 });
            await transferOne(file, action);
            continue;
          } catch (retryErr) {
            const retryMessage = String(retryErr);
            if (retryMessage.includes("Cancelled") || transferControl.current.cancel) {
              updateTransferFile(file.id, { status: "cancelled" });
              cancelRemainingRows();
              break;
            }
            failures += 1;
            updateTransferFile(file.id, { status: "failed", error: retryMessage });
            continue;
          }
        }
        failures += 1;
        updateTransferFile(file.id, { status: "failed", error: message });
      }
    }

    const currentJob = transferJobRef.current;
    let transferSucceeded = false;
    if (currentJob) {
      // Cancel after some rows Done must not look like a clean finish. Honour the
      // cancel flag even if the in-flight row committed as Done.
      const userCancelled =
        currentJob.userCancelled ||
        transferControl.current.cancel ||
        currentJob.files.some((file) => file.status === "cancelled");
      const done: TransferJob = {
        ...currentJob,
        finishedAt: Date.now(),
        paused: false,
        awaitingConflict: false,
        userCancelled,
      };
      transferJobRef.current = done;
      setTransferJob(done);
      // Session history only for jobs that still need attention (failures).
      // Clean finishes auto-dismiss from the panel — no sticky “Finished” strip.
      const failed = done.files.filter((file) => file.status === "failed").length;
      transferSucceeded = failed === 0 && !userCancelled;
      if (failed > 0 && !userCancelled) {
        setTransferHistory((prev) => [done, ...prev].slice(0, 8));
      }
      const elapsed = done.startedAt ? Date.now() - done.startedAt : 0;
      // Asks the browser once. If the person denies it, the panel is still
      // the record of the job. There is no sound and no Dock badge.
      if (elapsed > 3000 && typeof Notification !== "undefined") {
        const body = userCancelled
          ? `${done.title} cancelled`
          : failed > 0
            ? `${done.title} finished with ${failed} failed`
            : `${done.title} finished`;
        if (Notification.permission === "granted") {
          new Notification("DroidDock", { body });
        } else if (Notification.permission === "default") {
          void Notification.requestPermission();
        }
      }
      // Clearing at queue start made Cancel / Retry lose the picks. Keep phone
      // selection for downloads and Mac selection for uploads until every row finishes
      // without failed or cancelled.
      if (transferSucceeded) {
        if (options.direction === "download") {
          setSelectedFiles(new Set());
          setLastSelectedIndex(-1);
        } else {
          setMacSelected(new Set());
          setMacLastSelectedIndex(-1);
        }
      }
    }
    setDownloading(false);
    setUploading(false);
    setDownloadProgress("");
    setUploadProgress("");

    if (options.direction === "upload") {
      await loadFiles();
    }
    if (options.direction === "download" && revealAfterDownload) {
      try {
        await invoke("reveal_in_finder", { path: options.destination });
      } catch (err) {
        console.error("Failed to reveal folder:", err);
      }
    }
    if (failures > 0) {
      setError(`Transfer finished with ${failures} failure${failures === 1 ? "" : "s"}. Retry is on the transfer panel.`);
    }
  }

  function cancelTransferJob() {
    /*
     * The panel used to show Finished when Cancel ran after some rows were already Done
     * (outcome ignored cancel if finishedCount > 0). Mark the job cancelled
     * immediately, stop the queue, and ask Rust to abort the in-flight file. Does not
     * rewrite rows that already finished as Cancelled.
     */
    transferControl.current.cancel = true;
    transferControl.current.pause = false;
    setTransferJob((prev) => {
      if (!prev || prev.finishedAt != null) return prev;
      const next = { ...prev, userCancelled: true, paused: false };
      transferJobRef.current = next;
      return next;
    });
    // If a surprise conflict dialog is open, dismiss it so the queue can unwind
    // (the queue then marks that row and the rest cancelled).
    if (conflictDialogOpenRef.current && conflictPrompt) {
      cancelConflictPrompt(conflictPrompt);
    }
    setJobAwaitingConflict(false);
    // The ref is set synchronously before each invoke, so a row that is still
    // Preparing is cancelled too (Rust honours the flag through prepare).
    const inFlightId =
      inFlightTransferIdRef.current ??
      transferJobRef.current?.files.find(
        (file) => file.status === "active" || file.status === "preparing",
      )?.id;
    if (inFlightId) {
      invoke("cancel_transfer", { transferId: inFlightId }).catch((err) => {
        console.error("Failed to cancel transfer:", err);
      });
    }
  }

  return {
    runTransferQueue,
    cancelTransferJob,
  };
}
