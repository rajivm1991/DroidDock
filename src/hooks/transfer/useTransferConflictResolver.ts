/**
 * Before any bytes move: which destination names are taken, the Keep both
 * names, and the questions about replacing folders. Returns the list the
 * queue should copy, or nothing if the person cancels.
 */
import { RefObject, SetStateAction } from "react";
import { type DestKind, type DestConflict, kindByPath, numberedFolderName, type TransferQueueItem, itemRoot, folderRootsFromItems, summarizeConflicts, type MismatchAction, type FolderConflictAction, type TransferConflictPolicy } from "../../lib/transferConflicts";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { type ReplaceFolderPlan, type TransferPlan, type ConflictMode } from "../../types/transfer";
import { type PerItemConflict } from "../../components/transfer/TransferConflictDialog";

export interface UseTransferConflictResolverArgs {
  selectedDevice: string;
  showHiddenFiles: boolean;
  setSuccessMessage: (value: SetStateAction<string>) => void;
  setConflictMode: (value: SetStateAction<ConflictMode>) => void;
  setTransferFlowStatus: (value: SetStateAction<string>) => void;
  transferFlowAbortRef: RefObject<boolean>;
  askPreflightConflicts: (options: { summary: string[]; hasFolderConflicts: boolean; hasFileConflicts: boolean; hasTypeMismatch: boolean; }) => Promise<TransferConflictPolicy | null>;
  askPerItemConflict: (options: { summary: string[]; perItem: PerItemConflict; }) => Promise<{ policy: TransferConflictPolicy; applyToRemaining: boolean; } | null>;
  askReplaceFoldersConfirm: (options: { folders: string[]; where: string; warnings: string[]; }) => Promise<boolean>;
}

