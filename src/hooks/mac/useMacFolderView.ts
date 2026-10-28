/**
 * List / Icons choice, sort, filter, and subfolder search for This Mac.
 *
 * Columns keep their own listings in useMacColumns. This hook only decides
 * which rows List and Icons show, and which names Cmd+A may select. It does
 * not navigate, select, or load column panes.
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../../lib/file-types";
import {
  MAC_GLYPH_ICON_KEY,
  MAC_THUMB_ICON_KEY,
  usePaneIconSize,
  type IconSize,
} from "../../lib/iconSize";
import { nextSortState, type SortColumn, type SortDirection } from "../../lib/sort";
import type { MacViewMode } from "../../components/explorer/mac/macPaneTypes";
import { sortFiles } from "../../components/explorer/mac/macPaneFormat";

export function useMacFolderView({
  path,
  files,
  permissionDenied,
  showHidden,
  thumbnailsEnabled,
  iconSizeMax,
}: {
  path: string;
  files: FileEntry[];
  permissionDenied: boolean;
  showHidden: boolean;
  thumbnailsEnabled: boolean;
  iconSizeMax: IconSize;
}) {
  const [viewMode, setViewMode] = useState<MacViewMode>(() => {
    const saved = localStorage.getItem("droiddock-mac-view-mode");
    return saved === "grid" || saved === "column" || saved === "table" ? saved : "table";
  });
  /**
   * This Mac keeps its own Icons size. The thumbnail step is restored when
   * previews come back; the plain step is what you see while they are off.
   */
  const { iconSize: shownIconSize, setIconSize } = usePaneIconSize(
    MAC_THUMB_ICON_KEY,
    MAC_GLYPH_ICON_KEY,
    thumbnailsEnabled,
    iconSizeMax,
  );
  const [sortColumn, setSortColumn] = useState<SortColumn>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  /**
   * Mac List headers were plain labels while sort only lived in a chrome
   * dropdown, which is gone. Header clicks follow the phone List. Kind is
   * not sortable, and Icons / Columns do not show sort controls.
   */
  function applyListHeaderSort(column: SortColumn) {
    const next = nextSortState(column, sortColumn, sortDirection);
    setSortColumn(next.column);
    setSortDirection(next.direction);
  }
  const [nameFilter, setNameFilter] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    localStorage.setItem("droiddock-mac-view-mode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setNameFilter("");
  }, [path]);

  const displayFiles = useMemo(() => {
    if (searchMode) {
      return sortFiles(searchResults, sortColumn, sortDirection);
    }
    const filtered = files.filter((file) => {
      const needle = nameFilter.trim().toLowerCase();
      return needle.length === 0 || file.name.toLowerCase().includes(needle);
    });
    return sortFiles(filtered, sortColumn, sortDirection);
  }, [files, nameFilter, searchMode, searchResults, sortColumn, sortDirection]);

  async function performMacSearch() {
    const pattern = nameFilter.trim();
    if (!pattern || permissionDenied) return;
    setSearching(true);
    try {
      const results = await invoke<FileEntry[]>("search_local_files", {
        path,
        pattern,
        showHidden,
      });
      setSearchResults(results);
      setSearchQuery(pattern);
      setSearchMode(true);
    } catch (err) {
      setSearchResults([]);
      setSearchMode(true);
      setSearchQuery(pattern);
      console.error(err);
    } finally {
      setSearching(false);
    }
  }

  function exitSearchMode() {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  /** Null during search so Cmd+A stays disabled, matching the phone pane. */
  function selectAllVisibleNames(): string[] | null {
    if (searchMode) return null;
    return displayFiles.map((file) => file.name);
  }

  return {
    viewMode,
    setViewMode,
    iconSize: shownIconSize,
    setIconSize,
    sortColumn,
    sortDirection,
    applyListHeaderSort,
    nameFilter,
    setNameFilter,
    searchMode,
    searchQuery,
    searchResults,
    searching,
    displayFiles,
    performMacSearch,
    exitSearchMode,
    selectAllVisibleNames,
  };
}
