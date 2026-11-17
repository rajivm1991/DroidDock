/**
 * Copy from the selection strip, the menu, and the shortcuts: expand the
 * selection, settle name clashes, then hand the list to the queue. Phone to
 * Mac and Mac to phone both come through here. The on-screen job and the
 * dialogs live in the other transfer hooks.
 */
import { RefObject, SetStateAction } from "react";
import { type DownloadItem, type LockedTransferPlan, type UploadSource, type TransferPlan, type ConflictMode, type ReplaceFolderPlan } from "../../types/transfer";
import { type FileEntry } from "../../lib/file-types";
import { invoke } from "@tauri-apps/api/core";
import { type TransferQueueItem } from "../../lib/transferConflicts";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { type TransferJob } from "../../components/transfer/TransferPanel";

export interface UseTransferFlowArgs {
  selectedDevice: string;
  currentPath: string;
  files: FileEntry[];
  setError: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  selectedFiles: Set<string>;
  setSelectedFiles: (value: SetStateAction<Set<string>>) => void;
  searchResults: FileEntry[];
  transferJobRef: RefObject<TransferJob | null>;
  macPath: string;
  macFiles: FileEntry[];
  macSelected: Set<string>;
  setMacRefresh: (value: SetStateAction<number>) => void;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  setTransferFlowStatus: (value: SetStateAction<string>) => void;
  transferFlowAbortRef: RefObject<boolean>;
  setDownloadOptionsOpen: (value: SetStateAction<boolean>) => void;
  tryBeginTransferFlow: () => number | null;
  endTransferFlow: (token: number) => void;
  resolveTransferConflicts: (options: { direction: "download" | "upload"; destination: string; items: TransferQueueItem[]; }) => Promise<TransferPlan | null>;
  runTransferQueue: (options: { direction: "download" | "upload"; title: string; destination: string; items: { name: string; total: number; devicePath: string; localPath: string; }[]; fileConflictMode: ConflictMode; perFileModes?: Map<string, ConflictMode>; replaceFolders?: ReplaceFolderPlan[]; onAccepted?: () => void; }) => Promise<void>;
}

