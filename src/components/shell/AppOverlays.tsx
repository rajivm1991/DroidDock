/**
 * Dialogs and the context menu that sit over the panes, in the order they
 * stack. Settings, sync, preview, and copy questions stay in the shell hooks.
 */
import { setTutorialDismissed } from "../../lib/tutorialStorage";
import { DeleteConfirmDialog } from "../dialogs/DeleteConfirmDialog";
import { DownloadOptionsDialog } from "../dialogs/DownloadOptionsDialog";
import { FilePreviewDialog } from "../dialogs/FilePreviewDialog";
import { NewFolderDialog } from "../dialogs/NewFolderDialog";
import { RenameDialog } from "../dialogs/RenameDialog";
import { TransferFlowBusySheet } from "../dialogs/TransferFlowBusySheet";
import { FileContextMenu } from "../explorer/FileContextMenu";
import { SettingsDialog } from "../settings/SettingsDialog";
import { ShortcutsHelpDialog } from "../settings/ShortcutsHelpDialog";
import { TutorialOverlay } from "../setup/TutorialOverlay";
import { SyncDialog } from "../sync/SyncDialog";
import { ConflictPromptHost } from "../transfer/ConflictPromptHost";
import type { BrowsePanes } from "../../hooks/shell/useBrowsePanes";
import type { useCopyPipeline } from "../../hooks/shell/useCopyPipeline";
import type { useThemeMode } from "../../hooks/shell/useThemeMode";
import type { useTransferJob } from "../../hooks/transfer/useTransferJob";
import type { useTransferPrompts } from "../../hooks/transfer/useTransferPrompts";
import type { useTutorialTour } from "../../hooks/shell/useTutorialTour";
import type { FolderOpenClick } from "../../lib/presets";
import type { SetStateAction } from "react";

type CopyPipeline = ReturnType<typeof useCopyPipeline>;
type TransferJobState = ReturnType<typeof useTransferJob>;
type TransferPrompts = ReturnType<typeof useTransferPrompts>;
type ThemeModeState = ReturnType<typeof useThemeMode>;
type TutorialState = ReturnType<typeof useTutorialTour>;

