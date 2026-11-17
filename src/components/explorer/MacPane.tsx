/**
 * This Mac folder beside the phone.
 *
 * Composes the path chrome, access panel, and List / Icons / Columns. View
 * mode, filter, and search live in useMacFolderView. Column listings live in
 * useMacColumns. This file wires drag, the selection-size report, keyboard
 * focus for This Mac shortcuts, and which body is on screen. It does not own
 * the Mac path or the exclusive selection with the phone — App and
 * useMacExplorer do. Place marks are built by the parent so Settings can
 * manage the same Mac shortcuts. data-tutorial="mac-pane" is only for the
 * one-time tour spotlight.
 */
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type DragEvent,
} from "react";
import type { FileEntry } from "../../lib/file-types";
import { iconGridStyle } from "../../lib/iconSize";
import { calculateGridColumns } from "../../lib/fileDisplay";
import {
  applyTransferDragImage,
  resolveDragItems,
} from "../transfer/TransferMarksStack";
import { MacGridItem } from "./MacGridItem";
import { useMacColumns } from "../../hooks/mac/useMacColumns";
import { useMacFolderView } from "../../hooks/mac/useMacFolderView";
import { MacAccessPanel } from "./mac/MacAccessPanel";
import { MacColumnView } from "./mac/MacColumnView";
import { MacListView } from "./mac/MacListView";
import { MacPaneChrome } from "./mac/MacPaneChrome";
import { type MacPaneHandle, type MacPaneProps } from "./mac/macPaneTypes";

export type { MacPaneHandle } from "./mac/macPaneTypes";

