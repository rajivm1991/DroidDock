/**
 * Path row, place marks, view switch, and filter for This Mac.
 * Listing and Columns stay in the pane body. This only renders the chrome.
 */
import type { RefObject } from "react";
import { FolderHistoryButtons } from "../FolderHistoryButtons";
import { PathBreadcrumb } from "../PathBreadcrumb";
import { PlaceMarks, type PlaceMarkItem } from "../PlaceMarks";
import { macPathCrumbs } from "./macPaneFormat";
import {
  canZoomInIcon,
  canZoomOutIcon,
  nextIconSize,
  prevIconSize,
  type IconSize,
} from "../../../lib/iconSize";
import type { MacIconSize, MacViewMode } from "./macPaneTypes";

export function MacPaneChrome({
  path,
  placeMarks,
  onNavigatePath,
  onCrumbNavigate,
  onAddPlaceMark,
  onRemovePlaceMark,
  viewMode,
  setViewMode,
  iconSize,
  iconSizeMax,
  setIconSize,
  canGoBack,
  canGoForward,
  onHistoryBack,
  onHistoryForward,
  onRefreshFolder,
  refreshDisabled,
  permissionDenied,
  nameFilter,
  setNameFilter,
  filterInputRef,
  searching,
  searchMode,
  searchQuery,
  searchResults,
  onSearch,
  onClearSearch,
}: {
  path: string;
  placeMarks: PlaceMarkItem[];
  onNavigatePath: (path: string) => void;
  onCrumbNavigate: (path: string) => void;
  onAddPlaceMark: () => void;
  onRemovePlaceMark: (path: string) => void;
  viewMode: MacViewMode;
  setViewMode: (mode: MacViewMode) => void;
  iconSize: MacIconSize;
  iconSizeMax: IconSize;
  setIconSize: (size: MacIconSize) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  onRefreshFolder: () => void;
  refreshDisabled: boolean;
  permissionDenied: boolean;
  nameFilter: string;
  setNameFilter: (value: string) => void;
  /** Cmd+F focuses this filter when This Mac is the active pane. */
  filterInputRef?: RefObject<HTMLInputElement | null>;
  searching: boolean;
  searchMode: boolean;
  searchQuery: string;
  searchResults: { length: number };
  onSearch: () => void;
  onClearSearch: () => void;
}) {
  return (
    <>
      <div className="pane-chrome">
        <div className="pane-chrome-top">
          <div className="pane-chrome-start">
            <p className="pane-chrome-kicker">This Mac</p>
            <PlaceMarks
              ariaLabel="Common Mac folders"
              places={placeMarks}
              activePath={path}
              onSelect={onNavigatePath}
              onAdd={onAddPlaceMark}
              onRemove={onRemovePlaceMark}
              addTooltip="Add selected or open folder"
            />
          </div>
          <div className="pane-chrome-actions phone-view-toolbar" aria-label="Mac list options">
            <div className="toolbar-field">
              <span className="header-field-label" id="mac-view-label">
                View
              </span>
              <div className="control-group" role="group" aria-labelledby="mac-view-label">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`control-btn view-switch ${viewMode === "table" ? "active" : ""}`}
                  aria-label="List view"
                >
                  List
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`control-btn view-switch ${viewMode === "grid" ? "active" : ""}`}
                  aria-label="Icons view"
                >
                  Icons
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("column")}
                  className={`control-btn view-switch ${viewMode === "column" ? "active" : ""}`}
                  aria-label="Columns view"
                >
                  Columns
                </button>
              </div>
            </div>
            {viewMode === "grid" && (
              <div className="control-group" role="group" aria-label="Icon size">
                <button
                  type="button"
                  className="control-btn"
                  disabled={!canZoomOutIcon(iconSize)}
                  aria-label="Zoom out"
                  onClick={() => setIconSize(prevIconSize(iconSize))}
                >
                  −
                </button>
                <button
                  type="button"
                  className="control-btn"
                  disabled={!canZoomInIcon(iconSize, iconSizeMax)}
                  aria-label="Zoom in"
                  onClick={() => setIconSize(nextIconSize(iconSize, iconSizeMax))}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="pane-path-row">
          <FolderHistoryButtons
            ariaLabel="Mac folder history"
            canBack={canGoBack}
            canForward={canGoForward}
            onBack={onHistoryBack}
            onForward={onHistoryForward}
            onRefresh={onRefreshFolder}
            refreshDisabled={refreshDisabled}
          />
          <PathBreadcrumb
            ariaLabel="Mac folder path"
            onRoot={() => onCrumbNavigate("/")}
            rootLabel="/"
            crumbs={macPathCrumbs(path, onCrumbNavigate)}
          />
        </div>
        <div className="search-bar pane-search">
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter this folder"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="search-input"
            disabled={permissionDenied}
          />
          <button
            type="button"
            className="clear-search-btn"
            disabled={!nameFilter.trim() || permissionDenied || searching}
            onClick={onSearch}
          >
            {searching ? "Searching…" : "Search subfolders"}
          </button>
          {searchMode && (
            <button type="button" className="clear-search-btn" onClick={onClearSearch}>
              Clear
            </button>
          )}
        </div>
      </div>

      {searchMode && (
        <div className="search-info">
          Showing {searchResults.length} result(s) for &quot;{searchQuery}&quot; under {path}
        </div>
      )}
    </>
  );
}
