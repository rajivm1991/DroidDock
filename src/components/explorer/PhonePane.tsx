/**
 * Phone side of the dual pane: places, path, filter, the file view, and the
 * transfer panel, or the not-connected message. Listings and copy stay in the
 * phone and transfer hooks; this only draws them.
 */
import type { RefObject, SetStateAction } from "react";
import { PlaceMarks, type PlaceMarkItem } from "./PlaceMarks";
import { normalizeFolderPath } from "../../lib/presets";
import { FolderHistoryButtons } from "./FolderHistoryButtons";
import { PathBreadcrumb, type PathCrumb } from "./PathBreadcrumb";
import { SelectionActionStrip, SelectionActionStripPlaceholder } from "./SelectionActionStrip";
import { joinColumnPath, visibleColumnEntries } from "../../lib/columnPathCollapse";
import { FileMark } from "./FileMark";
import { FileRow } from "./FileRow";
import { GridItem } from "./GridItem";
import { TransferPanel, type TransferJob } from "../transfer/TransferPanel";
import { invoke } from "@tauri-apps/api/core";
import { type FileEntry } from "../../lib/file-types";
import { type ConflictPromptState, type DropHoverState } from "../../types/transfer";
import { type SortColumn } from "../../lib/sort";
import {
  canZoomInIcon,
  canZoomOutIcon,
  iconGridStyle,
  nextIconSize,
  prevIconSize,
  type IconSize,
} from "../../lib/iconSize";
import { UsbDebuggingGuide } from "./UsbDebuggingGuide";

