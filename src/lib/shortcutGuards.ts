/**
 * Whether something is open on top of the app, so the browsing shortcuts should stand down.
 * The first-run tour counts: it only handles a few keys itself.
 */
export interface ModalFlags {
  showDeleteConfirm: boolean;
  newFolderDialog: unknown;
  showPreview: boolean;
  showShortcutsHelp: boolean;
  settingsOpen: boolean;
  syncDialogOpen: boolean;
  downloadOptionsOpen: boolean;
  renamingIndex: number;
  transferFlowBusy: boolean;
  conflictPrompt: unknown;
  fileMenu: unknown;
  tutorialOpen: boolean;
}

export function anyModalOpen(s: ModalFlags): boolean {
  return (
    s.showDeleteConfirm ||
    !!s.newFolderDialog ||
    s.showPreview ||
    s.showShortcutsHelp ||
    s.settingsOpen ||
    s.syncDialogOpen ||
    s.downloadOptionsOpen ||
    s.renamingIndex >= 0 ||
    s.transferFlowBusy ||
    !!s.conflictPrompt ||
    !!s.fileMenu ||
    s.tutorialOpen
  );
}
