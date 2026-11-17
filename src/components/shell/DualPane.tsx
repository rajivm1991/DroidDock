/**
 * Drop chip, then a slot for the top bar, then banners, the two file panes,
 * and the status bar. Browse, copy, and transfer state stay in the shell hooks.
 */
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { MacPane, type MacPaneHandle } from "../explorer/MacPane";
import { PhonePane } from "../explorer/PhonePane";
import {
  SelectionActionStrip,
  SelectionActionStripPlaceholder,
} from "../explorer/SelectionActionStrip";
import { selectionSizeSummary, StatusBar } from "../explorer/StatusBar";
import type { BrowsePanes } from "../../hooks/shell/useBrowsePanes";
import type { useCopyPipeline } from "../../hooks/shell/useCopyPipeline";
import type { useTransferJob } from "../../hooks/transfer/useTransferJob";
import type { useTransferPrompts } from "../../hooks/transfer/useTransferPrompts";
import type { IconSize } from "../../lib/iconSize";
import type { FolderOpenClick } from "../../lib/presets";

type CopyPipeline = ReturnType<typeof useCopyPipeline>;
type TransferJobState = ReturnType<typeof useTransferJob>;
type TransferPrompts = ReturnType<typeof useTransferPrompts>;

export function DualPane({
  chrome,
  browse,
  copy,
  job,
  prompts,
  selectedDevice,
  currentPath,
  setCurrentPath,
  setError,
  showHiddenFiles,
  thumbnailsEnabled,
  folderOpenClick,
  viewMode,
  setViewMode,
  iconSize,
  iconSizeMax,
  setIconSize,
  activePane,
  phonePaneRef,
  macPaneRef,
  macPaneHandleRef,
  loadDevices,
  error,
  successMessage,
  setSuccessMessage,
}: {
  chrome: ReactNode;
  browse: BrowsePanes;
  copy: CopyPipeline;
  job: TransferJobState;
  prompts: TransferPrompts;
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  showHiddenFiles: boolean;
  thumbnailsEnabled: boolean;
  folderOpenClick: FolderOpenClick;
  viewMode: "table" | "grid" | "column";
  setViewMode: Dispatch<SetStateAction<"table" | "grid" | "column">>;
  iconSize: IconSize;
  iconSizeMax: IconSize;
  setIconSize: Dispatch<SetStateAction<IconSize>>;
  activePane: "phone" | "mac";
  phonePaneRef: RefObject<HTMLDivElement | null>;
  macPaneRef: RefObject<HTMLElement | null>;
  macPaneHandleRef: RefObject<MacPaneHandle | null>;
  loadDevices: () => Promise<void>;
  error: string;
  successMessage: string;
  setSuccessMessage: (message: string) => void;
}) {
  const dropHover = copy.dropHover;

  return (
    <>
      {/*
        Floating chip (not a full-window veil) so Columns dim stays visible under
        either-direction drag. Names the open folder on the drop side. Does not
        retarget away from the open folder.
      */}
      {dropHover && (
        <div
          className={`drag-overlay${dropHover.allowed ? "" : " is-blocked"}`}
          aria-live="polite"
        >
          <div className="drag-overlay-content">
            <div className="drag-overlay-text">
              {dropHover.allowed
                ? dropHover.target === "phone"
                  ? `Drop to copy into ${dropHover.folderLabel} on phone`
                  : `Drop to copy into ${dropHover.folderLabel} on This Mac`
                : dropHover.target === "phone"
                  ? `Drop on Open · ${dropHover.folderLabel} on phone`
                  : `Drop on Open · ${dropHover.folderLabel} on This Mac`}
            </div>
          </div>
        </div>
      )}
      {/*
        Quiet tip after Cmd+C — same corner as the drag chip, lighter so it does
        not compete with a transfer. Escape or a successful Cmd+V clears it.
      */}
      {!dropHover && copy.copyHint && (
        <div className="copy-hint-overlay" aria-live="polite">
          <div className="copy-hint-content">
            <div className="copy-hint-text">{copy.copyHint}</div>
          </div>
        </div>
      )}
      {chrome}
      {error && (
        <div className="error">
          {error}
          <button className="close-btn" onClick={() => setError("")} title="Close">×</button>
        </div>
      )}
      {successMessage && (
        <div className="success">
          {successMessage}
          <button className="close-btn" onClick={() => setSuccessMessage("")} title="Close">×</button>
        </div>
      )}
      {job.downloadProgress && (
        <div className="info">
          {job.downloadProgress}
          <button className="close-btn" onClick={() => job.setDownloadProgress("")} title="Close">×</button>
        </div>
      )}
      {job.uploadProgress && (
        <div className="info">
          {job.uploadProgress}
          <button className="close-btn" onClick={() => job.setUploadProgress("")} title="Close">×</button>
        </div>
      )}

      <div className="app-body">
        <div className="app-main with-mac" data-tutorial="dual-pane">
          <PhonePane
            selectedDevice={selectedDevice}
            currentPath={currentPath}
            setCurrentPath={setCurrentPath}
            files={browse.files}
            loading={browse.loading}
            setError={setError}
            showHiddenFiles={showHiddenFiles}
            thumbnailsEnabled={thumbnailsEnabled}
            isActive={activePane === "phone"}
            folderOpenClick={folderOpenClick}
            thumbnailCache={browse.thumbnailCache}
            selectedFiles={browse.selectedFiles}
            setShowDeleteConfirm={browse.setShowDeleteConfirm}
            deleting={browse.deleting}
            previewLoading={browse.previewLoading}
            searchQuery={browse.searchQuery}
            nameFilter={browse.nameFilter}
            setNameFilter={browse.setNameFilter}
            setTransferHistory={job.setTransferHistory}
            transferHistory={job.transferHistory}
            searchMode={browse.searchMode}
            searchRecursive={browse.searchRecursive}
            searchResults={browse.searchResults}
            searchInputRef={browse.searchInputRef}
            downloading={job.downloading}
            setTransferJob={job.setTransferJob}
            transferJob={job.transferJob}
            transferJobRef={job.transferJobRef}
            macPath={browse.macPath}
            phoneHistory={browse.phoneHistory}
            conflictPrompt={prompts.conflictPrompt}
            inAppDragRef={copy.inAppDragRef}
            phonePaneRef={phonePaneRef}
            transferFlowBusy={prompts.transferFlowBusy}
            sortColumn={browse.sortColumn}
            sortDirection={browse.sortDirection}
            applyListHeaderSort={browse.applyListHeaderSort}
            setViewMode={setViewMode}
            viewMode={viewMode}
            iconSize={iconSize}
            iconSizeMax={iconSizeMax}
            setIconSize={setIconSize}
            columnPath={browse.columnPath}
            columnFiles={browse.columnFiles}
            columnSelected={browse.columnSelected}
            activeColumnIndex={browse.activeColumnIndex}
            dropHover={dropHover}
            focusedIndex={browse.focusedIndex}
            renamingIndex={browse.renamingIndex}
            renameValue={browse.renameValue}
            setRenameValue={browse.setRenameValue}
            renameInputRef={browse.renameInputRef}
            phoneHistoryBack={browse.phoneHistoryBack}
            phoneHistoryForward={browse.phoneHistoryForward}
            selectColumnItem={browse.selectColumnItem}
            loadDevices={loadDevices}
            refreshPhoneFolder={browse.refreshPhoneFolder}
            navigateToDirectory={copy.navigateToDirectory}
            phonePathCrumbs={copy.phonePathCrumbs}
            loadThumbnail={browse.loadThumbnail}
            handleFileSelect={browse.handleFileSelect}
            clearSelection={copy.clearSelection}
            handlePhonePaneMouseDown={copy.handlePhonePaneMouseDown}
            beginRename={copy.beginRename}
            cancelRename={copy.cancelRename}
            confirmRename={copy.confirmRename}
            performSearch={copy.performSearch}
            exitSearchMode={copy.exitSearchMode}
            copyPhoneToMacLabel={copy.copyPhoneToMacLabel}
            copyPhoneSelectionToMac={copy.copyPhoneSelectionToMac}
            pauseTransfer={job.pauseTransfer}
            resumeTransfer={job.resumeTransfer}
            cancelTransferJob={copy.cancelTransferJob}
            retryFailedTransfer={copy.retryFailedTransfer}
            handlePreview={browse.handlePreview}
            previewFile={browse.previewFile}
            getDisplayFiles={browse.getDisplayFiles}
            beginFileDrag={copy.beginFileDrag}
            openFileMenu={browse.openFileMenu}
            openPhoneEmptyMenu={browse.openPhoneEmptyMenu}
            sendMacNames={copy.sendMacNames}
            phonePlaceMarks={copy.phonePlaceMarks}
            addPhonePresetFromCurrent={copy.addPhonePresetFromCurrent}
            removePhonePreset={copy.removePhonePreset}
          />
          <MacPane
            ref={macPaneHandleRef}
            path={browse.macPath || "Home"}
            files={browse.macFiles}
            loading={browse.macLoading}
            error={browse.macError}
            permissionDenied={browse.macPermissionDenied}
            selected={browse.macSelected}
            showHidden={showHiddenFiles}
            isActive={activePane === "mac"}
            canGoBack={browse.macHistory.index > 0}
            canGoForward={
              browse.macHistory.index >= 0 &&
              browse.macHistory.index < browse.macHistory.stack.length - 1
            }
            onHistoryBack={browse.macHistoryBack}
            onHistoryForward={browse.macHistoryForward}
            onRefreshFolder={browse.refreshMacFolder}
            refreshDisabled={prompts.transferFlowBusy || !!prompts.conflictPrompt}
            onNavigatePath={(nextPath) => {
              browse.setMacPath(nextPath);
            }}
            onCrumbNavigate={browse.navigateMacFromCrumb}
            placeMarks={copy.macPlaceMarks}
            onOpenFolder={(name) => {
              browse.setMacPath(
                browse.macPath.endsWith("/")
                  ? `${browse.macPath}${name}`
                  : `${browse.macPath}/${name}`,
              );
            }}
            onGrantFolderAccess={() => {
              void browse.chooseMacFolder();
            }}
            onAddPlaceMark={copy.addMacPresetFromCurrent}
            onRemovePlaceMark={copy.removeMacPreset}
            onSelect={browse.handleMacSelect}
            onActivate={browse.handleMacPaneMouseDown}
            onKeyboardSelectionChange={browse.setMacSelectionFromKeyboard}
            openFolderOn={folderOpenClick}
            onContextMenu={browse.openMacFileMenu}
            onEmptyContextMenu={browse.openMacEmptyMenu}
            onSelectionEntriesChange={browse.handleMacSelectionEntries}
            onDropPhonePayload={(payload) => {
              void copy.receivePhoneDrop(payload);
            }}
            onMacDragStart={(names) => {
              copy.inAppDragRef.current = { side: "mac", names };
              copy.setDropHover({
                target: "phone",
                folderLabel: copy.dropLabelsRef.current.phone,
                allowed: false,
              });
            }}
            rootRef={macPaneRef}
            listEpoch={browse.macRefresh}
            thumbnailsEnabled={thumbnailsEnabled}
            iconSizeMax={iconSizeMax}
            selectionStrip={
              browse.macSelected.size > 0 ? (
                <SelectionActionStrip
                  side="mac"
                  copyLabel={copy.copyMacToPhoneLabel()}
                  copyDisabled={
                    job.uploading || prompts.transferFlowBusy || !selectedDevice
                  }
                  copying={job.uploading}
                  onClear={copy.clearSelection}
                  onCopy={copy.copyMacSelectionToPhone}
                />
              ) : (
                <SelectionActionStripPlaceholder />
              )
            }
          />
        </div>
      </div>

      <StatusBar
        phoneStorage={selectedDevice ? browse.storageInfo : null}
        macStorage={browse.macStorageInfo}
        fileCount={
          selectedDevice ? browse.getDisplayFiles().length : browse.macFiles.length
        }
        selectedCount={
          browse.selectedFiles.size > 0 ? browse.selectedFiles.size : browse.macSelected.size
        }
        selectedSizeFragment={
          browse.selectedFiles.size > 0
            ? selectionSizeSummary(
                browse.selectedFiles,
                browse.searchMode
                  ? browse.searchResults
                  : [
                      ...browse.files,
                      ...Array.from(browse.columnFiles.values()).flat(),
                    ],
              ).sizeFragment
            : browse.macSelected.size > 0
              ? selectionSizeSummary(
                  browse.macSelected,
                  browse.macSelectionEntries.length > 0
                    ? browse.macSelectionEntries
                    : browse.macFiles,
                ).sizeFragment
              : ""
        }
      />
    </>
  );
}