export interface PhonePaneProps {
  selectedDevice: string;
  currentPath: string;
  setCurrentPath: (value: SetStateAction<string>) => void;
  files: FileEntry[];
  loading: boolean;
  setError: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  thumbnailsEnabled: boolean;
  /** Subtle ring when Phone last received focus or a pane shortcut. */
  isActive?: boolean;
  folderOpenClick: "single" | "double";
  thumbnailCache: Map<string, string>;
  selectedFiles: Set<string>;
  setShowDeleteConfirm: (value: SetStateAction<boolean>) => void;
  deleting: boolean;
  previewLoading: boolean;
  searchQuery: string;
  nameFilter: string;
  setNameFilter: (value: SetStateAction<string>) => void;
  setTransferHistory: (value: SetStateAction<TransferJob[]>) => void;
  transferHistory: TransferJob[];
  searchMode: boolean;
  searchRecursive: boolean;
  searchResults: FileEntry[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  downloading: boolean;
  setTransferJob: (value: SetStateAction<TransferJob | null>) => void;
  transferJob: TransferJob | null;
  transferJobRef: RefObject<TransferJob | null>;
  macPath: string;
  phoneHistory: { stack: string[]; index: number; };
  conflictPrompt: ConflictPromptState | null;
  inAppDragRef: RefObject<{ side: "phone" | "mac"; names: string[]; } | null>;
  phonePaneRef: RefObject<HTMLDivElement | null>;
  transferFlowBusy: boolean;
  sortColumn: "date" | "size" | "name";
  sortDirection: "asc" | "desc";
  applyListHeaderSort: (column: SortColumn) => void;
  setViewMode: (value: SetStateAction<"grid" | "table" | "column">) => void;
  viewMode: "grid" | "table" | "column";
  iconSize: IconSize;
  /** Ceiling for zoom in. Larger than xlarge only while thumbnails are on. */
  iconSizeMax: IconSize;
  setIconSize: (value: SetStateAction<IconSize>) => void;
  columnPath: string[];
  columnFiles: Map<string, FileEntry[]>;
  columnSelected: Map<string, number>;
  activeColumnIndex: number;
  dropHover: DropHoverState | null;
  focusedIndex: number;
  renamingIndex: number;
  renameValue: string;
  setRenameValue: (value: SetStateAction<string>) => void;
  renameInputRef: RefObject<HTMLInputElement | null>;
  phoneHistoryBack: () => void;
  phoneHistoryForward: () => void;
  selectColumnItem: (columnIndex: number, fileIndex: number, file: FileEntry, event?: React.MouseEvent, openDirectory?: boolean) => Promise<void>;
  loadDevices: () => Promise<void>;
  refreshPhoneFolder: () => Promise<void>;
  navigateToDirectory: (dirName: string) => void;
  phonePathCrumbs: () => PathCrumb[];
  loadThumbnail: (file: FileEntry, filePath: string) => Promise<void>;
  handleFileSelect: (fileName: string, index: number, event: React.MouseEvent, rangeSource?: FileEntry[], rangeId?: string) => void;
  clearSelection: () => void;
  handlePhonePaneMouseDown: (event: React.MouseEvent) => void;
  beginRename: (name: string, dir?: string) => void;
  cancelRename: () => void;
  confirmRename: () => Promise<void>;
  performSearch: (pattern?: string, recursive?: boolean) => Promise<void>;
  exitSearchMode: () => void;
  copyPhoneToMacLabel: () => string;
  copyPhoneSelectionToMac: () => void;
  pauseTransfer: () => void;
  resumeTransfer: () => void;
  cancelTransferJob: () => void;
  retryFailedTransfer: () => void;
  handlePreview: () => Promise<void>;
  previewFile: (fileName: string) => void;
  getDisplayFiles: () => FileEntry[];
  beginFileDrag: (event: React.DragEvent, name: string) => void;
  openFileMenu: (event: React.MouseEvent, file: FileEntry) => void;
  openPhoneEmptyMenu: (event: React.MouseEvent) => void;
  sendMacNames: (names: string[]) => Promise<void>;
  phonePlaceMarks: PlaceMarkItem[];
  addPhonePresetFromCurrent: () => void;
  removePhonePreset: (path: string) => void;
}

export function PhonePane({
  selectedDevice,
  currentPath,
  setCurrentPath,
  files,
  loading,
  setError,
  showHiddenFiles,
  thumbnailsEnabled,
  isActive = false,
  folderOpenClick,
  thumbnailCache,
  selectedFiles,
  setShowDeleteConfirm,
  deleting,
  previewLoading,
  searchQuery,
  nameFilter,
  setNameFilter,
  setTransferHistory,
  transferHistory,
  searchMode,
  searchRecursive,
  searchResults,
  searchInputRef,
  downloading,
  setTransferJob,
  transferJob,
  transferJobRef,
  macPath,
  phoneHistory,
  conflictPrompt,
  inAppDragRef,
  phonePaneRef,
  transferFlowBusy,
  sortColumn,
  sortDirection,
  applyListHeaderSort,
  setViewMode,
  viewMode,
  iconSize,
  iconSizeMax,
  setIconSize,
  columnPath,
  columnFiles,
  columnSelected,
  activeColumnIndex,
  dropHover,
  focusedIndex,
  renamingIndex,
  renameValue,
  setRenameValue,
  renameInputRef,
  phoneHistoryBack,
  phoneHistoryForward,
  selectColumnItem,
  loadDevices,
  refreshPhoneFolder,
  navigateToDirectory,
  phonePathCrumbs,
  loadThumbnail,
  handleFileSelect,
  clearSelection,
  handlePhonePaneMouseDown,
  beginRename,
  cancelRename,
  confirmRename,
  performSearch,
  exitSearchMode,
  copyPhoneToMacLabel,
  copyPhoneSelectionToMac,
  pauseTransfer,
  resumeTransfer,
  cancelTransferJob,
  retryFailedTransfer,
  handlePreview,
  previewFile,
  getDisplayFiles,
  beginFileDrag,
  openFileMenu,
  openPhoneEmptyMenu,
  sendMacNames,
  phonePlaceMarks,
  addPhonePresetFromCurrent,
  removePhonePreset,
}: PhonePaneProps) {
  return (
    <div
      ref={phonePaneRef}
      className={`phone-pane${isActive ? " is-active" : ""}`}
      data-tutorial="phone-pane"
      tabIndex={-1}
      onMouseDown={handlePhonePaneMouseDown}
    >
{selectedDevice ? (
  <>
    {/*
      Full-name marks + “+” sit with the kicker on one scrollable line; view
      stays on the right. Does not move them into the global top bar or the
      breadcrumb line.
    */}
    <div className="pane-chrome">
      <div className="pane-chrome-top">
        <div className="pane-chrome-start">
          <p className="pane-chrome-kicker">Phone files</p>
          <PlaceMarks
            ariaLabel="Common phone folders"
            places={phonePlaceMarks}
            activePath={normalizeFolderPath(currentPath)}
            onSelect={(next) => setCurrentPath(next)}
            onAdd={addPhonePresetFromCurrent}
            onRemove={removePhonePreset}
            addDisabled={!selectedDevice || !currentPath}
            addTooltip="Add selected or open folder"
            tutorialTarget="phone-places"
            addTutorialTarget="phone-add-preset"
          />
        </div>
        <div
          className="pane-chrome-actions phone-view-toolbar"
          aria-label="Phone list options"
          data-tutorial="phone-views"
        >
          {/*
            Sort dropdown removed — List Name/Size/Date headers own sorting. View
            still needs a muted label for the List/Icons/Columns group.
          */}
          <div className="toolbar-field">
            <span className="header-field-label" id="phone-view-label">
              View
            </span>
            <div className="control-group" role="group" aria-labelledby="phone-view-label">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`control-btn view-switch tooltip-bottom ${viewMode === "table" ? "active" : ""}`}
                data-tooltip="List view (⌘1)"
                aria-label="List view"
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`control-btn view-switch tooltip-bottom ${viewMode === "grid" ? "active" : ""}`}
                data-tooltip="Grid view (⌘2)"
                aria-label="Grid view"
              >
                Icons
              </button>
              <button
                type="button"
                onClick={() => setViewMode("column")}
                className={`control-btn view-switch tooltip-bottom ${viewMode === "column" ? "active" : ""}`}
                data-tooltip="Column view (⌘3)"
                aria-label="Column view"
              >
                Columns
              </button>
            </div>
          </div>
          {viewMode === "grid" && (
            <div className="control-group" role="group" aria-label="Icon size">
              <button
                type="button"
                onClick={() => setIconSize(prevIconSize(iconSize))}
                className="control-btn tooltip-bottom"
                data-tooltip="Zoom out (⌘-)"
                aria-label="Zoom out"
                disabled={!canZoomOutIcon(iconSize)}
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setIconSize(nextIconSize(iconSize, iconSizeMax))}
                className="control-btn tooltip-bottom"
                data-tooltip="Zoom in (⌘+)"
                aria-label="Zoom in"
                disabled={!canZoomInIcon(iconSize, iconSizeMax)}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="pane-path-row">
        <FolderHistoryButtons
          ariaLabel="Phone folder history"
          canBack={phoneHistory.index > 0}
          canForward={
            phoneHistory.index >= 0 &&
            phoneHistory.index < phoneHistory.stack.length - 1
          }
          onBack={phoneHistoryBack}
          onForward={phoneHistoryForward}
          onRefresh={() => {
            void refreshPhoneFolder();
          }}
          refreshDisabled={transferFlowBusy || !!conflictPrompt}
          tutorialTarget="phone-folder-history"
        />
        <PathBreadcrumb
          ariaLabel="Phone folder path"
          onRoot={() => setCurrentPath("/")}
          rootLabel="/"
          crumbs={phonePathCrumbs()}
        />
      </div>
      <div className="search-bar pane-search">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Filter this folder"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="search-input"
        />
        <button
          type="button"
          className="clear-search-btn"
          disabled={!nameFilter.trim()}
          onClick={() => void performSearch(nameFilter, true)}
        >
          Search subfolders
        </button>
        {searchMode && (
          <button onClick={exitSearchMode} className="clear-search-btn">
            Clear
          </button>
        )}
      </div>
    </div>

    {searchMode && (
      <div className="search-info">
        Showing {searchResults.length} result(s) for "{searchQuery}"
        {searchRecursive ? ` (including subdirectories of ${currentPath})` : ` (in ${currentPath} only)`}
      </div>
    )}

    {/*
      Selection Clear / Preview / Copy → / Delete sit on the phone pane above the
      list. The strip slot is always mounted (empty when idle) so the file list
      never jumps when selection appears, clears, or moves to Mac. Size/count
      stay in the status bar.
    */}
    {selectedFiles.size > 0 ? (
      <SelectionActionStrip
        side="phone"
        showPreview={selectedFiles.size === 1}
        previewLoading={previewLoading}
        copyLabel={copyPhoneToMacLabel()}
        copyDisabled={downloading || !macPath || transferFlowBusy}
        copying={downloading}
        showRename={selectedFiles.size === 1}
        showDelete
        deleteDisabled={deleting}
        deleting={deleting}
        onClear={clearSelection}
        onPreview={() => void handlePreview()}
        onRename={() => {
          const name = [...selectedFiles][0];
          if (name) beginRename(name);
        }}
        onCopy={copyPhoneSelectionToMac}
        onDelete={() => setShowDeleteConfirm(true)}
        tutorialTarget="phone-selection-strip"
      />
    ) : (
      <SelectionActionStripPlaceholder tutorialTarget="phone-selection-strip" />
    )}

    <div
      className="file-list"
      data-tutorial="phone-file-list"
      onContextMenu={openPhoneEmptyMenu}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/plain")) event.preventDefault();
      }}
      onDrop={(event) => {
        const payload = event.dataTransfer.getData("text/plain");
        if (!payload.startsWith("droiddock:")) return;
        let parsed: { side?: string; names?: string[] };
        try {
          parsed = JSON.parse(payload.slice("droiddock:".length));
        } catch {
          return;
        }
        if (parsed.side !== "mac" || !parsed.names) return;
        event.preventDefault();
        event.stopPropagation();
        // HTML5 drop rarely fires under Tauri; when it does, consume the
        // dragend session so we do not start a second copy.
        inAppDragRef.current = null;
        void sendMacNames(parsed.names);
      }}
    >
      {/*
        Loading used to replace the whole list, which flickered on every folder
        open and tore down Columns (lost horizontal focus). Keep showing the
        current list/columns while the open folder reloads.
      */}
      {loading &&
      files.length === 0 &&
      !(viewMode === "column" && columnPath.length > 0) ? (
        <div className="loading">Loading...</div>
      ) : viewMode === 'column' ? (
        <div
          className={`column-view${
            dropHover?.target === "phone" ? " is-drop-targeting" : ""
          }`}
        >
          {columnPath.map((path, columnIndex) => {
            const files = columnFiles.get(path) || [];
            const visibleFiles = visibleColumnEntries(files, showHiddenFiles);
            const selectedIndex = columnSelected.get(path) ?? -1;
            const isActiveColumn = columnIndex === activeColumnIndex;
            const isOpenFolder = path === currentPath;

            return (
              <div
                key={path}
                className={`column-list ${isActiveColumn ? "active" : ""} ${
                  isOpenFolder ? "is-open-folder" : ""
                }`}
                data-column-index={columnIndex}
                data-column-path={path}
              >
                {/*
                  In a deep Columns chain the open folder can be scrolled
                  off-screen; a short cue marks the column whose path is the
                  Copy/drop destination. Does not change destination rules or
                  retarget drops.
                */}
                {isOpenFolder && (
                  <div className="column-open-cue" aria-label="Open folder for copies">
                    Open
                  </div>
                )}
                {visibleFiles.map((file, fileIndex) => {
                  /**
                   * Selection is by file name only. In ancestor columns that
                   * falsely lit rows that share a name with the open folder
                   * (Library under / after Cmd+A in Home). Ancestors show only
                   * the miller path index; the open/active column shows picks.
                   */
                  const isSelected =
                    fileIndex === selectedIndex ||
                    ((isOpenFolder || isActiveColumn) &&
                      selectedFiles.has(file.name));
                  return (
                    <div
                      key={`${path}/${file.name}`}
                      onClick={(event) =>
                        void selectColumnItem(columnIndex, fileIndex, file, event)
                      }
                      onDoubleClick={(event) => {
                        if (file.is_directory && folderOpenClick === "double") {
                          void selectColumnItem(
                            columnIndex,
                            fileIndex,
                            file,
                            event,
                            true,
                          );
                        }
                      }}
                      className={`column-item ${file.is_directory ? 'directory' : 'file'} ${isSelected ? 'selected' : ''}`}
                      data-entry-name={file.name}
                      draggable
                      onContextMenu={(event) => openFileMenu(event, file)}
                      onDragStart={(event) => beginFileDrag(event, file.name)}
                    >
                      <span className="column-item-icon"><FileMark directory={file.is_directory} extension={file.extension} /></span>
                      <span className="column-item-name">{file.name}</span>
                      {file.is_directory && <span className="column-item-arrow">›</span>}
                    </div>
                  );
                })}
                {visibleFiles.length === 0 && (
                  <div className="column-empty">
                    {showHiddenFiles ? "No files" : "No visible files"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === 'table' ? (
        <table className="explorer-table" data-tutorial="phone-list-sort">
          <thead>
            <tr>
              <th
                onClick={() => applyListHeaderSort("name")}
                className={`col-name ${sortColumn === "name" ? "sortable active" : "sortable"}`}
                title="Click to sort by name"
              >
                Name {sortColumn === "name" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th className="col-kind">Kind</th>
              <th
                onClick={() => applyListHeaderSort("size")}
                className={`col-size ${sortColumn === "size" ? "sortable active" : "sortable"}`}
                title="Click to sort by size"
              >
                Size {sortColumn === "size" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
              <th
                onClick={() => applyListHeaderSort("date")}
                className={`col-date ${sortColumn === "date" ? "sortable active" : "sortable"}`}
                title="Click to sort by date"
              >
                Date {sortColumn === "date" && (sortDirection === "asc" ? "↑" : "↓")}
              </th>
            </tr>
          </thead>
          <tbody>
            {getDisplayFiles().map((file, index) => (
              <FileRow
                key={index}
                file={file}
                fileIndex={index}
                onNavigate={() => file.is_directory && navigateToDirectory(file.name)}
                onPreview={() => previewFile(file.name)}
                openFolderOn={folderOpenClick}
                isSelected={selectedFiles.has(file.name)}
                isFocused={focusedIndex === index}
                onSelect={(idx, e) => handleFileSelect(file.name, idx, e)}
                isRenaming={renamingIndex === index}
                renameValue={renameValue}
                onRenameChange={setRenameValue}
                onRenameConfirm={confirmRename}
                onRenameCancel={cancelRename}
                renameInputRef={renameInputRef}
                onContextMenu={(event) => openFileMenu(event, file)}
                onDragStart={(event) => beginFileDrag(event, file.name)}
              />
            ))}
            {getDisplayFiles().length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="empty">
                  {searchMode
                    ? "No files found"
                    : showHiddenFiles
                    ? "No files in this directory"
                    : "No visible files (hidden files are filtered)"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className={`grid-view grid-${iconSize}`} style={iconGridStyle(iconSize)}>
          {/*
            Path, not row index. Index reused the folder tile for a search hit,
            so the photo preview pulled that folder and clearing search left
            the folder showing the photo.
          */}
          {getDisplayFiles().map((file, index) => (
            <GridItem
              key={joinColumnPath(currentPath, file.name)}
              file={file}
              fileIndex={index}
              currentPath={currentPath}
              thumbnailsEnabled={thumbnailsEnabled}
              thumbnailCache={thumbnailCache}
              loadThumbnail={loadThumbnail}
              onNavigate={() => file.is_directory && navigateToDirectory(file.name)}
              onPreview={() => previewFile(file.name)}
              openFolderOn={folderOpenClick}
              isSelected={selectedFiles.has(file.name)}
              isFocused={focusedIndex === index}
              onSelect={(idx, e) => handleFileSelect(file.name, idx, e)}
              onContextMenu={(event) => openFileMenu(event, file)}
              onDragStart={(event) => beginFileDrag(event, file.name)}
            />
          ))}
          {getDisplayFiles().length === 0 && !loading && (
            <div className="empty">
              {searchMode
                ? "No files found"
                : showHiddenFiles
                ? "No files in this directory"
                : "No visible files (hidden files are filtered)"}
            </div>
          )}
        </div>
      )}
    </div>

    {transferJob && (
      <TransferPanel
        job={transferJob}
        onPause={pauseTransfer}
        onResume={resumeTransfer}
        onCancel={cancelTransferJob}
        onDismiss={() => {
          transferJobRef.current = null;
          setTransferJob(null);
        }}
        onRetryFailed={retryFailedTransfer}
        onReveal={() => {
          invoke("reveal_in_finder", { path: transferJob.destination }).catch((err) => {
            setError(`Could not reveal folder: ${err}`);
          });
        }}
      />
    )}
    {!transferJob && transferHistory.length > 0 && (
      <div className="transfer-history" aria-label="Transfers that need attention">
        {/*
          Clean finishes no longer leave a sticky “Finished” chip. History is
          only for failed jobs — Retry plus an obvious dismiss.
        */}
        {transferHistory.map((job) => {
          const failed = job.files.filter((file) => file.status === "failed").length;
          return (
            <div key={job.id} className="transfer-history-row is-failed">
              <div className="transfer-history-copy">
                <span className="transfer-history-title">{job.title}</span>
                <span className="transfer-history-status">
                  {failed} failed — tap Retry or dismiss
                </span>
              </div>
              <button
                type="button"
                className="transfer-history-retry"
                onClick={() => {
                  transferJobRef.current = job;
                  retryFailedTransfer();
                }}
              >
                Retry
              </button>
              <button
                type="button"
                className="transfer-history-dismiss"
                aria-label={`Dismiss ${job.title}`}
                title="Dismiss"
                onClick={() => {
                  setTransferHistory((prev) =>
                    prev.filter((entry) => entry.id !== job.id),
                  );
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    )}

  </>
) : (
  <div className="connect-empty">
    {/*
      This pane only renders after ADB (the phone bridge) is already available —
      install steps belong on AdbSetupScreen. If ADB is later removed, phone ops
      fail and checkAdb returns the person to setup. Phone-side connect steps
      only, including brand and software-version paths for USB debugging. Does
      not mention platform-tools.
    */}
    <h2>Connect your phone</h2>
    <UsbDebuggingGuide />
    {/*
      Cable + refresh is a separate job from the brand Settings guide above —
      its own section so it does not read as a leftover footnote under the
      trademark line.
    */}
    <section className="connect-empty-next" aria-labelledby="connect-empty-next-title">
      <p className="connect-empty-next-kicker">Then plug in</p>
      <h3 id="connect-empty-next-title">Find the phone on this Mac</h3>
      <p className="connect-empty-next-copy">
        Use a data cable, unlock the phone, and tap Allow when it asks. An
        emulator already running shows up here too.
      </p>
      <button
        type="button"
        className="connect-empty-next-btn"
        onClick={loadDevices}
      >
        Look for devices again
      </button>
    </section>
  </div>
)}
    </div>
  );
}
