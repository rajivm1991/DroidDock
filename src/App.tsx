import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

interface AdbDevice {
  id: string;
  status: string;
}

interface FileEntry {
  name: string;
  permissions: string;
  size: string;
  date: string;
  is_directory: boolean;
  extension: string | null;
}

interface StorageInfo {
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percentage_used: number;
}

interface FileRowProps {
  file: FileEntry;
  fileIndex: number;
  currentPath: string;
  thumbnailsEnabled: boolean;
  thumbnailCache: Map<string, string>;
  loadThumbnail: (file: FileEntry, filePath: string) => Promise<void>;
  needsThumbnail: (file: FileEntry) => boolean;
  onNavigate: () => void;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (index: number, e: React.MouseEvent) => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
}

// Helper function to format bytes into human-readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface StatusBarProps {
  storageInfo: StorageInfo | null;
  fileCount: number;
  selectedCount: number;
}

function StatusBar({ storageInfo, fileCount, selectedCount }: StatusBarProps) {
  return (
    <div className="status-bar">
      {storageInfo && (
        <div className="status-item storage-item">
          <span className="status-label">Storage:</span>
          <span className="storage-text">
            {formatBytes(storageInfo.used_bytes)} / {formatBytes(storageInfo.total_bytes)}
            {' '}({storageInfo.percentage_used.toFixed(1)}% used)
          </span>
          <div className="storage-bar">
            <div
              className="storage-bar-fill"
              style={{
                width: `${Math.min(storageInfo.percentage_used, 100)}%`,
                backgroundColor:
                  storageInfo.percentage_used > 90 ? '#ff4444' :
                  storageInfo.percentage_used > 75 ? '#ffaa00' :
                  '#4CAF50'
              }}
            />
          </div>
        </div>
      )}
      <div className="status-item">
        <span className="status-label">Items:</span>
        <span>{fileCount}</span>
      </div>
      {selectedCount > 0 && (
        <div className="status-item">
          <span className="status-label">Selected:</span>
          <span>{selectedCount}</span>
        </div>
      )}
    </div>
  );
}

function FileRow({ file, fileIndex, currentPath, thumbnailsEnabled, thumbnailCache, loadThumbnail, needsThumbnail, onNavigate, isSelected, isFocused, onSelect, isRenaming, renameValue, onRenameChange, onRenameConfirm, onRenameCancel, renameInputRef }: FileRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [hasLoadedThumbnail, setHasLoadedThumbnail] = useState(false);

  // Compute file path once and freeze it using useRef to prevent recalculation on re-renders
  // This prevents race conditions when navigating quickly
  const filePathRef = useRef<string | null>(null);
  if (filePathRef.current === null) {
    // If file.name starts with /, it's already a full path (from search results)
    filePathRef.current = file.name.startsWith("/")
      ? file.name
      : currentPath === "/"
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
  }
  const filePath = filePathRef.current;

  useEffect(() => {
    if (!thumbnailsEnabled || !needsThumbnail(file) || hasLoadedThumbnail) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoadedThumbnail) {
            console.log(`📸 Row entered viewport: ${file.name} - triggering thumbnail load`);
            // Pass the computed filePath to avoid race conditions with currentPath changes
            loadThumbnail(file, filePath);
            setHasLoadedThumbnail(true);
          }
        });
      },
      { rootMargin: "50px" } // Start loading 50px before element is visible
    );

    const currentRow = rowRef.current;
    if (currentRow) {
      observer.observe(currentRow);
    }

    return () => {
      if (currentRow) {
        observer.unobserve(currentRow);
      }
    };
  }, [thumbnailsEnabled, file, hasLoadedThumbnail, loadThumbnail, needsThumbnail, filePath]);

  // Reset the thumbnail loading state if the file changes (different file with same component)
  useEffect(() => {
    setHasLoadedThumbnail(false);
    filePathRef.current = null;
  }, [file.name]);

  const thumbnailUrl = thumbnailCache.get(filePath);

  return (
    <tr
      ref={rowRef}
      onClick={(e) => onSelect(fileIndex, e)}
      className={`file-row ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
    >
      <td>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(fileIndex, e);
          }}
          className="file-checkbox"
        />
        {thumbnailsEnabled && thumbnailUrl ? (
          <img src={thumbnailUrl} alt={file.name} className="thumbnail" />
        ) : (
          <span className="icon">{file.is_directory ? "📁" : "📄"}</span>
        )}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onRenameConfirm();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onRenameCancel();
              }
            }}
            onBlur={onRenameCancel}
            onClick={(e) => e.stopPropagation()}
            className="rename-input"
          />
        ) : (
          <span
            className={file.is_directory ? "file-name clickable" : "file-name"}
            onClick={(e) => {
              if (file.is_directory) {
                e.stopPropagation();
                onNavigate();
              }
            }}
          >
            {file.name}
          </span>
        )}
      </td>
      <td>{file.is_directory ? "-" : formatBytes(parseInt(file.size))}</td>
      <td>{file.date}</td>
    </tr>
  );
}

interface GridItemProps {
  file: FileEntry;
  fileIndex: number;
  currentPath: string;
  thumbnailsEnabled: boolean;
  thumbnailCache: Map<string, string>;
  loadThumbnail: (file: FileEntry, filePath: string) => Promise<void>;
  needsThumbnail: (file: FileEntry) => boolean;
  onNavigate: () => void;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (index: number, e: React.MouseEvent) => void;
}

function GridItem({ file, fileIndex, currentPath, thumbnailsEnabled, thumbnailCache, loadThumbnail, needsThumbnail, onNavigate, isSelected, isFocused, onSelect }: GridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [hasLoadedThumbnail, setHasLoadedThumbnail] = useState(false);

  // Compute file path once
  const filePathRef = useRef<string | null>(null);
  if (filePathRef.current === null) {
    filePathRef.current = file.name.startsWith("/")
      ? file.name
      : currentPath === "/"
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;
  }
  const filePath = filePathRef.current;

  useEffect(() => {
    if (!thumbnailsEnabled || !needsThumbnail(file) || hasLoadedThumbnail) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoadedThumbnail) {
            loadThumbnail(file, filePath);
            setHasLoadedThumbnail(true);
          }
        });
      },
      { rootMargin: "50px" }
    );

    const currentItem = itemRef.current;
    if (currentItem) {
      observer.observe(currentItem);
    }

    return () => {
      if (currentItem) {
        observer.unobserve(currentItem);
      }
    };
  }, [thumbnailsEnabled, file, hasLoadedThumbnail, loadThumbnail, needsThumbnail, filePath]);

  useEffect(() => {
    setHasLoadedThumbnail(false);
    filePathRef.current = null;
  }, [file.name]);

  const thumbnailUrl = thumbnailCache.get(filePath);

  return (
    <div
      ref={itemRef}
      onClick={(e) => {
        if (file.is_directory) {
          onNavigate();
        } else {
          onSelect(fileIndex, e);
        }
      }}
      className={`grid-item ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(fileIndex, e);
        }}
        className="grid-item-checkbox"
      />
      <div className="grid-item-icon">
        {thumbnailsEnabled && thumbnailUrl ? (
          <img src={thumbnailUrl} alt={file.name} className="grid-thumbnail" />
        ) : (
          <span className="icon-large">{file.is_directory ? "📁" : "📄"}</span>
        )}
      </div>
      <div className="grid-item-name">{file.name}</div>
    </div>
  );
}