export const MacPane = forwardRef<MacPaneHandle, MacPaneProps>(function MacPane(
  {
    path,
    files,
    loading,
    error,
    permissionDenied,
    selected,
    showHidden,
    placeMarks,
    onOpenFolder,
    onNavigatePath,
    onCrumbNavigate,
    onGrantFolderAccess,
    onAddPlaceMark,
    onRemovePlaceMark,
    onSelect,
    openFolderOn,
    onContextMenu,
    onEmptyContextMenu,
    canGoBack,
    canGoForward,
    onHistoryBack,
    onHistoryForward,
    onRefreshFolder,
    refreshDisabled = false,
    onDropPhonePayload,
    onMacDragStart,
    rootRef,
    listEpoch,
    onActivate,
    thumbnailsEnabled = false,
    iconSizeMax,
    selectionStrip,
    onSelectionEntriesChange,
    onKeyboardSelectionChange,
    isActive = false,
  },
  ref,
) {
  const folder = useMacFolderView({
    path,
    files,
    permissionDenied,
    showHidden,
    thumbnailsEnabled,
    iconSizeMax,
  });
  const columns = useMacColumns({
    viewMode: folder.viewMode,
    path,
    files,
    showHidden,
    permissionDenied,
    listEpoch,
    rootRef,
    openFolderOn,
    onSelect,
    onNavigatePath,
  });
  /**
   * List/Icons keyboard ring. Columns keep focus in columnSelected. Cleared when
   * the open folder changes so a stale index does not highlight the wrong row,
   * then reapplied when the parent restores the folder we just left.
   */
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  const folderRef = useRef(folder);
  folderRef.current = folder;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const pathRef = useRef(path);
  pathRef.current = path;
  const onOpenFolderRef = useRef(onOpenFolder);
  onOpenFolderRef.current = onOpenFolder;
  const onNavigatePathRef = useRef(onNavigatePath);
  onNavigatePathRef.current = onNavigatePath;
  const onKeyboardSelectionChangeRef = useRef(onKeyboardSelectionChange);
  onKeyboardSelectionChangeRef.current = onKeyboardSelectionChange;
  const rootRefObject = rootRef;
  const focusPathRef = useRef(path);

  useEffect(() => {
    if (focusPathRef.current !== path) {
      focusPathRef.current = path;
      setFocusedIndex(-1);
    }
  }, [path]);

  /**
   * After going up, useMacExplorer selects the folder we left. Match the
   * keyboard ring to that name once List/Icons has the new listing.
   * Columns are excluded: the first `.column-item.selected` in the pane is an
   * ancestor path row, and scrollIntoView on it shoved the Open column off
   * the right on the first selection (the next arrow skipped this effect, so
   * Open appeared to jump back).
   */
  useEffect(() => {
    if (folder.viewMode === "column") return;
    if (focusPathRef.current !== path) return;
    if (focusedIndex >= 0) return;
    if (selected.size !== 1) return;
    const only = [...selected][0]!;
    const idx = folder.displayFiles.findIndex((file) => file.name === only);
    if (idx >= 0) {
      setFocusedIndex(idx);
      setTimeout(() => {
        const root = paneRoot();
        const el = root?.querySelector(".file-row.focused, .grid-item.focused");
        el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }, 50);
    }
  }, [selected, folder.displayFiles, focusedIndex, path, folder.viewMode]);

  function paneRoot(): HTMLElement | null {
    if (rootRefObject && typeof rootRefObject === "object" && "current" in rootRefObject) {
      return rootRefObject.current;
    }
    return null;
  }

  function scrollFocusedIntoView() {
    const root = paneRoot();
    const focusedElement = (root ?? document).querySelector(
      ".file-row.focused, .grid-item.focused",
    );
    focusedElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  useImperativeHandle(
    ref,
    () => ({
      selectAllVisibleNames: () => folderRef.current.selectAllVisibleNames(),
      focusOpenColumnForDrag: () => columnsRef.current.focusOpenColumnForDrag(),
      setDropTargeting: (active: boolean) => {
        columnsRef.current.setDropTargeting(active);
      },
      setViewMode: (mode) => folderRef.current.setViewMode(mode),
      setIconSize: (size) => folderRef.current.setIconSize(size),
      getViewMode: () => folderRef.current.viewMode,
      getIconSize: () => folderRef.current.iconSize,
      focusFilterInput: () => filterInputRef.current?.focus(),
      navigateArrow: (key, shiftKey) => {
        const currentFolder = folderRef.current;
        const currentColumns = columnsRef.current;
        const applySelection = (names: Set<string>) => {
          onKeyboardSelectionChangeRef.current?.(names);
        };
        if (currentFolder.viewMode === "column" && !currentFolder.searchMode) {
          const moved = currentColumns.moveColumnFocus(key);
          // Up/down/left select the highlight so Cmd+C works and back keeps the
          // opened folder selected (not only column-index chrome).
          if (
            moved &&
            (key === "ArrowUp" ||
              key === "ArrowDown" ||
              key === "ArrowLeft") &&
            onKeyboardSelectionChangeRef.current
          ) {
            if (shiftKey && key !== "ArrowLeft") {
              const next = new Set(selectedRef.current);
              next.add(moved.name);
              applySelection(next);
            } else {
              applySelection(new Set([moved.name]));
            }
          }
          return;
        }
        const displayFiles = currentFolder.displayFiles;
        if (displayFiles.length === 0) return;
        let current = focusedIndexRef.current;
        if (current < 0) {
          setFocusedIndex(0);
          if (onKeyboardSelectionChangeRef.current) {
            applySelection(
              shiftKey
                ? new Set([...selectedRef.current, displayFiles[0]!.name])
                : new Set([displayFiles[0]!.name]),
            );
          }
          setTimeout(scrollFocusedIntoView, 0);
          return;
        }
        let newIndex = current;
        if (currentFolder.viewMode === "table") {
          if (key === "ArrowUp") newIndex = Math.max(0, current - 1);
          else if (key === "ArrowDown") {
            newIndex = Math.min(displayFiles.length - 1, current + 1);
          }
        } else {
          const cols = calculateGridColumns(paneRoot());
          if (key === "ArrowUp") newIndex = Math.max(0, current - cols);
          else if (key === "ArrowDown") {
            newIndex = Math.min(displayFiles.length - 1, current + cols);
          } else if (key === "ArrowLeft") newIndex = Math.max(0, current - 1);
          else if (key === "ArrowRight") {
            newIndex = Math.min(displayFiles.length - 1, current + 1);
          }
        }
        setFocusedIndex(newIndex);
        if (onKeyboardSelectionChangeRef.current) {
          if (shiftKey) {
            const next = new Set(selectedRef.current);
            next.add(displayFiles[current]!.name);
            next.add(displayFiles[newIndex]!.name);
            applySelection(next);
          } else {
            applySelection(new Set([displayFiles[newIndex]!.name]));
          }
        }
        setTimeout(scrollFocusedIntoView, 0);
      },
      openFocusedFolder: () => {
        const currentFolder = folderRef.current;
        if (currentFolder.viewMode === "column" && !currentFolder.searchMode) {
          const entry = columnsRef.current.focusedColumnEntry();
          if (entry?.is_directory) {
            onOpenFolderRef.current(entry.name);
          }
          return;
        }
        const displayFiles = currentFolder.displayFiles;
        const sel = selectedRef.current;
        if (sel.size === 1) {
          const name = Array.from(sel)[0]!;
          const selected = displayFiles.find((file) => file.name === name);
          if (selected?.is_directory) {
            onOpenFolderRef.current(selected.name);
            return;
          }
        }
        const idx = focusedIndexRef.current;
        const file = displayFiles[idx];
        if (file?.is_directory) onOpenFolderRef.current(file.name);
      },
      navigateParent: () => {
        const current = pathRef.current;
        if (!current || current === "/") return;
        const parent = current.split("/").slice(0, -1).join("/") || "/";
        onNavigatePathRef.current(parent);
      },
      getContextMenuTarget: () => {
        const currentFolder = folderRef.current;
        const currentColumns = columnsRef.current;
        const sel = selectedRef.current;
        const root = paneRoot();
        const paneRect = root?.getBoundingClientRect();
        const fallbackPoint = {
          x: (paneRect?.left ?? 40) + 40,
          y: (paneRect?.top ?? 80) + 80,
        };

        let name: string | null = null;
        let isDirectory = false;
        if (currentFolder.viewMode === "column" && !currentFolder.searchMode) {
          const focused = currentColumns.focusedColumnEntry();
          if (focused) {
            name = focused.name;
            isDirectory = focused.is_directory;
          }
        } else {
          const idx = focusedIndexRef.current;
          const focused = currentFolder.displayFiles[idx];
          if (focused) {
            name = focused.name;
            isDirectory = focused.is_directory;
          }
        }
        if (!name && sel.size > 0) {
          const firstName = Array.from(sel)[0]!;
          name = firstName;
          const pools: FileEntry[][] = [
            currentFolder.displayFiles,
            ...Array.from(currentColumns.columnFiles.values()),
          ];
          for (const pool of pools) {
            const hit = pool.find((f) => f.name === firstName);
            if (hit) {
              isDirectory = hit.is_directory;
              break;
            }
          }
        }
        if (!name) return null;

        const row = root?.querySelector(
          `[data-entry-name="${CSS.escape(name)}"]`,
        ) as HTMLElement | null;
        if (row) {
          row.scrollIntoView({ block: "nearest", behavior: "instant" });
          const rect = row.getBoundingClientRect();
          return {
            x: rect.left + Math.min(24, rect.width / 2),
            y: rect.top + Math.min(12, rect.height / 2),
            name,
            isDirectory,
          };
        }
        return { ...fallbackPoint, name, isDirectory };
      },
    }),
    [],
  );

  /**
   * The status bar used to see only the open-folder listing, so Columns and
   * search selection showed a count without a size. Push matching entries from
   * every Mac listing pool when selection or those pools change.
   */
  useEffect(() => {
    if (!onSelectionEntriesChange) return;
    if (selected.size === 0) {
      onSelectionEntriesChange([]);
      return;
    }
    const pools: FileEntry[][] = [files, folder.displayFiles];
    if (folder.searchMode) pools.push(folder.searchResults);
    for (const list of columns.columnFiles.values()) pools.push(list);
    const found = new Map<string, FileEntry>();
    for (const pool of pools) {
      for (const entry of pool) {
        if (selected.has(entry.name) && !found.has(entry.name)) {
          found.set(entry.name, entry);
        }
      }
    }
    onSelectionEntriesChange(Array.from(found.values()));
  }, [
    onSelectionEntriesChange,
    selected,
    files,
    folder.displayFiles,
    folder.searchMode,
    folder.searchResults,
    columns.columnFiles,
  ]);

  function beginMacDrag(event: DragEvent, fileName: string) {
    const names =
      selected.has(fileName) && selected.size > 1 ? Array.from(selected) : [fileName];
    /*
     * The default drag image was the row under the pointer. Use the same
     * FileMark stack as the phone, for one file or a scattered multi-select.
     * Finder’s own drag image and the destination chip are unchanged.
     */
    applyTransferDragImage(
      event,
      resolveDragItems(names, [
        ...files,
        ...Array.from(columns.columnFiles.values()).flat(),
      ]),
    );
    onMacDragStart(names);
    event.dataTransfer.setData(
      "text/plain",
      `droiddock:${JSON.stringify({ side: "mac", names })}`,
    );
    event.dataTransfer.effectAllowed = "copy";
  }

  const emptyLabel = folder.searchMode
    ? folder.searching
      ? "Searching…"
      : "No files found"
    : "This folder is empty.";

  const showColumns = folder.viewMode === "column" && !folder.searchMode;

  return (
    <section
      ref={rootRef}
      className={`mac-pane${isActive ? " is-active" : ""}`}
      aria-label="This Mac"
      data-tutorial="mac-pane"
      tabIndex={-1}
      onMouseDown={(event) => onActivate?.(event)}
      onDragOver={(event) => {
        // Prefer App’s Tauri hover path; keep preventDefault if HTML5 still fires.
        if (event.dataTransfer.types.includes("text/plain")) event.preventDefault();
      }}
      onDrop={(event) => {
        columns.setDropTargeting(false);
        const payload = event.dataTransfer.getData("text/plain");
        if (!payload.startsWith("droiddock:")) return;
        event.preventDefault();
        event.stopPropagation();
        // HTML5 drop rarely fires under Tauri; when it does, App’s receive
        // path clears the dragend session so we do not start a second copy.
        onDropPhonePayload(payload);
      }}
    >
      <MacPaneChrome
        path={path}
        placeMarks={placeMarks}
        onNavigatePath={onNavigatePath}
        onCrumbNavigate={onCrumbNavigate ?? onNavigatePath}
        onAddPlaceMark={onAddPlaceMark}
        onRemovePlaceMark={onRemovePlaceMark}
        viewMode={folder.viewMode}
        setViewMode={folder.setViewMode}
        iconSize={folder.iconSize}
        iconSizeMax={iconSizeMax}
        setIconSize={folder.setIconSize}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onHistoryBack={onHistoryBack}
        onHistoryForward={onHistoryForward}
        onRefreshFolder={onRefreshFolder}
        refreshDisabled={refreshDisabled}
        permissionDenied={permissionDenied}
        nameFilter={folder.nameFilter}
        setNameFilter={folder.setNameFilter}
        filterInputRef={filterInputRef}
        searching={folder.searching}
        searchMode={folder.searchMode}
        searchQuery={folder.searchQuery}
        searchResults={folder.searchResults}
        onSearch={() => {
          void folder.performMacSearch();
        }}
        onClearSearch={folder.exitSearchMode}
      />

      {selectionStrip}

      <MacAccessPanel
        path={path}
        error={error}
        permissionDenied={permissionDenied}
        onGrantFolderAccess={onGrantFolderAccess}
      />

      {/*
        Blanking on every path change unmounted Columns and flickered when
        listing was slow. Keep columns and the list mounted while reloading.
      */}
      {loading &&
      files.length === 0 &&
      !(folder.viewMode === "column" && columns.columnPath.length > 0) ? (
        <div className="loading">Loading…</div>
      ) : permissionDenied ? null : showColumns ? (
        <MacColumnView
          path={path}
          columnPath={columns.columnPath}
          columnFiles={columns.columnFiles}
          columnSelected={columns.columnSelected}
          activeColumnIndex={columns.activeColumnIndex}
          selected={selected}
          dropTargeting={columns.dropTargeting}
          openFolderOn={openFolderOn}
          onContextMenu={onContextMenu}
          onEmptyContextMenu={onEmptyContextMenu}
          selectColumnItem={columns.selectColumnItem}
          beginMacDrag={beginMacDrag}
        />
      ) : folder.viewMode === "grid" ? (
        <div className="mac-pane-list-wrap" onContextMenu={onEmptyContextMenu}>
          <div
            className={`grid-view grid-${folder.iconSize}`}
            style={iconGridStyle(folder.iconSize)}
          >
            {folder.displayFiles.map((file, fileIndex) => (
              <MacGridItem
                key={file.name}
                file={file}
                fileIndex={fileIndex}
                rangeSource={folder.displayFiles}
                folderPath={path}
                selected={selected.has(file.name)}
                isFocused={focusedIndex === fileIndex}
                thumbnailsEnabled={thumbnailsEnabled}
                openFolderOn={openFolderOn}
                searchMode={folder.searchMode}
                onSelect={(name, event, rangeContext) => {
                  setFocusedIndex(fileIndex);
                  onSelect(name, event, rangeContext);
                }}
                onOpenFolder={onOpenFolder}
                onNavigatePath={onNavigatePath}
                onContextMenu={onContextMenu}
                beginMacDrag={beginMacDrag}
                exitSearchMode={folder.exitSearchMode}
              />
            ))}
            {folder.displayFiles.length === 0 && <div className="empty">{emptyLabel}</div>}
          </div>
        </div>
      ) : (
        <MacListView
          path={path}
          displayFiles={folder.displayFiles}
          selected={selected}
          focusedIndex={focusedIndex}
          sortColumn={folder.sortColumn}
          sortDirection={folder.sortDirection}
          applyListHeaderSort={folder.applyListHeaderSort}
          openFolderOn={openFolderOn}
          searchMode={folder.searchMode}
          emptyLabel={emptyLabel}
          onSelect={(name, event, rangeContext) => {
            if (rangeContext) setFocusedIndex(rangeContext.index);
            onSelect(name, event, rangeContext);
          }}
          onOpenFolder={onOpenFolder}
          onNavigatePath={onNavigatePath}
          onContextMenu={onContextMenu}
          onEmptyContextMenu={onEmptyContextMenu}
          beginMacDrag={beginMacDrag}
          exitSearchMode={folder.exitSearchMode}
        />
      )}
    </section>
  );
});