export function AppOverlays({
  browse,
  copy,
  job,
  prompts,
  theme,
  tutorial,
  selectedDevice,
  currentPath,
  showHiddenFiles,
  setShowHiddenFiles,
  thumbnailsEnabled,
  setThumbnailsEnabled,
  folderOpenClick,
  setFolderOpenClick,
  settingsOpen,
  setSettingsOpen,
  showShortcutsHelp,
  setShowShortcutsHelp,
}: {
  browse: BrowsePanes;
  copy: CopyPipeline;
  job: TransferJobState;
  prompts: TransferPrompts;
  theme: ThemeModeState;
  tutorial: TutorialState;
  selectedDevice: string;
  currentPath: string;
  showHiddenFiles: boolean;
  setShowHiddenFiles: (value: SetStateAction<boolean>) => void;
  thumbnailsEnabled: boolean;
  setThumbnailsEnabled: (value: SetStateAction<boolean>) => void;
  folderOpenClick: FolderOpenClick;
  setFolderOpenClick: (value: SetStateAction<FolderOpenClick>) => void;
  settingsOpen: boolean;
  setSettingsOpen: (value: SetStateAction<boolean>) => void;
  showShortcutsHelp: boolean;
  setShowShortcutsHelp: (value: SetStateAction<boolean>) => void;
}) {
  return (
    <>
      {browse.fileMenu && (
        <FileContextMenu
          selectedDevice={selectedDevice}
          currentPath={currentPath}
          setShowDeleteConfirm={browse.setShowDeleteConfirm}
          fileMenu={browse.fileMenu}
          setFileMenu={browse.setFileMenu}
          macPath={browse.macPath}
          beginRename={copy.beginRename}
          copyPhoneToMacLabel={copy.copyPhoneToMacLabel}
          copyMacToPhoneLabel={copy.copyMacToPhoneLabel}
          copyPhoneSelectionToMac={copy.copyPhoneSelectionToMac}
          copyMacSelectionToPhone={copy.copyMacSelectionToPhone}
          previewFile={browse.previewFile}
          openMacSelectionInFinder={browse.openMacSelectionInFinder}
          copyMacAbsolutePath={browse.copyMacAbsolutePath}
          openNewFolderDialog={browse.openNewFolderDialog}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          thumbnailsEnabled={thumbnailsEnabled}
          onThumbnailsEnabledChange={setThumbnailsEnabled}
          showHiddenFiles={showHiddenFiles}
          onShowHiddenFilesChange={setShowHiddenFiles}
          themeMode={theme.themeMode}
          onThemeModeChange={theme.setThemeMode}
          folderOpenClick={folderOpenClick}
          onFolderOpenClickChange={setFolderOpenClick}
          phoneDefaultFolder={copy.phoneDefaultFolder}
          onPhoneDefaultFolderChange={copy.setPhoneDefaultFolder}
          phoneDefaultMenuOpen={copy.phoneDefaultMenuOpen}
          onPhoneDefaultMenuOpenChange={copy.setPhoneDefaultMenuOpen}
          phoneDefaultPickerRef={copy.phoneDefaultPickerRef}
          phoneCustomPresets={copy.phoneCustomPresets}
          macCustomPresets={copy.macCustomPresets}
          onRemovePhonePreset={copy.removePhonePreset}
          onRemoveMacPreset={copy.removeMacPreset}
          onShowQuickTour={() => {
            setTutorialDismissed(false);
            copy.setPhoneDefaultMenuOpen(false);
            setSettingsOpen(false);
            tutorial.openTutorial();
          }}
          onShowShortcuts={() => {
            setShowShortcutsHelp(true);
            copy.setPhoneDefaultMenuOpen(false);
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {browse.newFolderDialog && (
        <NewFolderDialog
          newFolderDialog={browse.newFolderDialog}
          setNewFolderDialog={browse.setNewFolderDialog}
          newFolderName={browse.newFolderName}
          setNewFolderName={browse.setNewFolderName}
          newFolderBusy={browse.newFolderBusy}
          newFolderInputRef={browse.newFolderInputRef}
          confirmNewFolder={browse.confirmNewFolder}
        />
      )}

      {copy.renameDialog && (
        <RenameDialog
          name={copy.renameDialog.name}
          value={copy.renameDialogValue}
          setValue={copy.setRenameDialogValue}
          busy={copy.renameDialogBusy}
          onCancel={copy.cancelRenameDialog}
          onConfirm={() => void copy.confirmRenameDialog()}
        />
      )}

      {browse.showDeleteConfirm && (
        <DeleteConfirmDialog
          selectedFiles={browse.selectedFiles}
          setShowDeleteConfirm={browse.setShowDeleteConfirm}
          deleting={browse.deleting}
          performDelete={copy.performDelete}
        />
      )}

      {/*
        Download Options: reveal preference and the remembered file conflict default.
        Actual conflicts still open TransferConflictDialog after expansion.
      */}
      {job.downloadOptionsOpen &&
        <DownloadOptionsDialog
          files={browse.files}
          selectedFiles={browse.selectedFiles}
          searchResults={browse.searchResults}
          conflictMode={prompts.conflictMode}
          setConflictMode={prompts.setConflictMode}
          revealAfterDownload={job.revealAfterDownload}
          setRevealAfterDownload={job.setRevealAfterDownload}
          setDownloadOptionsOpen={job.setDownloadOptionsOpen}
          performDownload={copy.performDownload}
        />}

      {prompts.conflictPrompt
        ? <ConflictPromptHost
            conflictMode={prompts.conflictMode}
            conflictPrompt={prompts.conflictPrompt}
            settleConflictPrompt={prompts.settleConflictPrompt}
            cancelConflictPrompt={prompts.cancelConflictPrompt}
          />
        : null}

      {/*
        While expand / scan runs with no question on screen, block both panes
        and show what is happening. Cancel stops the scan before any dialog or
        copy. Nothing has been changed yet.
      */}
      {prompts.transferFlowBusy && !prompts.conflictPrompt ? (
        <TransferFlowBusySheet
          setTransferFlowStatus={prompts.setTransferFlowStatus}
          transferFlowStatus={prompts.transferFlowStatus}
          transferFlowAbortRef={prompts.transferFlowAbortRef}
        />
      ) : null}

      {browse.showPreview && (
        <FilePreviewDialog
          setShowPreview={browse.setShowPreview}
          previewData={browse.previewData}
          previewLoading={browse.previewLoading}
          previewFileName={browse.previewFileName}
          imageOrientation={browse.imageOrientation}
          setImageOrientation={browse.setImageOrientation}
          imageDimensions={browse.imageDimensions}
          setImageDimensions={browse.setImageDimensions}
        />
      )}

      <TutorialOverlay
        open={tutorial.tutorialOpen}
        onStepChange={tutorial.handleTutorialStepChange}
        onClose={tutorial.closeTutorial}
      />

      {showShortcutsHelp && (
        <ShortcutsHelpDialog onClose={() => setShowShortcutsHelp(false)} />
      )}

      {copy.syncDialogOpen && (
        <SyncDialog
          syncStep={copy.syncStep}
          syncPreviewing={copy.syncPreviewing}
          syncScan={copy.syncScan}
          syncScanElapsed={copy.syncScanElapsed}
          savedSyncs={copy.savedSyncs}
          activeSavedSyncId={copy.activeSavedSyncId}
          onActiveSavedSyncIdChange={copy.setActiveSavedSyncId}
          onLoadSavedSync={copy.handleLoadSavedSync}
          onDeleteSavedSync={copy.handleDeleteSavedSync}
          syncLocalPath={copy.syncLocalPath}
          onSyncLocalPathChange={copy.setSyncLocalPath}
          onSelectSyncLocalFolder={() => { void copy.handleSelectSyncLocalFolder(); }}
          syncDevicePath={copy.syncDevicePath}
          onSyncDevicePathChange={copy.setSyncDevicePath}
          syncMatchMode={copy.syncMatchMode}
          onSyncMatchModeChange={copy.setSyncMatchMode}
          syncDirection={copy.syncDirection}
          onSyncDirectionChange={copy.setSyncDirection}
          syncRecursive={copy.syncRecursive}
          onSyncRecursiveChange={copy.setSyncRecursive}
          syncAllowCopy={copy.syncAllowCopy}
          onSyncAllowCopyChange={copy.setSyncAllowCopy}
          syncAllowUpdate={copy.syncAllowUpdate}
          onSyncAllowUpdateChange={copy.setSyncAllowUpdate}
          syncAllowRename={copy.syncAllowRename}
          onSyncAllowRenameChange={copy.setSyncAllowRename}
          syncDeleteMissing={copy.syncDeleteMissing}
          onSyncDeleteMissingChange={copy.setSyncDeleteMissing}
          showAdvancedSync={copy.showAdvancedSync}
          onToggleAdvancedSync={() => copy.setShowAdvancedSync((v) => !v)}
          syncFilePatterns={copy.syncFilePatterns}
          onSyncFilePatternsChange={copy.setSyncFilePatterns}
          syncPatternInput={copy.syncPatternInput}
          onSyncPatternInputChange={copy.setSyncPatternInput}
          showSaveSyncInput={copy.showSaveSyncInput}
          onShowSaveSyncInputChange={copy.setShowSaveSyncInput}
          saveSyncName={copy.saveSyncName}
          onSaveSyncNameChange={copy.setSaveSyncName}
          onSaveSyncConfig={() => { void copy.handleSaveSyncConfig(); }}
          onPreviewSync={() => { void copy.handlePreviewSync(); }}
          onExecuteSync={() => { void copy.handleExecuteSync(); }}
          onClose={copy.handleCloseSyncDialog}
          onBackToConfig={() => copy.setSyncStep("config")}
          syncPreview={copy.syncPreview}
          syncProgress={copy.syncProgress}
          syncResult={copy.syncResult}
        />
      )}
    </>
  );
}