export function useTransferFlow({
  selectedDevice,
  currentPath,
  files,
  setError,
  showHiddenFiles,
  selectedFiles,
  setSelectedFiles,
  searchResults,
  transferJobRef,
  macPath,
  macFiles,
  macSelected,
  setMacRefresh,
  setSuccessMessage,
  setTransferFlowStatus,
  transferFlowAbortRef,
  setDownloadOptionsOpen,
  tryBeginTransferFlow,
  endTransferFlow,
  resolveTransferConflicts,
  runTransferQueue,
}: UseTransferFlowArgs) {

  function handleDownload() {
    if (!selectedDevice || selectedFiles.size === 0) return;
    setDownloadOptionsOpen(true);
  }

  /**
   * Primary copy should land in the open opposite folder without a separate “Download”
   * / “To phone” chrome control. Phone → performDownload; Mac → sendMacNames. Conflict
   * scan asks when names already exist (not silent overwrite from last preference).
   * Does not open the Download Options sheet (that is Cmd+D / handleDownload).
   */
  function copyPhoneSelectionToMac() {
    if (!selectedDevice || selectedFiles.size === 0) return;
    void performDownload();
  }

  function copyMacSelectionToPhone() {
    if (!selectedDevice || macSelected.size === 0) return;
    void sendMacNames(Array.from(macSelected));
  }

  function devicePathForName(name: string): string {
    return name.startsWith("/")
      ? name
      : currentPath === "/"
        ? `/${name}`
        : `${currentPath}/${name}`;
  }

  async function expandSelection(names?: Iterable<string>): Promise<DownloadItem[]> {
    const entries = Array.from(names ?? selectedFiles)
      .map(
        (name) =>
          files.find((f) => f.name === name) ||
          searchResults.find((f) => f.name === name),
      )
      .filter((f): f is FileEntry => !!f);

    const items: DownloadItem[] = [];
    for (const entry of entries) {
      const devicePath = devicePathForName(entry.name);
      const baseName = devicePath.split("/").pop() || entry.name;
      if (!entry.is_directory) {
        items.push({ devicePath, relativePath: baseName });
      } else {
        const paths = await invoke<string[]>("list_files_recursive", {
          deviceId: selectedDevice,
          devicePath,
        });
        const prefix = devicePath.endsWith("/") ? devicePath : `${devicePath}/`;
        for (const p of paths) {
          items.push({
            devicePath: p,
            relativePath: `${baseName}/${p.slice(prefix.length)}`,
          });
        }
      }
    }
    return items;
  }

  /**
   * Drops, Retry, and Copy each wrapped the scan differently; some had no error
   * handling, so a failed scan or delete just did nothing. One planning path — take the
   * transfer-flow lock, build the item list, resolve conflicts, release the lock — with
   * every error shown. Return null when rejected, cancelled, empty, or failed (the
   * reason is already on screen, except a plain Cancel). Does not start the queue
   * (callers run `runPlannedTransfer`). Lock hand-off: on success the lock is NOT
   * released here. The returned plan carries the lock token; `runPlannedTransfer`
   * releases it once `runTransferQueue` has created the job (or refused / failed). This
   * closes the gap where a second Copy could start between "plan done" and "job
   * running". Every null / error path here releases the lock itself. `confirmFirst`
   * (Finder-drop tip) runs inside the lock, so no other copy flow can start while it is
   * on screen; false = cancelled, nothing copied.
   */
  async function planTransfer(options: {
    direction: "download" | "upload";
    destination: string;
    errorPrefix: string;
    buildItems: () => Promise<TransferQueueItem[] | null>;
    confirmFirst?: () => Promise<boolean>;
  }): Promise<LockedTransferPlan | null> {
    const token = tryBeginTransferFlow();
    if (token === null) return null;
    let handedOff = false;
    try {
      if (options.confirmFirst && !(await options.confirmFirst())) return null;
      if (transferFlowAbortRef.current) return null;
      const items = await options.buildItems();
      if (!items || transferFlowAbortRef.current) return null;
      const plan = await resolveTransferConflicts({
        direction: options.direction,
        destination: options.destination,
        items,
      });
      if (!plan) return null;
      handedOff = true;
      return { ...plan, lockToken: token };
    } catch (err) {
      setError(`${options.errorPrefix}: ${err}`);
      return null;
    } finally {
      if (!handedOff) endTransferFlow(token);
    }
  }

  /**
   * Start the queue for a finished plan; unexpected errors become a banner.
   * Releases the plan's lock when the job is accepted, and again (no-op if
   * already released) on refusal, error, or finish.
   */
  async function runPlannedTransfer(
    direction: "download" | "upload",
    title: string,
    destination: string,
    plan: LockedTransferPlan,
  ) {
    try {
      await runTransferQueue({
        direction,
        title,
        destination,
        items: plan.items,
        fileConflictMode: plan.fileAction,
        perFileModes: plan.perFileModes,
        replaceFolders: plan.replaceFolders,
        onAccepted: () => endTransferFlow(plan.lockToken),
      });
    } catch (err) {
      setError(`Copy stopped: ${err}`);
    } finally {
      endTransferFlow(plan.lockToken);
    }
  }

  function retryFailedTransfer() {
    const current = transferJobRef.current;
    if (!current || current.finishedAt == null) return;
    const failed = current.files.filter((file) => file.status === "failed");
    if (failed.length === 0) return;
    void (async () => {
      const plan = await planTransfer({
        direction: current.direction,
        destination: current.destination,
        errorPrefix: "Could not prepare the retry",
        buildItems: async () =>
          failed.map((file) => ({
            name: file.name,
            total: file.total,
            devicePath: file.devicePath,
            localPath: file.localPath,
          })),
      });
      if (!plan) return;
      await runPlannedTransfer(current.direction, current.title, current.destination, plan);
    })();
  }

  async function performDownload() {
    if (!selectedDevice || selectedFiles.size === 0) return;

    // Mac pane is always open; its folder is the download destination.
    // The save dialog remains only if that path is missing (should be rare).
    let downloadDir = macPath || "";
    if (!downloadDir) {
      try {
        const selectedDir = await open({
          directory: true,
          multiple: false,
          title: "Select Download Directory",
        });
        if (!selectedDir) return;
        downloadDir = typeof selectedDir === "string" ? selectedDir : selectedDir[0];
      } catch (err) {
        setError(`Could not choose a folder: ${err}`);
        return;
      }
    }

    // Do not set downloading / show “Copying…” until conflicts are resolved —
    // otherwise it looks like the transfer already started during the dialog.
    setError("");
    setSuccessMessage("");
    const plan = await planTransfer({
      direction: "download",
      destination: downloadDir,
      errorPrefix: "Could not prepare the copy",
      buildItems: async () => {
        setTransferFlowStatus("Listing folder contents…");
        const items = await expandSelection();
        if (items.length === 0) {
          setSelectedFiles(new Set());
          setSuccessMessage("Nothing to download");
          return null;
        }
        // Hand the copy to the queue after conflict preflight. The queue owns
        // progress, cancel, and the Finder reveal. Selection stays until a
        // clean finish (see runTransferQueue).
        const queued: TransferQueueItem[] = [];
        for (const item of items) {
          const fileName = item.relativePath.split("/").pop() || item.relativePath;
          const localPath = await join(downloadDir, ...item.relativePath.split("/"));
          const known = files.find((entry) => entry.name === item.devicePath || entry.name.endsWith(`/${fileName}`));
          const parsed = known ? Number(known.size) : NaN;
          queued.push({
            name: item.relativePath,
            total: Number.isFinite(parsed) ? parsed : 0,
            devicePath: item.devicePath,
            localPath,
          });
        }
        return queued;
      },
    });
    if (!plan) return;
    await runPlannedTransfer("download", "Downloading from phone", downloadDir, plan);
    if (downloadDir === macPath) {
      setMacRefresh((n) => n + 1);
    }
  }

  /**
   * Phone → Mac from Copy, HTML5 drop (rare under Tauri), or in-app dragend all need
   * the same download plan into the open Mac folder. Shared download into `macPath`
   * with folder expansion + conflict preflight. Does not ask for a destination, or
   * upload.
   */
  async function copyPhoneNamesToMac(names: string[]) {
    if (!selectedDevice || !macPath || names.length === 0) return;
    const destination = macPath;
    const plan = await planTransfer({
      direction: "download",
      destination,
      errorPrefix: "Could not prepare the dropped items",
      buildItems: async () => {
        setTransferFlowStatus("Listing folder contents…");
        const expanded = await expandSelection(names);
        const queued: TransferQueueItem[] = [];
        for (const item of expanded) {
          const localPath = await join(destination, ...item.relativePath.split("/"));
          queued.push({
            name: item.relativePath,
            total: 0,
            devicePath: item.devicePath,
            localPath,
          });
        }
        if (queued.length === 0) {
          setError("Nothing to copy from that drop.");
          return null;
        }
        return queued;
      },
    });
    if (!plan) return;
    await runPlannedTransfer("download", "Downloading from phone", destination, plan);
    setMacRefresh((n) => n + 1);
  }

  /**
   * A Mac folder has to arrive on the phone as its files, both from the Mac pane and
   * from a Finder drop, so folder conflict choices apply. One expansion used by
   * `sendMacNames` and Finder drops. Files map to `<open phone folder>/<name>`; folders
   * expand through `list_local_files_under`, keeping relative paths (hidden files
   * follow the Show hidden setting). A folder that cannot be read stops the plan with a
   * visible error instead of sending a partial set. Does not create empty folders on
   * the phone, or follow symlinks.
   */
  async function buildUploadItems(sources: UploadSource[]): Promise<TransferQueueItem[]> {
    const phoneDest = (relative: string) =>
      currentPath === "/" ? `/${relative}` : `${currentPath}/${relative}`;
    const items: TransferQueueItem[] = [];
    for (const source of sources) {
      if (!source.isDirectory) {
        items.push({
          name: source.name,
          total: source.size,
          devicePath: phoneDest(source.name),
          localPath: source.localPath,
        });
        continue;
      }
      let nested: { absolute_path: string; relative_path: string; size: number }[];
      try {
        nested = await invoke("list_local_files_under", {
          path: source.localPath,
          showHidden: showHiddenFiles,
        });
      } catch (err) {
        throw new Error(`Could not read “${source.name}”: ${err}`);
      }
      for (const file of nested) {
        const name = `${source.name}/${file.relative_path}`;
        items.push({
          name,
          total: file.size,
          devicePath: phoneDest(name),
          localPath: file.absolute_path,
        });
      }
    }
    return items;
  }

  /**
   * A Mac folder has to arrive on the phone as its files, or the user only gets an
   * error. Expansion through `buildUploadItems` before the upload queue, plus conflict
   * preflight (skip / replace / keep both / merge) so uploads no longer always
   * overwrite. Upload files, and the files inside selected folders, into the open phone
   * directory, keeping relative paths. Does not change Folder Sync, and does not send
   * hidden files unless hidden files are shown.
   */
  async function sendMacNames(names: string[]) {
    if (!selectedDevice || !macPath || names.length === 0) return;
    const destination = currentPath;
    const plan = await planTransfer({
      direction: "upload",
      destination,
      errorPrefix: "Could not prepare the copy",
      buildItems: async () => {
        setTransferFlowStatus("Listing folder contents…");
        const sources: UploadSource[] = names.map((name) => {
          const entry = macFiles.find((file) => file.name === name);
          return {
            name,
            localPath: `${macPath}/${name}`,
            isDirectory: !entry || entry.is_directory,
            size: entry ? Number(entry.size) || 0 : 0,
          };
        });
        const items = await buildUploadItems(sources);
        if (items.length === 0) {
          setError("Nothing to send. The selection may be an empty folder.");
          return null;
        }
        return items;
      },
    });
    if (!plan) return;
    // Selection clears only after a clean finish inside runTransferQueue.
    await runPlannedTransfer("upload", "Uploading to phone", destination, plan);
  }

  return {
    handleDownload,
    copyPhoneSelectionToMac,
    copyMacSelectionToPhone,
    planTransfer,
    runPlannedTransfer,
    retryFailedTransfer,
    performDownload,
    copyPhoneNamesToMac,
    buildUploadItems,
    sendMacNames,
  };
}