function App() {
  const [adbAvailable, setAdbAvailable] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [currentPath, setCurrentPath] = useState<string>("/storage/emulated/0");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [showHiddenFiles, setShowHiddenFiles] = useState<boolean>(false);
  const [adbPath, setAdbPath] = useState<string>("");
  const [customAdbPath, setCustomAdbPath] = useState<string>("");
  const [thumbnailsEnabled, setThumbnailsEnabled] = useState<boolean>(false);
  const [thumbnailCache, setThumbnailCache] = useState<Map<string, string>>(new Map());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // File selection and deletion state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchRecursive, setSearchRecursive] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  // File transfer state
  const [downloading, setDownloading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  // Sort state
  const [sortColumn, setSortColumn] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // View mode state
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'column'>('table');
  const [iconSize, setIconSize] = useState<'small' | 'medium' | 'large' | 'xlarge'>('medium');

  // Column view state
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [columnFiles, setColumnFiles] = useState<Map<string, FileEntry[]>>(new Map());
  const [columnSelected, setColumnSelected] = useState<Map<string, number>>(new Map());
  const [activeColumnIndex, setActiveColumnIndex] = useState<number>(0);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState<boolean>(false);
  // Store focused index for each path to restore when navigating back
  const focusedIndexHistory = useRef<Map<string, number>>(new Map());

  // Rename state
  const [renamingIndex, setRenamingIndex] = useState<number>(-1);
  const [renameValue, setRenameValue] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const justRenamedFile = useRef<string | null>(null);

  // Check if ADB is available on startup
  useEffect(() => {
    checkAdb();
  }, []);

  // Load devices when ADB becomes available
  useEffect(() => {
    if (adbAvailable) {
      loadDevices();
    }
  }, [adbAvailable]);

  // Detect storage path when device is selected
  useEffect(() => {
    if (selectedDevice) {
      detectStoragePath();
    }
  }, [selectedDevice]);

  // Load files when device or path changes
  useEffect(() => {
    if (selectedDevice && currentPath) {
      loadFiles();
      // Clear selection when path changes
      setSelectedFiles(new Set());
      setLastSelectedIndex(-1);
    }
  }, [selectedDevice, currentPath]);

  // Reset focus when files load
  useEffect(() => {
    if (files.length > 0) {
      // If we just renamed a file, find its new position and focus on it
      if (justRenamedFile.current) {
        // Search in the DISPLAYED files (filtered and sorted), not raw files array
        const displayedFiles = getDisplayFiles();
        const newIndex = displayedFiles.findIndex(f => f.name === justRenamedFile.current);
        if (newIndex >= 0) {
          setFocusedIndex(newIndex);
          // Scroll to the renamed file after a short delay
          setTimeout(() => {
            const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
            focusedElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 100);
        }
        justRenamedFile.current = null; // Clear the flag
      } else {
        // Check if we have a saved focus index for this path
        const savedIndex = focusedIndexHistory.current.get(currentPath);
        if (savedIndex !== undefined && savedIndex >= 0 && savedIndex < files.length) {
          // Restore saved focus index
          setFocusedIndex(savedIndex);
          // Scroll to the restored focus after a short delay
          setTimeout(() => {
            const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
            focusedElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 100);
        } else if (focusedIndex < 0 || focusedIndex >= files.length) {
          // Otherwise reset to first item if current index is invalid
          setFocusedIndex(0);
        }
      }
    } else if (files.length === 0) {
      setFocusedIndex(-1);
    }
  }, [files, currentPath]);

  // Load storage info when device or path changes
  useEffect(() => {
    if (selectedDevice && currentPath) {
      loadStorageInfo();
    }
  }, [selectedDevice, currentPath]);

  // Close settings dropdown when clicking outside
  useEffect(() => {
    if (!settingsOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.settings-dropdown')) {
        setSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [settingsOpen]);

  // Initialize column view when switching to it or when path changes
  useEffect(() => {
    if (viewMode === 'column' && selectedDevice && currentPath) {
      initializeColumnView();
    }
  }, [viewMode, currentPath, selectedDevice]);

  async function initializeColumnView() {
    if (!selectedDevice || !currentPath) return;

    // Build the column path from currentPath
    const segments = currentPath.split('/').filter(Boolean);
    const paths: string[] = ['/'];

    // Build full paths for each segment
    for (let i = 0; i < segments.length; i++) {
      paths.push('/' + segments.slice(0, i + 1).join('/'));
    }

    setColumnPath(paths);
    setActiveColumnIndex(paths.length - 1);

    // Load files for each column path
    const newColumnFiles = new Map<string, FileEntry[]>();

    for (const path of paths) {
      try {
        const fileList = await invoke<FileEntry[]>("list_files", {
          deviceId: selectedDevice,
          path: path,
        });
        newColumnFiles.set(path, fileList);
      } catch (err) {
        console.error(`Failed to load files for ${path}:`, err);
        newColumnFiles.set(path, []);
      }
    }

    setColumnFiles(newColumnFiles);
  }

  async function loadColumnFiles(path: string): Promise<FileEntry[]> {
    if (!selectedDevice) return [];

    try {
      const fileList = await invoke<FileEntry[]>("list_files", {
        deviceId: selectedDevice,
        path: path,
      });
      return fileList;
    } catch (err) {
      console.error(`Failed to load files for ${path}:`, err);
      return [];
    }
  }

  async function selectColumnItem(columnIndex: number, fileIndex: number, file: FileEntry) {
    if (!file.is_directory) {
      // For files, just update selection
      const path = columnPath[columnIndex];
      setColumnSelected(new Map(columnSelected).set(path, fileIndex));
      setActiveColumnIndex(columnIndex);
      return;
    }

    // For directories, add a new column
    const selectedPath = file.name.startsWith("/")
      ? file.name
      : columnPath[columnIndex] === "/"
      ? `/${file.name}`
      : `${columnPath[columnIndex]}/${file.name}`;

    // Remove columns after the selected one
    const newPaths = columnPath.slice(0, columnIndex + 1);
    newPaths.push(selectedPath);

    // Load files for the new column
    const fileList = await loadColumnFiles(selectedPath);

    // Update state
    const newColumnFiles = new Map(columnFiles);
    newColumnFiles.set(selectedPath, fileList);

    const newSelected = new Map(columnSelected);
    newSelected.set(columnPath[columnIndex], fileIndex);

    setColumnPath(newPaths);
    setColumnFiles(newColumnFiles);
    setColumnSelected(newSelected);
    setActiveColumnIndex(newPaths.length - 1);

    // Also update currentPath to keep breadcrumb in sync
    setCurrentPath(selectedPath);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts when typing in input fields
      const isTyping = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      // Ctrl/Cmd + /: Show keyboard shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcutsHelp(true);
      }
      // Ctrl/Cmd + F: Focus search
      else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Ctrl/Cmd + A: Select all
      else if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !searchMode) {
        e.preventDefault();
        selectAll();
      }
      // Cmd/Ctrl + Up Arrow: Navigate to parent directory
      else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        navigateUp();
      }
      // Cmd/Ctrl + O: Open highlighted folder
      else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        if (!loading && focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
          const file = getDisplayFiles()[focusedIndex];
          if (file.is_directory) {
            navigateToDirectory(file.name);
          }
        }
      }
      // Cmd/Ctrl + 1: Switch to table view
      else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setViewMode('table');
      }
      // Cmd/Ctrl + 2: Switch to grid view
      else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setViewMode('grid');
      }
      // Cmd/Ctrl + 3: Switch to column view
      else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        setViewMode('column');
      }
      // Cmd/Ctrl + Shift + .: Toggle show hidden files
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '.') {
        e.preventDefault();
        setShowHiddenFiles(!showHiddenFiles);
      }
      // Cmd/Ctrl + T: Toggle thumbnails
      else if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        setThumbnailsEnabled(!thumbnailsEnabled);
      }
      // Space: Toggle selection on focused file
      else if (!isTyping && e.key === ' ') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
          const file = getDisplayFiles()[focusedIndex];
          const newSelection = new Set(selectedFiles);
          if (newSelection.has(file.name)) {
            newSelection.delete(file.name);
          } else {
            newSelection.add(file.name);
          }
          setSelectedFiles(newSelection);
        }
      }
      // Arrow keys: Navigate in list
      else if (!isTyping && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();

        if (viewMode === 'column') {
          // Column view: left/right moves between columns, up/down navigates within column
          if (e.key === 'ArrowLeft') {
            // Move to previous column
            if (activeColumnIndex > 0) {
              setActiveColumnIndex(activeColumnIndex - 1);
              setTimeout(() => {
                const activeColumn = document.querySelector(`.column-list[data-column-index="${activeColumnIndex - 1}"]`);
                activeColumn?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
              }, 0);
            }
          } else if (e.key === 'ArrowRight') {
            // Move to next column
            if (activeColumnIndex < columnPath.length - 1) {
              setActiveColumnIndex(activeColumnIndex + 1);
              setTimeout(() => {
                const activeColumn = document.querySelector(`.column-list[data-column-index="${activeColumnIndex + 1}"]`);
                activeColumn?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
              }, 0);
            }
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Navigate within active column
            const path = columnPath[activeColumnIndex];
            const files = columnFiles.get(path) || [];
            if (files.length === 0) return;

            const currentSelected = columnSelected.get(path) ?? -1;
            let newSelected = currentSelected;

            if (e.key === 'ArrowUp') {
              newSelected = currentSelected <= 0 ? files.length - 1 : currentSelected - 1;
            } else if (e.key === 'ArrowDown') {
              newSelected = currentSelected >= files.length - 1 ? 0 : currentSelected + 1;
            }

            setColumnSelected(new Map(columnSelected).set(path, newSelected));

            setTimeout(() => {
              const focusedElement = document.querySelector(`.column-item.selected`);
              focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 0);
          }
        } else {
          const displayFiles = getDisplayFiles();
          if (displayFiles.length === 0) return;

          // If nothing is focused yet, start at first item on any arrow key
          if (focusedIndex < 0) {
            setFocusedIndex(0);
            setTimeout(() => {
              const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
              focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 0);
            return;
          }

          let newIndex = focusedIndex;

          if (viewMode === 'table') {
            // Table view: only up/down arrows
            if (e.key === 'ArrowUp') {
              newIndex = focusedIndex <= 0 ? displayFiles.length - 1 : focusedIndex - 1;
            } else if (e.key === 'ArrowDown') {
              newIndex = focusedIndex >= displayFiles.length - 1 ? 0 : focusedIndex + 1;
            }
          } else {
            // Grid view: all four arrows
            // Calculate grid columns based on container width and icon size
            const gridSizes = { small: 80, medium: 120, large: 160, xlarge: 200 };
            const itemWidth = gridSizes[iconSize] + 12; // grid gap
            const containerWidth = document.querySelector('.grid-view')?.clientWidth || 800;
            const cols = Math.floor(containerWidth / itemWidth);

            if (e.key === 'ArrowUp') {
              newIndex = focusedIndex - cols;
              if (newIndex < 0) newIndex = displayFiles.length - 1;
            } else if (e.key === 'ArrowDown') {
              newIndex = focusedIndex + cols;
              if (newIndex >= displayFiles.length) newIndex = 0;
            } else if (e.key === 'ArrowLeft') {
              newIndex = focusedIndex <= 0 ? displayFiles.length - 1 : focusedIndex - 1;
            } else if (e.key === 'ArrowRight') {
              newIndex = focusedIndex >= displayFiles.length - 1 ? 0 : focusedIndex + 1;
            }
          }

          setFocusedIndex(newIndex);

          // Scroll focused item into view
          setTimeout(() => {
            const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
            focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 0);
        }
      }
      // Cmd/Ctrl + Delete: Delete selected or focused files
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (selectedFiles.size > 0) {
          setShowDeleteConfirm(true);
        } else if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
          // Delete focused file if nothing selected
          const file = getDisplayFiles()[focusedIndex];
          setSelectedFiles(new Set([file.name]));
          setShowDeleteConfirm(true);
        }
      }
      // Cmd/Ctrl + D: Download selected or focused files
      else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        if (selectedFiles.size > 0) {
          handleDownload();
        } else if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
          // Download focused file if nothing selected
          const file = getDisplayFiles()[focusedIndex];
          setSelectedFiles(new Set([file.name]));
          handleDownload();
        }
      }
      // Enter: Rename focused file
      else if (!isTyping && !loading && e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
        e.preventDefault();
        const file = getDisplayFiles()[focusedIndex];
        startRename(focusedIndex, file.name);
      }
      // Escape: Close modals/popups first, then clear selection/focus
      else if (e.key === 'Escape') {
        if (renamingIndex >= 0) {
          cancelRename();
        } else if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
        } else if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else if (searchMode) {
          exitSearchMode();
        } else if (selectedFiles.size > 0) {
          clearSelection();
        } else if (focusedIndex >= 0) {
          setFocusedIndex(-1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, searchMode, focusedIndex, viewMode, iconSize, showHiddenFiles, thumbnailsEnabled, showShortcutsHelp, showDeleteConfirm, renamingIndex, loading]);

  async function checkAdb() {
    try {
      const currentPath = await invoke<string>("get_current_adb_path");
      setAdbPath(currentPath);

      const available = await invoke<boolean>("check_adb");
      setAdbAvailable(available);
    } catch (err) {
      setAdbAvailable(false);
      setError("ADB is not installed or not in PATH");
    }
  }

  async function setCustomAdb() {
    if (!customAdbPath) return;

    try {
      await invoke("set_adb_path", { path: customAdbPath });
      setError("");
      await checkAdb();
    } catch (err) {
      setError(`Failed to set ADB path: ${err}`);
    }
  }

  async function detectStoragePath() {
    if (!selectedDevice) return;

    try {
      const detectedPath = await invoke<string>("detect_storage_path", {
        deviceId: selectedDevice,
      });
      setCurrentPath(detectedPath);
    } catch (err) {
      console.error(`Failed to detect storage path: ${err}`);
      // Fall back to default path on error
      setCurrentPath("/storage/emulated/0");
    }
  }

  async function loadDevices() {
    try {
      setError("");
      const deviceList = await invoke<AdbDevice[]>("get_devices");
      setDevices(deviceList);
      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0].id);
      } else if (deviceList.length === 0) {
        setError("No devices connected. Please connect an Android device via ADB.");
      }
    } catch (err) {
      setError(`Failed to get devices: ${err}`);
    }
  }

  async function loadFiles() {
    try {
      setLoading(true);
      setError("");
      const fileList = await invoke<FileEntry[]>("list_files", {
        deviceId: selectedDevice,
        path: currentPath,
      });
      setFiles(fileList);
    } catch (err) {
      setError(`Failed to list files: ${err}`);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStorageInfo() {
    if (!selectedDevice || !currentPath) return;

    try {
      const info = await invoke<StorageInfo>("get_storage_info", {
        deviceId: selectedDevice,
        path: currentPath,
      });
      setStorageInfo(info);
    } catch (err) {
      console.error(`Failed to get storage info: ${err}`);
      setStorageInfo(null);
    }
  }

  function navigateToDirectory(dirName: string) {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }

    // If dirName starts with /, it's already a full path (from search results)
    const newPath = dirName.startsWith("/")
      ? dirName
      : currentPath === "/"
      ? `/${dirName}`
      : `${currentPath}/${dirName}`;
    setCurrentPath(newPath);
    // Exit search mode when navigating to a directory
    if (searchMode) {
      exitSearchMode();
    }
  }

  function navigateUp() {
    if (currentPath === "/") return;
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/";
    setCurrentPath(parentPath);
  }

  function getPathSegments() {
    return currentPath.split("/").filter(Boolean);
  }

  function navigateToSegment(index: number) {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    const segments = getPathSegments();
    const newPath = "/" + segments.slice(0, index + 1).join("/");
    setCurrentPath(newPath);
  }

  // Storage detection helpers
  function isInternalStorage(path: string): boolean {
    return path.startsWith("/storage/emulated/0") || path === "/storage/emulated/0";
  }

  function isExternalSD(path: string): boolean {
    // External SD cards typically have paths like /storage/XXXX-XXXX
    const match = path.match(/^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}/i);
    return match !== null;
  }

  function getDisplaySegments(): { label: string; isStorage: boolean; actualIndex: number }[] {
    const segments = getPathSegments();
    const result: { label: string; isStorage: boolean; actualIndex: number }[] = [];

    // Check if we're in internal storage
    if (isInternalStorage(currentPath)) {
      // Add internal storage label
      result.push({ label: "Internal storage", isStorage: true, actualIndex: -1 });

      // Add segments after /storage/emulated/0
      const internalPrefix = ["storage", "emulated", "0"];
      segments.forEach((seg, idx) => {
        if (!internalPrefix.includes(seg)) {
          result.push({ label: seg, isStorage: false, actualIndex: idx });
        }
      });
    } else if (isExternalSD(currentPath)) {
      // Add SD card label
      result.push({ label: "SD Card", isStorage: true, actualIndex: -1 });

      // Add segments after /storage/XXXX-XXXX
      let foundSD = false;
      segments.forEach((seg, idx) => {
        if (foundSD) {
          result.push({ label: seg, isStorage: false, actualIndex: idx });
        } else if (seg.match(/^[0-9A-F]{4}-[0-9A-F]{4}$/i)) {
          foundSD = true;
        }
      });
    } else {
      // Regular path display
      segments.forEach((seg, idx) => {
        result.push({ label: seg, isStorage: false, actualIndex: idx });
      });
    }

    return result;
  }

  function navigateToHome() {
    // Save current focused index before navigating away
    if (focusedIndex >= 0) {
      focusedIndexHistory.current.set(currentPath, focusedIndex);
    }
    // Navigate to the detected storage path (or fall back to /storage/emulated/0)
    setCurrentPath(currentPath.startsWith("/storage/emulated/0")
      ? "/storage/emulated/0"
      : "/storage/emulated/0");
  }

  function getVisibleFiles() {
    const visibleFiles = showHiddenFiles
      ? files
      : files.filter(file => !file.name.startsWith('.'));

    // Sort based on selected column and direction
    return visibleFiles.sort((a, b) => {
      // Always keep directories grouped (at top if asc, bottom if desc for most columns)
      const dirComparison = sortColumn === 'name' && sortDirection === 'desc'
        ? (a.is_directory && !b.is_directory ? 1 : !a.is_directory && b.is_directory ? -1 : 0)
        : (a.is_directory && !b.is_directory ? -1 : !a.is_directory && b.is_directory ? 1 : 0);

      if (dirComparison !== 0) return dirComparison;

      let comparison = 0;

      switch (sortColumn) {
        case 'name':
          comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          break;
        case 'size':
          const sizeA = a.is_directory ? 0 : parseInt(a.size);
          const sizeB = b.is_directory ? 0 : parseInt(b.size);
          comparison = sizeA - sizeB;
          break;
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  function isImageFile(extension: string | null): boolean {
    if (!extension) return false;
    const ext = extension.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  }

  function isVideoFile(extension: string | null): boolean {
    if (!extension) return false;
    const ext = extension.toLowerCase();
    return ['mp4', 'avi', 'mov', 'mkv', 'webm', '3gp', 'm4v'].includes(ext);
  }

  function needsThumbnail(file: FileEntry): boolean {
    return !file.is_directory && (isImageFile(file.extension) || isVideoFile(file.extension));
  }

  async function loadThumbnail(file: FileEntry, filePath: string) {
    if (!thumbnailsEnabled || !selectedDevice) return;

    // Check cache first
    if (thumbnailCache.has(filePath)) {
      return;
    }

    // Capture the current device ID to check if it changes during loading
    const deviceAtStart = selectedDevice;

    console.log(`Loading thumbnail - filePath: ${filePath}, extension: ${file.extension}, size: ${file.size}`);

    try {
      const thumbnailData = await invoke<string>("get_thumbnail", {
        deviceId: selectedDevice,
        filePath: filePath,
        extension: file.extension || "",
        fileSize: file.size,
      });

      // Only update cache if we're still on the same device (user hasn't navigated away)
      if (selectedDevice !== deviceAtStart) {
        console.log(`⊘ Thumbnail load aborted for ${file.name}: device changed during load`);
        return;
      }

      console.log(`Thumbnail result for ${file.name}:`, thumbnailData.substring(0, 50));

      if (thumbnailData && !thumbnailData.includes("placeholder") && !thumbnailData.includes("size-too-large")) {
        setThumbnailCache(prev => new Map(prev).set(filePath, thumbnailData));
        console.log(`✓ Thumbnail cached for ${file.name}`);
      } else {
        console.warn(`✗ Thumbnail skipped for ${file.name}: ${thumbnailData}`);
      }
    } catch (err) {
      // Only show error if we're still on the same device
      if (selectedDevice === deviceAtStart) {
        console.error(`✗ Failed to load thumbnail for ${file.name}:`, err);
        setError(`Thumbnail error for ${file.name}: ${err}`);
      } else {
        console.log(`⊘ Thumbnail error suppressed for ${file.name}: user navigated away`);
      }
    }
  }

  function handleFileSelect(fileName: string, index: number, event: React.MouseEvent) {
    if (event.shiftKey && lastSelectedIndex !== -1) {
      // Range select with Shift
      const visibleFiles = getDisplayFiles();
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeFiles = visibleFiles.slice(start, end + 1).map(f => f.name);

      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        rangeFiles.forEach(name => newSet.add(name));
        return newSet;
      });
    } else if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      setSelectedFiles(prev => {
        const newSet = new Set(prev);
        if (newSet.has(fileName)) {
          newSet.delete(fileName);
        } else {
          newSet.add(fileName);
        }
        return newSet;
      });
      setLastSelectedIndex(index);
    } else {
      // Single select
      setSelectedFiles(new Set([fileName]));
      setLastSelectedIndex(index);
    }
  }

  function selectAll() {
    const visibleFiles = getVisibleFiles();
    setSelectedFiles(new Set(visibleFiles.map(f => f.name)));
  }

  function clearSelection() {
    setSelectedFiles(new Set());
    setLastSelectedIndex(-1);
  }

  async function performDelete() {
    if (!selectedDevice || selectedFiles.size === 0) return;

    setDeleting(true);
    setError("");

    const filesToDelete = Array.from(selectedFiles);
    let successCount = 0;
    let errorCount = 0;

    for (const fileName of filesToDelete) {
      // Find file in both files and searchResults
      const file = files.find(f => f.name === fileName) || searchResults.find(f => f.name === fileName);
      if (!file) continue;

      // If fileName starts with /, it's already a full path (from search results)
      const filePath = fileName.startsWith("/")
        ? fileName
        : currentPath === "/"
        ? `/${fileName}`
        : `${currentPath}/${fileName}`;

      try {
        await invoke("delete_file", {
          deviceId: selectedDevice,
          filePath: filePath,
          isDirectory: file.is_directory,
        });
        successCount++;
      } catch (err) {
        errorCount++;
        setError(`Failed to delete ${fileName}: ${err}`);
        console.error(`Delete error for ${fileName}:`, err);
      }
    }

    setDeleting(false);
    setShowDeleteConfirm(false);
    setSelectedFiles(new Set());

    const deleteMessage = errorCount > 0
      ? `Deleted ${successCount} file(s), ${errorCount} failed`
      : "";

    if (successCount > 0) {
      if (searchMode) {
        // Re-run the search to update results
        await performSearch();
      } else {
        // Refresh file list
        await loadFiles();
      }
    }

    if (deleteMessage) {
      setError(deleteMessage);
    }
  }

  function startRename(index: number, currentName: string) {
    setRenamingIndex(index);
    setRenameValue(currentName);
    // Focus the input after a short delay to ensure it's rendered
    setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }

  function cancelRename() {
    setRenamingIndex(-1);
    setRenameValue("");
  }

  async function confirmRename() {
    if (!selectedDevice || renamingIndex < 0 || !renameValue.trim()) {
      cancelRename();
      return;
    }

    const file = getDisplayFiles()[renamingIndex];
    if (!file) {
      cancelRename();
      return;
    }

    // If name hasn't changed, just cancel
    if (renameValue === file.name) {
      cancelRename();
      return;
    }

    const filePath = file.name.startsWith("/")
      ? file.name
      : currentPath === "/"
      ? `/${file.name}`
      : `${currentPath}/${file.name}`;

    try {
      setLoading(true);
      setError("");

      await invoke("rename_file", {
        deviceId: selectedDevice,
        oldPath: filePath,
        newName: renameValue.trim(),
      });

      setSuccessMessage(`Renamed to "${renameValue}"`);

      // Store the new filename so we can focus on it after reload
      justRenamedFile.current = renameValue.trim();

      // Refresh file list
      if (searchMode) {
        await performSearch();
      } else {
        await loadFiles();
      }
    } catch (err) {
      setError(`Failed to rename: ${err}`);
      console.error("Rename error:", err);
    } finally {
      setLoading(false);
      cancelRename();
    }
  }

  async function performSearch() {
    if (!selectedDevice || !searchQuery.trim()) return;

    setSearching(true);
    setError("");

    try {
      const results = await invoke<FileEntry[]>("search_files", {
        deviceId: selectedDevice,
        searchPath: currentPath,
        pattern: searchQuery,
        recursive: searchRecursive,
      });
      setSearchResults(results);
      setSearchMode(true);
    } catch (err) {
      setError(`Search failed: ${err}`);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function exitSearchMode() {
    setSearchMode(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedFiles(new Set());
  }

  async function handleDownload() {
    if (!selectedDevice || selectedFiles.size === 0) return;

    const selectedFileNames = Array.from(selectedFiles);

    // Filter out directories
    const filesToDownload = selectedFileNames
      .map(fileName => files.find(f => f.name === fileName) || searchResults.find(f => f.name === fileName))
      .filter(file => file && !file.is_directory);

    if (filesToDownload.length === 0) {
      setError("Cannot download directories. Please select files only.");
      return;
    }

    try {
      // Show directory picker dialog
      const selectedDir = await open({
        directory: true,
        multiple: false,
        title: "Select Download Directory",
      });

      if (!selectedDir) {
        // User cancelled
        return;
      }

      const downloadDir = typeof selectedDir === 'string' ? selectedDir : selectedDir[0];

      setDownloading(true);
      setError("");
      setSuccessMessage("");

      let successCount = 0;
      let errorCount = 0;
      const totalFiles = filesToDownload.length;

      // Download each file
      for (let i = 0; i < filesToDownload.length; i++) {
        const file = filesToDownload[i];
        if (!file) continue;

        // Get the full path on device
        const devicePath = file.name.startsWith("/")
          ? file.name
          : currentPath === "/"
          ? `/${file.name}`
          : `${currentPath}/${file.name}`;

        // Extract just the filename (not the full path)
        const fileName = file.name.startsWith("/") ? file.name.split('/').pop() || file.name : file.name;

        // Update progress
        setDownloadProgress(`Downloading ${i + 1} of ${totalFiles}: ${fileName}`);

        // Build the local save path with the same name as source
        const localPath = await join(downloadDir, fileName);

        try {
          await invoke("download_file", {
            deviceId: selectedDevice,
            devicePath: devicePath,
            localPath: localPath,
          });
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Download error for ${fileName}:`, err);
        }
      }

      setDownloading(false);
      setDownloadProgress("");
      setSelectedFiles(new Set());

      if (errorCount > 0) {
        setError(`Downloaded ${successCount} file(s), ${errorCount} failed`);
      } else {
        setSuccessMessage(`Successfully downloaded ${successCount} file(s)`);
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(""), 5000);
      }
    } catch (err) {
      setDownloading(false);
      setDownloadProgress("");
      setError(`Failed to download files: ${err}`);
      console.error(`Download error:`, err);
    }
  }

  async function handleUpload() {
    if (!selectedDevice) return;

    try {
      // Show file picker dialog
      const selected = await open({
        multiple: false,
        title: "Select File to Upload",
      });

      if (!selected) {
        // User cancelled
        return;
      }

      // Get the file path (open returns string | string[] | null)
      const localPath = typeof selected === 'string' ? selected : selected[0];

      // Extract just the filename from the path
      const fileName = localPath.split('/').pop() || 'file';

      // Upload to current directory
      const devicePath = currentPath === "/"
        ? `/${fileName}`
        : `${currentPath}/${fileName}`;

      setUploading(true);
      setError("");

      // Upload the file
      await invoke("upload_file", {
        deviceId: selectedDevice,
        localPath: localPath,
        devicePath: devicePath,
      });

      setUploading(false);

      // Refresh file list to show the new file
      await loadFiles();
    } catch (err) {
      setUploading(false);
      setError(`Failed to upload file: ${err}`);
      console.error(`Upload error:`, err);
    }
  }

  // Drag and drop handlers
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging false if leaving the main container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // isDragging will be set to false when Tauri event fires
  }

  // Listen for Tauri file drop events
  useEffect(() => {
    console.log("Setting up file drop listeners...");

    async function handleFileDrop(payload: any, eventName: string) {
      console.log(`File drop event received from ${eventName}:`, payload);
      console.log("Payload type:", typeof payload, "Is array:", Array.isArray(payload));
      setIsDragging(false);

      if (!selectedDevice) {
        console.error("No device selected");
        setError("No device selected");
        return;
      }

      // Handle different payload formats
      let filePaths: string[] = [];
      if (Array.isArray(payload)) {
        filePaths = payload;
      } else if (typeof payload === 'string') {
        filePaths = [payload];
      } else if (payload && typeof payload === 'object' && payload.paths) {
        filePaths = payload.paths;
      } else {
        console.error("Unknown payload format:", payload);
        setError("Invalid file drop format");
        return;
      }

      console.log("Processed file paths:", filePaths);

      if (filePaths.length === 0) {
        console.log("No files in drop");
        return;
      }

      console.log(`Starting upload of ${filePaths.length} file(s) to device ${selectedDevice} at path ${currentPath}`);
      setUploading(true);
      setError("");
      setSuccessMessage("");

      let successCount = 0;
      let errorCount = 0;

      for (const localPath of filePaths) {
        try {
          const fileName = localPath.split('/').pop() || localPath.split('\\').pop() || 'file';

          // Upload to current directory
          const devicePath = currentPath === "/"
            ? `/${fileName}`
            : `${currentPath}/${fileName}`;

          console.log(`Uploading ${fileName} to ${devicePath}`);

          await invoke("upload_file", {
            deviceId: selectedDevice,
            localPath: localPath,
            devicePath: devicePath,
          });

          console.log(`Successfully uploaded ${fileName}`);
          successCount++;
        } catch (err) {
          errorCount++;
          console.error(`Upload error for ${localPath}:`, err);
        }
      }

      setUploading(false);

      // Refresh file list to show new files
      console.log("Refreshing file list after upload");
      try {
        setLoading(true);
        setError("");
        const response: FileEntry[] = await invoke("list_files", {
          deviceId: selectedDevice,
          path: currentPath,
        });
        setFiles(response);
        setLoading(false);
      } catch (err) {
        setLoading(false);
        console.error("Error refreshing files:", err);
      }

      if (errorCount > 0) {
        setError(`Uploaded ${successCount} file(s), ${errorCount} failed`);
      } else {
        setSuccessMessage(`Successfully uploaded ${successCount} file(s)`);
        setTimeout(() => setSuccessMessage(""), 5000);
      }
    }

    // Try multiple event names for Tauri v2 compatibility
    const eventNames = ['tauri://file-drop', 'tauri://drop', 'tauri://drag-drop', 'tauri://drop-over'];
    const unlisteners: Promise<() => void>[] = [];

    eventNames.forEach(eventName => {
      console.log(`Registering listener for: ${eventName}`);
      const unlisten = listen<any>(eventName, (event) => {
        console.log(`Event fired: ${eventName}`, event);
        handleFileDrop(event.payload, eventName);
      });
      unlisteners.push(unlisten);
    });

    return () => {
      console.log("Cleaning up file drop listeners");
      unlisteners.forEach(unlisten => {
        unlisten.then(fn => fn());
      });
    };
  }, [selectedDevice, currentPath]);

  function getDisplayFiles(): FileEntry[] {
    if (searchMode) {
      return searchResults;
    }
    return getVisibleFiles();
  }

  if (adbAvailable === false) {
    return (
      <div className="container">
        <div className="error-screen">
          <h1>ADB Not Found</h1>
          <p>DroidDock requires ADB (Android Debug Bridge) to be installed.</p>
          {adbPath && <p className="adb-path-info">Tried: {adbPath}</p>}

          <div className="adb-setup">
            <h3>Option 1: Install ADB</h3>
            <p>Install via Homebrew: <code>brew install android-platform-tools</code></p>
            <p>Or download from: <a href="https://developer.android.com/tools/releases/platform-tools" target="_blank">Android Platform Tools</a></p>

            <h3>Option 2: Set Custom ADB Path</h3>
            <p>If you already have ADB installed, specify its location:</p>
            <div className="custom-path-input">
              <input
                type="text"
                placeholder="/opt/homebrew/bin/adb"
                value={customAdbPath}
                onChange={(e) => setCustomAdbPath(e.target.value)}
              />
              <button onClick={setCustomAdb}>Set Path</button>
            </div>
            <p className="hint">Common locations: /opt/homebrew/bin/adb, /usr/local/bin/adb</p>
          </div>

          <button onClick={checkAdb} className="retry-btn">Retry Detection</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-overlay-icon">📁</div>
            <div className="drag-overlay-text">Drop files here to upload</div>
          </div>
        </div>
      )}
      <header>
        <h1>DroidDock</h1>
        <div className="device-selector">
          <label>Device:</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={devices.length === 0}
          >
            <option value="">Select a device</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.id} ({device.status})
              </option>
            ))}
          </select>
          <button onClick={loadDevices}>Refresh</button>
          <div className="settings-dropdown">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
            >
              ⋯
            </button>
            {settingsOpen && (
              <div className="settings-menu">
                <div className="settings-item">
                  <label className="toggle-label">
                    <span>Show Thumbnails</span>
                    <input
                      type="checkbox"
                      checked={thumbnailsEnabled}
                      onChange={(e) => setThumbnailsEnabled(e.target.checked)}
                      className="toggle-checkbox"
                    />
                    <span className="toggle-switch"></span>
                  </label>
                </div>
                <div className="settings-item">
                  <label className="toggle-label">
                    <span>Show Hidden Files</span>
                    <input
                      type="checkbox"
                      checked={showHiddenFiles}
                      onChange={(e) => setShowHiddenFiles(e.target.checked)}
                      className="toggle-checkbox"
                    />
                    <span className="toggle-switch"></span>
                  </label>
                </div>
                <div className="settings-divider"></div>
                <div className="settings-item">
                  <label className="sort-label">Sort by:</label>
                  <select
                    value={sortColumn}
                    onChange={(e) => setSortColumn(e.target.value as 'name' | 'size' | 'date')}
                    className="sort-select"
                  >
                    <option value="name">Name</option>
                    <option value="size">Size</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <div className="settings-item">
                  <label className="sort-label">Direction:</label>
                  <select
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                    className="sort-select"
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
                <div className="settings-divider"></div>
                <div className="settings-item">
                  <button
                    onClick={() => {
                      setShowShortcutsHelp(true);
                      setSettingsOpen(false);
                    }}
                    className="shortcuts-btn"
                  >
                    ⌨️ Keyboard Shortcuts
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

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
      {downloadProgress && (
        <div className="info">
          {downloadProgress}
          <button className="close-btn" onClick={() => setDownloadProgress("")} title="Close">×</button>
        </div>
      )}

      {selectedDevice && (
        <>
          <div className="breadcrumb">
            {getDisplaySegments().map((segment, index) => (
              <span key={index}>
                {index > 0 && <span className="separator">→</span>}
                <button
                  onClick={() => {
                    if (segment.isStorage) {
                      navigateToHome();
                    } else {
                      navigateToSegment(segment.actualIndex);
                    }
                  }}
                  className="breadcrumb-btn"
                >
                  {segment.label}
                </button>
              </span>
            ))}
          </div>

          <div className="toolbar">
            <div className="search-bar">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                className="search-input"
              />
              <label className="search-option">
                <input
                  type="checkbox"
                  checked={searchRecursive}
                  onChange={(e) => setSearchRecursive(e.target.checked)}
                />
                All subdirectories
              </label>
              <button
                onClick={performSearch}
                disabled={!searchQuery.trim() || searching}
                className="search-btn"
              >
                {searching ? "Searching..." : "Search"}
              </button>
              {searchMode && (
                <button onClick={exitSearchMode} className="clear-search-btn">
                  Clear
                </button>
              )}
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="upload-btn"
                title="Upload file to current directory"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>

            <div className="view-toggle">
              <button
                onClick={() => setViewMode('table')}
                className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                title="Table view (Cmd+1)"
              >
                ☰
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                title="Grid view (Cmd+2)"
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('column')}
                className={`view-btn ${viewMode === 'column' ? 'active' : ''}`}
                title="Column view (Cmd+3)"
              >
                ▦
              </button>
              {viewMode === 'grid' && (
                <div className="zoom-controls">
                  <button
                    onClick={() => setIconSize('small')}
                    className={`zoom-btn ${iconSize === 'small' ? 'active' : ''}`}
                    title="Small icons"
                  >
                    −
                  </button>
                  <button
                    onClick={() => setIconSize('medium')}
                    className={`zoom-btn ${iconSize === 'medium' ? 'active' : ''}`}
                    title="Medium icons"
                  >
                    ●
                  </button>
                  <button
                    onClick={() => setIconSize('large')}
                    className={`zoom-btn ${iconSize === 'large' ? 'active' : ''}`}
                    title="Large icons"
                  >
                    ◐
                  </button>
                  <button
                    onClick={() => setIconSize('xlarge')}
                    className={`zoom-btn ${iconSize === 'xlarge' ? 'active' : ''}`}
                    title="Extra large icons"
                  >
                    ○
                  </button>
                </div>
              )}
            </div>

            <div className="file-actions">
              {selectedFiles.size > 0 && (
                <>
                  <span className="selection-count">
                    {selectedFiles.size} selected
                  </span>
                  <button onClick={clearSelection} className="clear-selection-btn">
                    Clear
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="download-btn"
                    title={`Download ${selectedFiles.size} file(s)`}
                  >
                    {downloading ? "Downloading..." : "Download"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting}
                    className="delete-btn"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {searchMode && (
            <div className="search-info">
              Showing {searchResults.length} result(s) for "{searchQuery}"
              {searchRecursive ? ` (including subdirectories of ${currentPath})` : ` (in ${currentPath} only)`}
            </div>
          )}

          <div className="file-list">
            {loading ? (
              <div className="loading">Loading...</div>
            ) : viewMode === 'column' ? (
              <div className="column-view">
                {columnPath.map((path, columnIndex) => {
                  const files = columnFiles.get(path) || [];
                  const visibleFiles = showHiddenFiles
                    ? files
                    : files.filter(file => !file.name.startsWith('.'));
                  const selectedIndex = columnSelected.get(path) ?? -1;
                  const isActiveColumn = columnIndex === activeColumnIndex;

                  return (
                    <div
                      key={columnIndex}
                      className={`column-list ${isActiveColumn ? 'active' : ''}`}
                      data-column-index={columnIndex}
                    >
                      {visibleFiles.map((file, fileIndex) => {
                        const isSelected = fileIndex === selectedIndex;
                        return (
                          <div
                            key={fileIndex}
                            onClick={() => selectColumnItem(columnIndex, fileIndex, file)}
                            className={`column-item ${file.is_directory ? 'directory' : 'file'} ${isSelected ? 'selected' : ''}`}
                          >
                            <span className="column-item-icon">{file.is_directory ? "📁" : "📄"}</span>
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
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {getDisplayFiles().map((file, index) => (
                    <FileRow
                      key={index}
                      file={file}
                      fileIndex={index}
                      currentPath={currentPath}
                      thumbnailsEnabled={thumbnailsEnabled}
                      thumbnailCache={thumbnailCache}
                      loadThumbnail={loadThumbnail}
                      needsThumbnail={needsThumbnail}
                      onNavigate={() => file.is_directory && navigateToDirectory(file.name)}
                      isSelected={selectedFiles.has(file.name)}
                      isFocused={focusedIndex === index}
                      onSelect={(idx, e) => handleFileSelect(file.name, idx, e)}
                      isRenaming={renamingIndex === index}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameConfirm={confirmRename}
                      onRenameCancel={cancelRename}
                      renameInputRef={renameInputRef}
                    />
                  ))}
                  {getDisplayFiles().length === 0 && !loading && (
                    <tr>
                      <td colSpan={3} className="empty">
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
              <div className={`grid-view grid-${iconSize}`}>
                {getDisplayFiles().map((file, index) => (
                  <GridItem
                    key={index}
                    file={file}
                    fileIndex={index}
                    currentPath={currentPath}
                    thumbnailsEnabled={thumbnailsEnabled}
                    thumbnailCache={thumbnailCache}
                    loadThumbnail={loadThumbnail}
                    needsThumbnail={needsThumbnail}
                    onNavigate={() => file.is_directory && navigateToDirectory(file.name)}
                    isSelected={selectedFiles.has(file.name)}
                    isFocused={focusedIndex === index}
                    onSelect={(idx, e) => handleFileSelect(file.name, idx, e)}
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

          <StatusBar
            storageInfo={storageInfo}
            fileCount={getDisplayFiles().length}
            selectedCount={selectedFiles.size}
          />
        </>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete {selectedFiles.size} item(s)?
            </p>
            <p className="warning-text">
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={performDelete}
                disabled={deleting}
                className="confirm-delete-btn"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShortcutsHelp && (
        <div className="modal-overlay" onClick={() => setShowShortcutsHelp(false)}>
          <div className="modal-dialog shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>⌨️ Keyboard Shortcuts</h3>
            <div className="shortcuts-grid">
              <div className="shortcuts-section">
                <h4>Navigation</h4>
                <div className="shortcut-item">
                  <span className="shortcut-keys">↑ ↓</span>
                  <span className="shortcut-desc">Navigate in list view</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">↑ ↓ ← →</span>
                  <span className="shortcut-desc">Navigate in grid view</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + ↑</span>
                  <span className="shortcut-desc">Go to parent directory</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + O</span>
                  <span className="shortcut-desc">Open focused folder</span>
                </div>
              </div>

              <div className="shortcuts-section">
                <h4>Selection</h4>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Space</span>
                  <span className="shortcut-desc">Toggle selection on focused file</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + A</span>
                  <span className="shortcut-desc">Select all files</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Esc</span>
                  <span className="shortcut-desc">Close popup/clear selection/focus</span>
                </div>
              </div>

              <div className="shortcuts-section">
                <h4>File Actions</h4>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Enter</span>
                  <span className="shortcut-desc">Rename focused file/folder</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + D</span>
                  <span className="shortcut-desc">Download selected/focused files</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + Delete</span>
                  <span className="shortcut-desc">Delete selected/focused files</span>
                </div>
              </div>

              <div className="shortcuts-section">
                <h4>View &amp; Search</h4>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + 1</span>
                  <span className="shortcut-desc">Switch to table view</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + 2</span>
                  <span className="shortcut-desc">Switch to grid view</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + 3</span>
                  <span className="shortcut-desc">Switch to column view</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + F</span>
                  <span className="shortcut-desc">Focus search bar</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + T</span>
                  <span className="shortcut-desc">Toggle thumbnails</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + Shift + .</span>
                  <span className="shortcut-desc">Toggle hidden files</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + /</span>
                  <span className="shortcut-desc">Show this help</span>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setShowShortcutsHelp(false)}
                className="cancel-btn"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