export function useTransferConflictResolver({
  selectedDevice,
  showHiddenFiles,
  setSuccessMessage,
  setConflictMode,
  setTransferFlowStatus,
  transferFlowAbortRef,
  askPreflightConflicts,
  askPerItemConflict,
  askReplaceFoldersConfirm,
}: UseTransferConflictResolverArgs) {

  async function checkDestKinds(
    direction: "download" | "upload",
    paths: string[],
  ): Promise<Map<string, DestKind>> {
    if (paths.length === 0) return new Map();
    if (direction === "download") {
      const entries = await invoke<DestConflict[]>("check_local_destinations", {
        paths,
      });
      return kindByPath(entries);
    }
    if (!selectedDevice) return new Map();
    const entries = await invoke<DestConflict[]>("check_phone_destinations", {
      deviceId: selectedDevice,
      paths,
    });
    return kindByPath(entries);
  }

  async function uniqueDestFolderName(
    direction: "download" | "upload",
    parentDir: string,
    baseName: string,
  ): Promise<string> {
    let n = 1;
    while (n < 10_000) {
      const candidate = numberedFolderName(baseName, n);
      const full =
        direction === "download"
          ? await join(parentDir, candidate)
          : parentDir === "/"
            ? `/${candidate}`
            : `${parentDir}/${candidate}`;
      const kinds = await checkDestKinds(direction, [full]);
      const kind = kinds.get(full) ?? "unknown";
      if (kind === "missing") {
        return candidate;
      }
      if (kind === "unknown") {
        throw new Error("Could not check folder names on the phone. Reconnect and try again.");
      }
      n += 1;
    }
    return numberedFolderName(baseName, Date.now());
  }

  /**
   * Replace folders wipes the old folder, and Copy does not always bring everything
   * back. The confirmation must name only what really applies. Phone → Mac — warn when
   * Android/data or Android/obb sit under the source (expansion prunes them; an adb
   * error keeps the warning). Mac → phone — warn when hidden files are off and the
   * source has hidden files. Does not list what the old destination folder contains.
   */
  async function replaceFolderWarnings(
    direction: "download" | "upload",
    folders: ReplaceFolderPlan[],
    items: TransferQueueItem[],
  ): Promise<string[]> {
    const warnings: string[] = [];
    for (const folder of folders) {
      const inRoot = items.filter((item) => item.name.startsWith(`${folder.root}/`));
      const sample = inRoot[0];
      if (!sample) continue;
      const rest = sample.name.slice(folder.root.length + 1);
      if (direction === "download") {
        const sourceRoot = sample.devicePath.endsWith(`/${rest}`)
          ? sample.devicePath.slice(0, -(rest.length + 1))
          : null;
        let pruned = true;
        if (sourceRoot && selectedDevice) {
          try {
            pruned = await invoke<boolean>("phone_tree_has_pruned_dirs", {
              deviceId: selectedDevice,
              path: sourceRoot,
            });
          } catch {
            pruned = true;
          }
        }
        if (pruned) {
          warnings.push(
            `Android/data and Android/obb inside “${folder.root}” on the phone are never copied, so they will not come back.`,
          );
        }
      } else {
        if (showHiddenFiles) continue;
        const sourceRoot = sample.localPath.endsWith(`/${rest}`)
          ? sample.localPath.slice(0, -(rest.length + 1))
          : null;
        let hasHidden = true;
        if (sourceRoot) {
          try {
            const all = await invoke<unknown[]>("list_local_files_under", {
              path: sourceRoot,
              showHidden: true,
            });
            hasHidden = all.length > inRoot.length;
          } catch {
            hasHidden = true;
          }
        }
        if (hasHidden) {
          warnings.push(
            `Hidden files inside “${folder.root}” on This Mac are not copied while hidden files are turned off, so they will not be put back.`,
          );
        }
      }
    }
    return warnings;
  }

  /**
   * “Ask for each” used to start the queue, mark the conflict file active (fake
   * progress), then open a second dialog — bytes and UI raced the choice. Replace
   * folders also deleted the destination during this preflight, so a later Cancel (or a
   * refused queue) lost the folder and copied nothing. Destination scan, one preflight,
   * folder / mismatch / file choices, the hard Replace-folders confirmation, and a plan
   * the queue runs. Every question for this operation happens here, before the queue;
   * file-vs-folder clashes (either direction) only get Skip / Keep both; phone answers
   * that could not be read count as conflicts and are asked. Does not delete anything
   * (the queue deletes after it accepts the job), start adb copies, show the transfer
   * panel, or change Folder Sync. Returns null when the person cancels or the scan is
   * stopped.
   */
  async function resolveTransferConflicts(options: {
    direction: "download" | "upload";
    destination: string;
    items: TransferQueueItem[];
  }): Promise<TransferPlan | null> {
    const where = options.direction === "download" ? "on This Mac" : "on the phone";
    const itemDest = (item: TransferQueueItem) =>
      options.direction === "download" ? item.localPath : item.devicePath;
    const topLevelDest = async (name: string) =>
      options.direction === "download"
        ? await join(options.destination, name)
        : options.destination === "/"
          ? `/${name}`
          : `${options.destination}/${name}`;
    const renameRoot = async (
      item: TransferQueueItem,
      newRoot: string,
    ): Promise<TransferQueueItem> => {
      const rest = item.name.slice(itemRoot(item.name).length + 1);
      const newName = `${newRoot}/${rest}`;
      if (options.direction === "download") {
        return {
          ...item,
          name: newName,
          localPath: await join(options.destination, newRoot, ...rest.split("/")),
        };
      }
      const devicePath =
        options.destination === "/"
          ? `/${newRoot}/${rest}`
          : `${options.destination}/${newRoot}/${rest}`;
      return { ...item, name: newName, devicePath };
    };

    setTransferFlowStatus("Checking for existing files…");
    const folderRoots = [...folderRootsFromItems(options.items)];
    const rootDest = new Map<string, string>();
    for (const root of folderRoots) {
      rootDest.set(root, await topLevelDest(root));
    }
    const pathsToCheck = new Set<string>(options.items.map(itemDest));
    for (const path of rootDest.values()) pathsToCheck.add(path);
    const kinds = await checkDestKinds(options.direction, [...pathsToCheck]);
    if (transferFlowAbortRef.current) return null;

    const scan = summarizeConflicts({
      items: options.items,
      kinds,
      topLevelDestPath: (name) => rootDest.get(name) ?? "",
      itemDestPath: itemDest,
    });

    if (
      scan.fileConflictCount === 0 &&
      scan.folderConflicts.length === 0 &&
      scan.typeMismatches.length === 0
    ) {
      return {
        items: options.items,
        fileAction: "replace",
        perFileModes: new Map(),
        replaceFolders: [],
      };
    }

    const summary: string[] = [];
    const total = scan.totalItems;
    const fileWord = total === 1 ? "file" : "files";
    if (scan.fileConflictCount === 1) {
      summary.push(`1 of ${total} ${fileWord} already exists ${where}.`);
    } else if (scan.fileConflictCount > 1) {
      summary.push(`${scan.fileConflictCount} of ${total} ${fileWord} already exist ${where}.`);
    }
    if (scan.unknownFiles.length > 0) {
      summary.push(
        `${scan.unknownFiles.length} of these could not be checked on the phone, so they are treated as already there.`,
      );
    }
    const unknownRoots = scan.folderConflicts.filter(
      (root) => kinds.get(rootDest.get(root) ?? "") === "unknown",
    );
    const existingRoots = scan.folderConflicts.filter((root) => !unknownRoots.includes(root));
    if (existingRoots.length === 1) {
      summary.push(`A folder named “${existingRoots[0]}” already exists ${where}.`);
    } else if (existingRoots.length > 1) {
      summary.push(`${existingRoots.length} folders with the same names already exist ${where}.`);
    }
    if (unknownRoots.length > 0) {
      summary.push(
        `${unknownRoots.length} folder${unknownRoots.length === 1 ? "" : "s"} could not be checked on the phone, so ${unknownRoots.length === 1 ? "it is" : "they are"} treated as already there.`,
      );
    }
    if (scan.typeMismatches.length > 0) {
      summary.push(
        `${scan.typeMismatches.length} item${scan.typeMismatches.length === 1 ? " has" : "s have"} the same name as a file or folder of the other kind. ${scan.typeMismatches.length === 1 ? "It" : "They"} can only be skipped or kept as both.`,
      );
    }
    summary.push("Choose what to do before copying.");

    const policy = await askPreflightConflicts({
      summary,
      hasFolderConflicts: scan.folderConflicts.length > 0,
      hasFileConflicts: scan.fileConflicts.length + scan.unknownFiles.length > 0,
      hasTypeMismatch: scan.typeMismatches.length > 0,
    });
    if (!policy) return null;

    if (policy.remember && policy.fileAction !== "ask") {
      setConflictMode(policy.fileAction);
    }

    const askEach = policy.fileAction === "ask";
    let applyMismatch: MismatchAction | null = askEach ? null : policy.mismatchAction;
    let applyFolder: FolderConflictAction | null =
      policy.folderAction === "ask" ? null : policy.folderAction;
    const skipRoots = new Set<string>();
    const rootRenames = new Map<string, string>();
    const replaceFolders: ReplaceFolderPlan[] = [];

    // Folder onto an existing FILE: only Skip or Keep both (rename the folder).
    for (const mismatch of scan.typeMismatches) {
      if (!mismatch.sourceIsFolder) continue;
      let action: MismatchAction | null = applyMismatch;
      if (!action) {
        const decision = await askPerItemConflict({
          summary: [
            `A file named “${mismatch.name}” already exists ${where}, where this folder would go.`,
          ],
          perItem: {
            displayName: mismatch.name,
            kind: "mismatch",
            detail:
              "A folder cannot replace or merge into a file. Skip the folder, or keep both by copying it as “name (1)”.",
          },
        });
        if (!decision) return null;
        action = decision.policy.mismatchAction;
        if (decision.applyToRemaining) applyMismatch = action;
      }
      if (action === "skip") {
        skipRoots.add(mismatch.name);
      } else {
        rootRenames.set(
          mismatch.name,
          await uniqueDestFolderName(options.direction, options.destination, mismatch.name),
        );
      }
    }

    for (const root of scan.folderConflicts) {
      let chosen: FolderConflictAction | null = applyFolder;
      if (!chosen) {
        const unreadable = unknownRoots.includes(root);
        const decision = await askPerItemConflict({
          summary: [
            unreadable
              ? `Could not check whether a folder named “${root}” already exists ${where}.`
              : `A folder named “${root}” already exists ${where}.`,
          ],
          perItem: {
            displayName: root,
            kind: "folder",
            detail:
              "Merge adds into it. Replace permanently deletes it first (you confirm next). Keep both copies the new folder as “name (1)”.",
          },
        });
        if (!decision) return null;
        chosen = decision.policy.folderAction;
        if (decision.applyToRemaining) applyFolder = chosen;
      }
      switch (chosen) {
        case "merge":
        case "ask":
          break;
        case "skip":
          skipRoots.add(root);
          break;
        case "replace":
          replaceFolders.push({ root, destPath: rootDest.get(root) ?? (await topLevelDest(root)) });
          break;
        case "keepBoth":
          rootRenames.set(
            root,
            await uniqueDestFolderName(options.direction, options.destination, root),
          );
          break;
        default: {
          const unreachable: never = chosen;
          throw new Error(`Unhandled folder action: ${String(unreachable)}`);
        }
      }
    }

    let items = options.items.filter(
      (item) => !(item.name.includes("/") && skipRoots.has(itemRoot(item.name))),
    );
    if (rootRenames.size > 0) {
      items = await Promise.all(
        items.map((item) => {
          if (!item.name.includes("/")) return item;
          const newRoot = rootRenames.get(itemRoot(item.name));
          return newRoot ? renameRoot(item, newRoot) : item;
        }),
      );
    }
    if (items.length === 0) {
      setSuccessMessage("Nothing left to copy after skipping conflicts");
      return null;
    }

    // Re-check after folder rewrites so per-file choices see fresh state.
    // Files inside a folder that will be replaced are not asked about: that
    // folder is gone before they copy.
    const replacedRoots = new Set(replaceFolders.map((folder) => folder.root));
    const underReplaced = (item: TransferQueueItem) =>
      item.name.includes("/") && replacedRoots.has(itemRoot(item.name));
    setTransferFlowStatus("Checking for existing files…");
    const kindsAfter = await checkDestKinds(
      options.direction,
      items.filter((item) => !underReplaced(item)).map(itemDest),
    );
    if (transferFlowAbortRef.current) return null;

    const perFileModes = new Map<string, ConflictMode>();
    let applyFile: ConflictMode | null = null;
    for (const item of items) {
      if (underReplaced(item)) {
        perFileModes.set(item.name, "replace");
        continue;
      }
      const kind = kindsAfter.get(itemDest(item)) ?? "unknown";
      switch (kind) {
        case "missing":
          break;
        case "directory": {
          let action: MismatchAction | null = applyMismatch;
          if (!action) {
            const decision = await askPerItemConflict({
              summary: [`A folder named “${item.name}” already exists ${where}, where this file would go.`],
              perItem: {
                displayName: item.name,
                kind: "mismatch",
                detail:
                  "A file cannot replace a folder. Skip the file, or keep both by copying it as “name (1)”.",
              },
            });
            if (!decision) return null;
            action = decision.policy.mismatchAction;
            if (decision.applyToRemaining) applyMismatch = action;
          }
          perFileModes.set(item.name, action);
          break;
        }
        case "file":
        case "unknown": {
          if (!askEach) break;
          let action: ConflictMode | null = applyFile;
          if (!action) {
            const decision = await askPerItemConflict({
              summary: [
                kind === "unknown"
                  ? `Could not check whether “${item.name}” already exists ${where}.`
                  : `“${item.name}” already exists ${where}.`,
              ],
              perItem: {
                displayName: item.name,
                kind: kind === "unknown" ? "unknown" : "file",
                detail:
                  kind === "unknown"
                    ? "It is treated as already there. Replace only takes effect once the new copy has finished."
                    : undefined,
              },
            });
            if (!decision) return null;
            const fa = decision.policy.fileAction;
            action = fa === "ask" ? "skip" : fa;
            if (decision.applyToRemaining) applyFile = action;
          }
          perFileModes.set(item.name, action);
          break;
        }
        default: {
          const unreachable: never = kind;
          throw new Error(`Unhandled destination kind: ${String(unreachable)}`);
        }
      }
    }

    // Hard second confirmation, after every other choice for this copy. The
    // delete itself waits until the queue has accepted the job.
    if (replaceFolders.length > 0) {
      setTransferFlowStatus("Checking what Replace would remove…");
      const warnings = await replaceFolderWarnings(options.direction, replaceFolders, items);
      if (transferFlowAbortRef.current) return null;
      const ok = await askReplaceFoldersConfirm({
        folders: replaceFolders.map((folder) => folder.root),
        where,
        warnings,
      });
      if (!ok) return null;
    }

    return {
      items,
      fileAction: policy.fileAction === "ask" ? "replace" : policy.fileAction,
      perFileModes,
      replaceFolders,
    };
  }

  return {
    checkDestKinds,
    resolveTransferConflicts,
  };
}
