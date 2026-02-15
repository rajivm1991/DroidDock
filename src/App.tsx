import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { join } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

interface AdbDevice {
  id: string;
  status: string;
  model: string;
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

interface FilePreview {
  file_type: string;  // "image", "text", or "unsupported"
  content: string;    // base64 for images, text content for text files
  size: number;       // file size in bytes
}

type SyncDirection = "PhoneToComputer" | "ComputerToPhone" | "BothWays";

interface SyncOptions {
  local_path: string;
  device_path: string;
  direction: SyncDirection;
  recursive: boolean;
  delete_missing: boolean;
  match_mode: string;
}

interface SyncAction {
  file_path: string;
  action_type: string;
  direction: string;
  size: number;
  reason: string;
  rename_from: string | null;
}

interface SyncPreview {
  actions: SyncAction[];
  total_transfer_bytes: number;
  copy_count: number;
  update_count: number;
  delete_count: number;
  skip_count: number;
  rename_count: number;
}

interface SyncProgress {
  current_file: string;
  completed_count: number;
  total_count: number;
  completed_bytes: number;
  total_bytes: number;
}

interface SyncResult {
  success_count: number;
  skip_count: number;
  error_count: number;
  errors: string[];
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
  onPreview: () => void;
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
                  storageInfo.percentage_used > 90 ? '#333333' :
                  storageInfo.percentage_used > 75 ? '#666666' :
                  '#999999'
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

function FileRow({ file, fileIndex, currentPath, thumbnailsEnabled, thumbnailCache, loadThumbnail, needsThumbnail, onNavigate, onPreview, isSelected, isFocused, onSelect, isRenaming, renameValue, onRenameChange, onRenameConfirm, onRenameCancel, renameInputRef }: FileRowProps) {
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
      onDoubleClick={() => {
        if (file.is_directory) {
          onNavigate();
        } else {
          onPreview();
        }
      }}
      className={`file-row ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      data-file-index={fileIndex}
    >
      <td>
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
      <td className="kind-cell">{getFileKind(file)}</td>
      <td className="size-cell">{file.is_directory ? "-" : formatBytes(parseInt(file.size))}</td>
      <td className="date-cell">{file.date}</td>
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
  onPreview: () => void;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (index: number, e: React.MouseEvent) => void;
}

function GridItem({ file, fileIndex, currentPath, thumbnailsEnabled, thumbnailCache, loadThumbnail, needsThumbnail, onNavigate, onPreview, isSelected, isFocused, onSelect }: GridItemProps) {
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
      onDoubleClick={() => {
        if (file.is_directory) {
          onNavigate();
        } else {
          onPreview();
        }
      }}
      className={`grid-item ${file.is_directory ? "directory" : "file"} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      data-file-index={fileIndex}
    >
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

// Helper constants and functions (defined outside component for performance)
const IMAGE_MIME_TYPES: { [key: string]: string } = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp'
};

// Helper function to get proper MIME type from file extension
function getImageMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return IMAGE_MIME_TYPES[ext || ''] || 'image/jpeg'; // default to jpeg if unknown
}

// Helper function to get file kind/type
function getFileKind(file: FileEntry): string {
  if (file.is_directory) {
    return 'Folder';
  }
  
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  
  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'heic', 'heif'].includes(ext)) {
    return 'Image';
  }
  // Video files
  if (['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm', 'm4v', '3gp'].includes(ext)) {
    return 'Video';
  }
  // Audio files
  if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus'].includes(ext)) {
    return 'Audio';
  }
  // Document files
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
    return 'Document';
  }
  // Spreadsheet files
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return 'Spreadsheet';
  }
  // Presentation files
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) {
    return 'Presentation';
  }
  // Archive files
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'].includes(ext)) {
    return 'Archive';
  }
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt'].includes(ext)) {
    return 'Code';
  }
  // Web files
  if (['html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'xml', 'yaml', 'yml'].includes(ext)) {
    return 'Web';
  }
  // Executable/APK
  if (['apk', 'exe', 'dmg', 'app', 'deb', 'rpm'].includes(ext)) {
    return 'Application';
  }
  
  // Default
  if (ext) {
    return ext.toUpperCase() + ' File';
  }
  return 'File';
}

// Helper function to calculate grid columns for navigation
function calculateGridColumns(): number {
  const gridItems = document.querySelectorAll('.grid-item');
  let cols = 1;

  if (gridItems.length >= 2) {
    const firstItemTop = (gridItems[0] as HTMLElement).offsetTop;
    for (let i = 1; i < gridItems.length; i++) {
      if ((gridItems[i] as HTMLElement).offsetTop !== firstItemTop) {
        cols = i;
        break;
      }
    }
    if (cols === 1) cols = gridItems.length;
  }

  return cols;
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
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? JSON.parse(saved) : false;
  });

  // File selection and deletion state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);

  // File preview state
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape' | 'square'>('landscape');
  const [imageDimensions, setImageDimensions] = useState<{width: number; height: number} | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchMode, setSearchMode] = useState<boolean>(false);
  const [searchRecursive, setSearchRecursive] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<FileEntry[]>([]);
  const [_searching, setSearching] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Storage info state
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);

  // File transfer state
  const [downloading, setDownloading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [skipDuplicateDownloads, setSkipDuplicateDownloads] = useState<boolean>(() => {
    const saved = localStorage.getItem('droiddock-skip-duplicate-downloads');
    return saved !== null ? JSON.parse(saved) : true;
  });

  // Sort state
  const [sortColumn, setSortColumn] = useState<'name' | 'size' | 'date'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // View mode state
  const [viewMode, setViewMode] = useState<'table' | 'grid' | 'column'>(() => {
    // Load saved view mode from localStorage
    const saved = localStorage.getItem('droiddock-view-mode');
    return (saved === 'table' || saved === 'grid' || saved === 'column') ? saved : 'table';
  });
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

  // Sync state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncLocalPath, setSyncLocalPath] = useState("");
  const [syncDevicePath, setSyncDevicePath] = useState("");
  const [syncDirection, setSyncDirection] = useState<SyncDirection>("PhoneToComputer");
  const [syncRecursive, setSyncRecursive] = useState(false);
  const [syncDeleteMissing, setSyncDeleteMissing] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SyncPreview | null>(null);
  const [syncPreviewing, setSyncPreviewing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncStep, setSyncStep] = useState<"config" | "preview" | "progress" | "result">("config");
  const [syncMatchMode, setSyncMatchMode] = useState<"filename" | "content">("filename");

  // Check if ADB is available on startup
  useEffect(() => {
    checkAdb();
  }, []);

  // Apply dark mode theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

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

  // Save view mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('droiddock-view-mode', viewMode);
  }, [viewMode]);

  // Save duplicate download preference
  useEffect(() => {
    localStorage.setItem('droiddock-skip-duplicate-downloads', JSON.stringify(skipDuplicateDownloads));
  }, [skipDuplicateDownloads]);

  // Reset orientation and dimensions when preview is closed
  useEffect(() => {
    if (!showPreview) {
      setImageOrientation('landscape');
      setImageDimensions(null);
    }
  }, [showPreview]);

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
      // Only reinitialize if we're switching TO column view or if the currentPath
      // is not already in our columnPath (meaning we navigated externally, like via breadcrumb)
      const pathInColumns = columnPath.some(p => p === currentPath);
      if (columnPath.length === 0 || !pathInColumns) {
        initializeColumnView();
      }
    } else if (viewMode !== 'column' && columnPath.length > 0) {
      // Clear column state when switching away from column view
      setColumnPath([]);
      setColumnFiles(new Map());
      setColumnSelected(new Map());
      setActiveColumnIndex(0);
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
    const newSelected = new Map<string, number>();

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      try {
        const fileList = await invoke<FileEntry[]>("list_files", {
          deviceId: selectedDevice,
          path: path,
        });
        newColumnFiles.set(path, fileList);

        // If this is not the last column, find and mark the selected folder
        if (i < paths.length - 1) {
          const nextSegment = segments[i];
          // Filter based on showHiddenFiles to match what's rendered
          const visibleFiles = showHiddenFiles
            ? fileList
            : fileList.filter(file => !file.name.startsWith('.'));
          const selectedIndex = visibleFiles.findIndex(file => file.name === nextSegment);
          if (selectedIndex >= 0) {
            newSelected.set(path, selectedIndex);
          }
        }
      } catch (err) {
        console.error(`Failed to load files for ${path}:`, err);
        newColumnFiles.set(path, []);
      }
    }

    setColumnFiles(newColumnFiles);
    setColumnSelected(newSelected);
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

    // Update files map - keep only files for paths that still exist
    const newColumnFiles = new Map<string, FileEntry[]>();
    for (const path of newPaths.slice(0, -1)) {
      const existingFiles = columnFiles.get(path);
      if (existingFiles) {
        newColumnFiles.set(path, existingFiles);
      }
    }
    newColumnFiles.set(selectedPath, fileList);

    // Update selections - keep only selections for paths that still exist, plus the new selection
    const newSelected = new Map<string, number>();
    for (const path of newPaths.slice(0, -1)) {
      const existingSelection = columnSelected.get(path);
      if (existingSelection !== undefined) {
        newSelected.set(path, existingSelection);
      }
    }
    // Set selection for the clicked folder
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
      // Ctrl/Cmd + 1: Switch to table view
      else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        setViewMode('table');
      }
      // Ctrl/Cmd + 2: Switch to grid view
      else if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        setViewMode('grid');
      }
      // Ctrl/Cmd + 3: Switch to column view
      else if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        setViewMode('column');
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
      // Cmd/Ctrl + =: Zoom in (only in grid view)
      else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+') && viewMode === 'grid') {
        e.preventDefault();
        if (iconSize === 'small') setIconSize('medium');
        else if (iconSize === 'medium') setIconSize('large');
        else if (iconSize === 'large') setIconSize('xlarge');
        // Already at max, stay at xlarge
      }
      // Cmd/Ctrl + -: Zoom out (only in grid view)
      else if ((e.ctrlKey || e.metaKey) && e.key === '-' && viewMode === 'grid') {
        e.preventDefault();
        if (iconSize === 'xlarge') setIconSize('large');
        else if (iconSize === 'large') setIconSize('medium');
        else if (iconSize === 'medium') setIconSize('small');
        // Already at min, stay at small
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
      // Space: Toggle preview for focused file (files only, not folders)
      else if (!isTyping && e.key === ' ') {
        e.preventDefault();
        // If preview is already open, close it
        if (showPreview) {
          setShowPreview(false);
        } else if (focusedIndex >= 0 && focusedIndex < getDisplayFiles().length) {
          const file = getDisplayFiles()[focusedIndex];
          // Only allow preview of files, not directories
          if (!file.is_directory) {
            // Clear selection and select only the focused file
            setSelectedFiles(new Set([file.name]));
            // Preview the focused file
            previewFileByName(file.name);
          }
        }
      }
      // Arrow keys: Navigate in list (with Shift for selection)
      else if (!isTyping && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();

        // Special handling when preview window is open
        if (showPreview && !e.shiftKey) {
          handlePreviewNavigation(e.key);
          return;
        }

        if (viewMode === 'column') {
          // Column view: left/right moves between columns, up/down navigates within column
          if (e.key === 'ArrowLeft') {
            // Move to previous column
            if (activeColumnIndex > 0) {
              const newActiveIndex = activeColumnIndex - 1;
              setActiveColumnIndex(newActiveIndex);

              // Update currentPath to the new active column's path
              const newPath = columnPath[newActiveIndex];
              setCurrentPath(newPath);

              // Remove columns after the new active column
              const newPaths = columnPath.slice(0, newActiveIndex + 1);
              if (newPaths.length !== columnPath.length) {
                setColumnPath(newPaths);
              }

              setTimeout(() => {
                const activeColumn = document.querySelector(`.column-list[data-column-index="${newActiveIndex}"]`);
                activeColumn?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
              }, 0);
            }
          } else if (e.key === 'ArrowRight') {
            // Move to next column (if exists)
            if (activeColumnIndex < columnPath.length - 1) {
              const newActiveIndex = activeColumnIndex + 1;
              setActiveColumnIndex(newActiveIndex);

              // Update currentPath to the new active column's path
              const newPath = columnPath[newActiveIndex];
              setCurrentPath(newPath);

              setTimeout(() => {
                const activeColumn = document.querySelector(`.column-list[data-column-index="${newActiveIndex}"]`);
                activeColumn?.scrollIntoView({ inline: 'center', behavior: 'smooth' });
              }, 0);
            }
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Navigate within active column
            if (activeColumnIndex < 0 || activeColumnIndex >= columnPath.length) return;

            const path = columnPath[activeColumnIndex];
            const files = columnFiles.get(path) || [];
            const visibleFiles = showHiddenFiles
              ? files
              : files.filter(file => !file.name.startsWith('.'));

            if (visibleFiles.length === 0) return;

            const currentSelected = columnSelected.get(path) ?? -1;
            let newSelected = currentSelected;

            // If nothing selected, start at first item on any arrow key
            if (currentSelected < 0) {
              newSelected = 0;
            } else if (e.key === 'ArrowUp') {
              newSelected = currentSelected <= 0 ? visibleFiles.length - 1 : currentSelected - 1;
            } else if (e.key === 'ArrowDown') {
              newSelected = currentSelected >= visibleFiles.length - 1 ? 0 : currentSelected + 1;
            }

            // If selected item is a directory, load its contents in the next column
            const selectedFile = visibleFiles[newSelected];
            if (selectedFile && selectedFile.is_directory) {
              const selectedPath = selectedFile.name.startsWith("/")
                ? selectedFile.name
                : path === "/"
                ? `/${selectedFile.name}`
                : `${path}/${selectedFile.name}`;

              // Update column path to include the preview column
              const newPaths = columnPath.slice(0, activeColumnIndex + 1);
              newPaths.push(selectedPath);

              // Load files for the preview column and update all state together
              loadColumnFiles(selectedPath).then(fileList => {
                const newColumnFiles = new Map(columnFiles);
                newColumnFiles.set(selectedPath, fileList);
                const newColumnSelected = new Map(columnSelected);
                newColumnSelected.set(path, newSelected);

                // Batch all updates together
                setColumnFiles(newColumnFiles);
                setColumnPath(newPaths);
                setColumnSelected(newColumnSelected);
              });
            } else {
              // If it's a file, remove any columns after the active one
              const newPaths = columnPath.slice(0, activeColumnIndex + 1);
              const newColumnSelected = new Map(columnSelected);
              newColumnSelected.set(path, newSelected);

              setColumnSelected(newColumnSelected);
              if (newPaths.length !== columnPath.length) {
                setColumnPath(newPaths);
              }
            }

            setTimeout(() => {
              const activeColumn = document.querySelector(`.column-list[data-column-index="${activeColumnIndex}"]`);
              const selectedItems = activeColumn?.querySelectorAll('.column-item');
              const selectedItem = selectedItems?.[newSelected];
              selectedItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 0);
          }
        } else {
          const displayFiles = getDisplayFiles();
          if (displayFiles.length === 0) return;

          // If Shift is held, handle checkbox selection while navigating
          if (e.shiftKey) {
            // If nothing is focused yet, start at first item
            if (focusedIndex < 0) {
              setFocusedIndex(0);
              const file = displayFiles[0];
              if (!file.is_directory) {
                setSelectedFiles(new Set([...selectedFiles, file.name]));
              }
              setTimeout(() => {
                const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
                focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              }, 0);
              return;
            }

            // First, select the anchor file if not already selected
            const currentFile = displayFiles[focusedIndex];
            let updatedSelection = new Set(selectedFiles);
            if (!currentFile.is_directory && !selectedFiles.has(currentFile.name)) {
              updatedSelection.add(currentFile.name);
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
              const cols = calculateGridColumns();

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
            const file = displayFiles[newIndex];

            // Add to selection (only files, not directories)
            if (!file.is_directory) {
              updatedSelection.add(file.name);
            }
            setSelectedFiles(updatedSelection);

            // Scroll into view
            setTimeout(() => {
              const focusedElement = document.querySelector('.file-row.focused, .grid-item.focused');
              focusedElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }, 0);
            return;
          }

          // Normal navigation without Shift (no selection change)
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
            // Get actual number of columns by measuring the grid layout
            const gridItems = document.querySelectorAll('.grid-item');
            let cols = 1;

            if (gridItems.length >= 2) {
              // Find number of columns by checking when offsetTop changes
              const firstItemTop = (gridItems[0] as HTMLElement).offsetTop;
              for (let i = 1; i < gridItems.length; i++) {
                if ((gridItems[i] as HTMLElement).offsetTop !== firstItemTop) {
                  cols = i;
                  break;
                }
              }
              // If all items are in one row, cols equals total items
              if (cols === 1) cols = gridItems.length;
            }

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
        } else if (showPreview) {
          setShowPreview(false);
          setPreviewData(null);
          setError(""); // Clear any preview-related error messages
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
  }, [selectedFiles, searchMode, focusedIndex, viewMode, iconSize, showHiddenFiles, thumbnailsEnabled, showShortcutsHelp, showDeleteConfirm, renamingIndex, loading, columnPath, columnFiles, columnSelected, activeColumnIndex, showPreview, previewLoading]);

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

    // In column view, also update the active column index
    if (viewMode === 'column') {
      const pathIndex = columnPath.findIndex(p => p === newPath);
      if (pathIndex >= 0) {
        setActiveColumnIndex(pathIndex);
        // Remove columns after the clicked segment
        const newPaths = columnPath.slice(0, pathIndex + 1);
        if (newPaths.length !== columnPath.length) {
          setColumnPath(newPaths);
        }
      }
    }
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

  function getTruncatedBreadcrumb(): { label: string; isStorage: boolean; actualIndex: number; isEllipsis?: boolean }[] {
    const segments = getDisplaySegments();
    
    // If 4 or fewer segments, show all
    if (segments.length <= 4) {
      return segments;
    }
    
    // Show: first / ... / second-to-last / last
    return [
      segments[0],
      { label: '...', isStorage: false, actualIndex: -1, isEllipsis: true },
      segments[segments.length - 2],
      segments[segments.length - 1]
    ];
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
    // Always update focused index when clicking on any item
    setFocusedIndex(index);

    // Check if the file is a directory - don't allow selection of folders
    const visibleFiles = getDisplayFiles();
    const file = visibleFiles[index];
    if (file && file.is_directory) {
      // Don't select folders - but we already set focus above
      return;
    }

    if (event.shiftKey && lastSelectedIndex !== -1) {
      // Range select with Shift - only select files, not directories
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const rangeFiles = visibleFiles.slice(start, end + 1)
        .filter(f => !f.is_directory)  // Exclude directories
        .map(f => f.name);

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
    // Only select files, not directories (since folder download is not supported)
    const selectableFiles = visibleFiles.filter(f => !f.is_directory);
    setSelectedFiles(new Set(selectableFiles.map(f => f.name)));
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
      let skippedCount = 0;
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
          const downloadResult = await invoke<string>("download_file", {
            deviceId: selectedDevice,
            devicePath: devicePath,
            localPath: localPath,
            skipExisting: skipDuplicateDownloads,
          });

          if (downloadResult === "skipped") {
            skippedCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          errorCount++;
          console.error(`Download error for ${fileName}:`, err);
        }
      }

      setDownloading(false);
      setDownloadProgress("");
      setSelectedFiles(new Set());

      if (errorCount > 0) {
        setError(
          `Downloaded ${successCount} file(s), skipped ${skippedCount} duplicate(s), ${errorCount} failed`
        );
      } else if (successCount === 0 && skippedCount > 0) {
        setSuccessMessage(`Skipped ${skippedCount} duplicate file(s). Nothing new to download.`);
      } else {
        const skippedText = skippedCount > 0 ? ` (skipped ${skippedCount} duplicate(s))` : "";
        setSuccessMessage(`Successfully downloaded ${successCount} file(s)${skippedText}`);
      }
    } catch (err) {
      setDownloading(false);
      setDownloadProgress("");
      setError(`Failed to download files: ${err}`);
      console.error(`Download error:`, err);
    }
  }

  const handlePreview = useCallback(async () => {
    if (!selectedDevice || selectedFiles.size === 0) return;

    const selectedFileNames = Array.from(selectedFiles);

    // Only allow preview of a single file
    if (selectedFileNames.length > 1) {
      setError("Please select only one file to preview");
      return;
    }

    // Find the selected file
    const fileName = selectedFileNames[0];
    const file = files.find(f => f.name === fileName) || searchResults.find(f => f.name === fileName);

    if (!file) {
      setError("File not found");
      return;
    }

    // Don't allow preview of directories
    if (file.is_directory) {
      setError("Cannot preview directories");
      return;
    }

    // Get the full path on device
    const devicePath = searchMode
      ? file.name
      : currentPath === "/storage/emulated/0"
      ? `/storage/emulated/0/${fileName}`
      : `${currentPath}/${fileName}`;

    setPreviewFileName(fileName);
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewData(null);
    setError("");

    try {
      const preview: FilePreview = await invoke("preview_file", {
        deviceId: selectedDevice,
        devicePath: devicePath,
        extension: file.extension,
      });

      setPreviewData(preview);

      if (preview.file_type === "unsupported") {
        setError(`Cannot preview ${file.extension || "this"} file type. Supported types: images (jpg, png, gif, etc.) and text files.`);
      }
    } catch (err) {
      setError(`Failed to preview file: ${err}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedDevice, selectedFiles, files, searchResults, searchMode, currentPath]);

  // Preview a file by name without changing selection
  const previewFileByName = useCallback(async (fileName: string) => {
    if (!selectedDevice) return;

    // Find the file
    const file = files.find(f => f.name === fileName) || searchResults.find(f => f.name === fileName);

    if (!file) {
      setError("File not found");
      return;
    }

    // Don't allow preview of directories
    if (file.is_directory) {
      setError("Cannot preview directories");
      return;
    }

    // Get the full path on device
    const devicePath = searchMode
      ? file.name
      : currentPath === "/storage/emulated/0"
      ? `/storage/emulated/0/${fileName}`
      : `${currentPath}/${fileName}`;

    setPreviewFileName(fileName);
    setShowPreview(true);
    setPreviewLoading(true);
    setPreviewData(null);
    setError("");

    try {
      const preview: FilePreview = await invoke("preview_file", {
        deviceId: selectedDevice,
        devicePath: devicePath,
        extension: file.extension,
      });

      setPreviewData(preview);

      if (preview.file_type === "unsupported") {
        setError(`Cannot preview ${file.extension || "this"} file type. Supported types: images (jpg, png, gif, etc.) and text files.`);
      }
    } catch (err) {
      setError(`Failed to preview file: ${err}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedDevice, files, searchResults, searchMode, currentPath]);

  const previewFile = useCallback((fileName: string) => {
    // Select the file and trigger preview
    setSelectedFiles(new Set([fileName]));
    // Use setTimeout to ensure state is updated before preview
    setTimeout(() => handlePreview(), 0);
  }, [handlePreview]);

  const handlePreviewNavigation = useCallback(async (key: string) => {
    if (!selectedDevice) return;

    const displayFiles = getDisplayFiles();
    if (displayFiles.length === 0) return;

    let nextIndex = focusedIndex;

    // Calculate next index based on key and view mode
    if (viewMode === 'grid') {
      // Grid view: calculate columns for up/down navigation
      const cols = calculateGridColumns();

      if (key === 'ArrowDown') {
        nextIndex = (focusedIndex + cols) % displayFiles.length;
      } else if (key === 'ArrowUp') {
        nextIndex = ((focusedIndex - cols) + displayFiles.length) % displayFiles.length;
      } else if (key === 'ArrowRight') {
        nextIndex = (focusedIndex + 1) % displayFiles.length;
      } else if (key === 'ArrowLeft') {
        nextIndex = ((focusedIndex - 1) + displayFiles.length) % displayFiles.length;
      }
    } else if (viewMode === 'table' || viewMode === 'column') {
      // Table and column view: simple up/down
      if (key === 'ArrowDown') {
        nextIndex = (focusedIndex + 1) % displayFiles.length;
      } else if (key === 'ArrowUp') {
        nextIndex = ((focusedIndex - 1) + displayFiles.length) % displayFiles.length;
      } else {
        // Left/Right don't apply in table/column view
        return;
      }
    } else {
      // Other view modes: don't support preview navigation
      return;
    }

    // Skip directories - find next previewable file
    let attempts = 0;
    const maxAttempts = displayFiles.length;
    const direction = (key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1;

    while (attempts < maxAttempts) {
      const file = displayFiles[nextIndex];

      // Found a previewable file
      if (!file.is_directory) {
        break;
      }

      // Skip this directory, try next
      if (direction > 0) {
        nextIndex = (nextIndex + 1) % displayFiles.length;
      } else {
        nextIndex = ((nextIndex - 1) + displayFiles.length) % displayFiles.length;
      }
      attempts++;
    }

    // Check if we found a previewable file
    if (attempts >= maxAttempts) {
      // All files are directories, close preview
      setShowPreview(false);
      setPreviewData(null);
      setError("No previewable files found");
      return;
    }

    const newFile = displayFiles[nextIndex];
    if (newFile.is_directory) {
      // Still on a directory somehow, do nothing
      return;
    }

    // Update focus and selection (React 18 automatically batches these state updates)
    setFocusedIndex(nextIndex);
    setSelectedFiles(new Set([newFile.name]));

    // Scroll into view
    setTimeout(() => {
      const fileElement = document.querySelector(`[data-file-index="${nextIndex}"]`);
      fileElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);

    // Trigger preview for new file
    const fileName = newFile.name;
    const devicePath = searchMode
      ? fileName  // Search results already contain full paths
      : currentPath === '/storage/emulated/0'
        ? `/storage/emulated/0/${fileName}`
        : `${currentPath}/${fileName}`;

    setPreviewFileName(fileName);
    setPreviewLoading(true);
    setPreviewData(null);

    try {
      const preview: FilePreview = await invoke("preview_file", {
        deviceId: selectedDevice,
        devicePath: devicePath,
        extension: newFile.extension,
      });

      setPreviewData(preview);

      if (preview.file_type === "unsupported") {
        setError(`Cannot preview ${newFile.extension || "this"} file type. Supported types: images (jpg, png, gif, etc.) and text files.`);
      } else {
        setError(""); // Clear any previous errors
      }
    } catch (err) {
      setError(`Failed to preview file: ${err}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedDevice, focusedIndex, viewMode, files, searchResults, searchMode, currentPath, showHiddenFiles, sortColumn, sortDirection]);

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

  // Sync handlers
  function handleOpenSyncDialog() {
    setSyncDevicePath(currentPath);
    setSyncLocalPath("");
    setSyncDirection("PhoneToComputer");
    setSyncRecursive(false);
    setSyncDeleteMissing(false);
    setSyncPreview(null);
    setSyncResult(null);
    setSyncProgress(null);
    setSyncStep("config");
    setSyncMatchMode("filename");
    setSyncDialogOpen(true);
  }

  async function handleSelectSyncLocalFolder() {
    try {
      const selected = await open({
        directory: true,
        title: "Select local folder to sync",
      });
      if (selected && typeof selected === "string") {
        setSyncLocalPath(selected);
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  }

  async function handlePreviewSync() {
    if (!syncLocalPath || !syncDevicePath || !selectedDevice) return;
    setSyncPreviewing(true);
    setError("");
    try {
      const options: SyncOptions = {
        local_path: syncLocalPath,
        device_path: syncDevicePath,
        direction: syncDirection,
        recursive: syncRecursive,
        delete_missing: syncDeleteMissing,
        match_mode: syncMatchMode,
      };
      const preview = await invoke<SyncPreview>("preview_sync", {
        deviceId: selectedDevice,
        options,
      });
      setSyncPreview(preview);
      setSyncStep("preview");
    } catch (err) {
      setError(`Sync preview failed: ${err}`);
    } finally {
      setSyncPreviewing(false);
    }
  }

  async function handleExecuteSync() {
    if (!syncLocalPath || !syncDevicePath || !selectedDevice) return;
    setSyncing(true);
    setSyncStep("progress");
    setSyncProgress(null);

    const unlisten = await listen<SyncProgress>("sync-progress", (event) => {
      setSyncProgress(event.payload);
    });

    try {
      const options: SyncOptions = {
        local_path: syncLocalPath,
        device_path: syncDevicePath,
        direction: syncDirection,
        recursive: syncRecursive,
        delete_missing: syncDeleteMissing,
        match_mode: syncMatchMode,
      };
      const result = await invoke<SyncResult>("execute_sync", {
        deviceId: selectedDevice,
        options,
      });
      setSyncResult(result);
      setSyncStep("result");
    } catch (err) {
      setError(`Sync failed: ${err}`);
      setSyncStep("config");
    } finally {
      setSyncing(false);
      unlisten();
    }
  }

  function handleCloseSyncDialog() {
    if (syncing) return;
    setSyncDialogOpen(false);
    if (syncResult && syncResult.success_count > 0) {
      loadFiles();
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
      className={`container ${selectedFiles.size > 0 ? 'container-with-contextual-bar' : ''}`}
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
      <header className="compact-header">
        <div className="header-row-1">
          <div className="header-controls">
            <div>
            <select
              ref={(el) => {
                if (el) {
                  // Auto-size select to fit selected option text
                  const temp = document.createElement('span');
                  temp.style.visibility = 'hidden';
                  temp.style.position = 'absolute';
                  temp.style.whiteSpace = 'nowrap';
                  temp.style.font = window.getComputedStyle(el).font;
                  temp.textContent = el.options[el.selectedIndex]?.text || '';
                  document.body.appendChild(temp);
                  el.style.width = (temp.offsetWidth + 40) + 'px'; // 40px for padding + dropdown arrow
                  document.body.removeChild(temp);
                }
              }}
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={devices.length === 0}
              className="device-select"
            >
              <option value="">Select a device</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.model ? `${device.model} (${device.id})` : `${device.id} (${device.status})`}
                </option>
              ))}
            </select>
            <button onClick={loadDevices} className="control-btn device-refresh-btn" title="Refresh devices">↻</button>
            </div>
            <div className="control-divider"></div>
            <div>
            <button
              onClick={() => setViewMode('table')}
              className={`control-btn ${viewMode === 'table' ? 'active' : ''}`}
              title="Table view (Cmd+1)"
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`control-btn ${viewMode === 'grid' ? 'active' : ''}`}
              title="Grid view (Cmd+2)"
            >
              ⊞
            </button>
            <button
              onClick={() => setViewMode('column')}
              className={`control-btn ${viewMode === 'column' ? 'active' : ''}`}
              title="Column view (Cmd+3)"
            >
              ▦
            </button>
            </div>
            {viewMode === 'grid' && (
              <>
                <div className="control-divider"></div>
                <div>
                <button
                  onClick={() => {
                    if (iconSize === 'xlarge') setIconSize('large');
                    else if (iconSize === 'large') setIconSize('medium');
                    else if (iconSize === 'medium') setIconSize('small');
                  }}
                  className="control-btn"
                  title="Zoom out (Cmd+-)"
                  disabled={iconSize === 'small'}
                >
                  −
                </button>
                <button
                  onClick={() => {
                    if (iconSize === 'small') setIconSize('medium');
                    else if (iconSize === 'medium') setIconSize('large');
                    else if (iconSize === 'large') setIconSize('xlarge');
                  }}
                  className="control-btn"
                  title="Zoom in (Cmd++)"
                  disabled={iconSize === 'xlarge'}
                >
                  +
                </button>
                </div>
              </>
            )}
            
            <div className="control-divider"></div>
            
            <div>
            <select
              value={sortColumn}
              onChange={(e) => setSortColumn(e.target.value as 'name' | 'size' | 'date')}
              className="sort-select"
              title="Sort by"
            >
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="date">Date</option>
            </select>
            <button
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="control-btn sort-direction-btn"
              title={`Sort ${sortDirection === 'asc' ? 'descending' : 'ascending'}`}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </button>
            </div>
            
            <div className="control-divider"></div>
            
            <div className="settings-dropdown">
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                title="Settings"
                className="control-btn settings-btn"
              >
                ⚙
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
                  <div className="settings-item">
                    <label className="toggle-label">
                      <span>Dark Mode</span>
                      <input
                        type="checkbox"
                        checked={darkMode}
                        onChange={(e) => setDarkMode(e.target.checked)}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-switch"></span>
                    </label>
                  </div>
                  <div className="settings-item">
                    <label className="toggle-label">
                      <span>Skip Duplicate Downloads</span>
                      <input
                        type="checkbox"
                        checked={skipDuplicateDownloads}
                        onChange={(e) => setSkipDuplicateDownloads(e.target.checked)}
                        className="toggle-checkbox"
                      />
                      <span className="toggle-switch"></span>
                    </label>
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
        </div>

        {selectedDevice && (
          <>
            <div className="header-row-2">
              <div className="breadcrumb">
                {viewMode === 'column' ? (
                  // In column view, show full path without shortening
                  <>
                    <span>
                      <button
                        onClick={() => setCurrentPath('/')}
                        className="breadcrumb-btn"
                      >
                        /
                      </button>
                    </span>
                    {getPathSegments().map((segment, index) => (
                      <span key={index}>
                        <span className="separator">→</span>
                        <button
                          onClick={() => navigateToSegment(index)}
                          className="breadcrumb-btn"
                        >
                          {segment}
                        </button>
                      </span>
                    ))}
                  </>
                ) : (
                  // In other views, use truncated breadcrumb
                  getTruncatedBreadcrumb().map((segment, index) => (
                    <span key={index}>
                      {index > 0 && <span className="separator">→</span>}
                      {segment.isEllipsis ? (
                        <span className="breadcrumb-ellipsis">{segment.label}</span>
                      ) : (
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
                      )}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="header-row-3">
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
                {searchMode && (
                  <button onClick={exitSearchMode} className="clear-search-btn">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </>
        )}
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
                    <th 
                      onClick={() => {
                        if (sortColumn === 'name') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('name');
                          setSortDirection('asc');
                        }
                      }}
                      className={sortColumn === 'name' ? 'sortable active' : 'sortable'}
                      title="Click to sort by name"
                    >
                      Name {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Kind</th>
                    <th 
                      onClick={() => {
                        if (sortColumn === 'size') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('size');
                          setSortDirection('asc');
                        }
                      }}
                      className={sortColumn === 'size' ? 'sortable active' : 'sortable'}
                      title="Click to sort by size"
                    >
                      Size {sortColumn === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th 
                      onClick={() => {
                        if (sortColumn === 'date') {
                          setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortColumn('date');
                          setSortDirection('asc');
                        }
                      }}
                      className={sortColumn === 'date' ? 'sortable active' : 'sortable'}
                      title="Click to sort by date"
                    >
                      Date {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
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
                      onPreview={() => previewFile(file.name)}
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
                    onPreview={() => previewFile(file.name)}
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

          {/* Floating Action Button for Sync */}
          <button
            onClick={handleOpenSyncDialog}
            disabled={!selectedDevice}
            className={`sync-fab ${selectedFiles.size > 0 ? 'sync-fab-raised' : ''}`}
            title="Sync folders"
          >
            ⇄
          </button>

          {/* Floating Action Button for Upload */}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className={`fab ${selectedFiles.size > 0 ? 'fab-raised' : ''}`}
            title="Upload file to current directory"
          >
            {uploading ? "⋯" : "↑"}
          </button>

          {/* Contextual Action Bar for File Actions */}
          {selectedFiles.size > 0 && (
            <div className="contextual-action-bar">
              <div className="contextual-action-bar-content">
                <span className="selection-count">
                  {selectedFiles.size} file{selectedFiles.size > 1 ? 's' : ''} selected
                </span>
                <div className="contextual-actions">
                  <button onClick={clearSelection} className="contextual-btn clear-btn">
                    Clear
                  </button>
                  {selectedFiles.size === 1 && (
                    <button
                      onClick={handlePreview}
                      disabled={previewLoading}
                      className="contextual-btn preview-btn"
                      title="Preview file"
                    >
                      {previewLoading ? "Loading..." : "Preview"}
                    </button>
                  )}
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="contextual-btn download-btn"
                    title={`Download ${selectedFiles.size} file(s)`}
                  >
                    {downloading ? "Downloading..." : "Download"}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={deleting}
                    className="contextual-btn delete-btn"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          )}
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

      {showPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div
            className={`modal-dialog preview-dialog preview-${imageOrientation}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-header">
              <h3 id="preview-title">📄 {previewFileName}</h3>
              <button 
                className="close-btn" 
                onClick={() => setShowPreview(false)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div className="preview-content">
              {previewLoading ? (
                <div className="preview-loading">
                  <p>Loading preview...</p>
                </div>
              ) : previewData ? (
                <>
                  {previewData.file_type === "image" && (
                    <div className="preview-two-column">
                      <div className="preview-image-container">
                        <img
                          src={`data:${getImageMimeType(previewFileName)};base64,${previewData.content}`}
                          alt={previewFileName}
                          className="preview-image"
                          onLoad={(e) => {
                            const img = e.target as HTMLImageElement;
                            const ratio = img.naturalWidth / img.naturalHeight;
                            setImageDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight
                            });
                            if (Math.abs(ratio - 1) < 0.1) {
                              setImageOrientation('square');
                            } else if (ratio > 1) {
                              setImageOrientation('landscape');
                            } else {
                              setImageOrientation('portrait');
                            }
                          }}
                        />
                      </div>
                      <div className="preview-info-panel">
                        <h4>File Information</h4>
                        <div className="info-item">
                          <span className="info-label">Name:</span>
                          <span className="info-value">{previewFileName}</span>
                        </div>
                        <div className="info-item">
                          <span className="info-label">Size:</span>
                          <span className="info-value">
                            {previewData.size < 1024 
                              ? `${previewData.size} B`
                              : previewData.size < 1024 * 1024
                              ? `${(previewData.size / 1024).toFixed(2)} KB`
                              : `${(previewData.size / (1024 * 1024)).toFixed(2)} MB`}
                          </span>
                        </div>
                        {imageDimensions && (
                          <>
                            <div className="info-item">
                              <span className="info-label">Dimensions:</span>
                              <span className="info-value">{imageDimensions.width} × {imageDimensions.height} px</span>
                            </div>
                            <div className="info-item">
                              <span className="info-label">Aspect Ratio:</span>
                              <span className="info-value">
                                {(imageDimensions.width / imageDimensions.height).toFixed(2)}
                              </span>
                            </div>
                            <div className="info-item">
                              <span className="info-label">Orientation:</span>
                              <span className="info-value">{imageOrientation}</span>
                            </div>
                            <div className="info-item">
                              <span className="info-label">Type:</span>
                              <span className="info-value">{getImageMimeType(previewFileName)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {previewData.file_type === "text" && (
                    <div className="preview-text-container">
                      <pre className="preview-text">{previewData.content}</pre>
                      <p className="preview-info">
                        Size: {(previewData.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  )}
                  {previewData.file_type === "unsupported" && (
                    <div className="preview-unsupported">
                      <p>❌ Cannot preview this file type</p>
                      <p className="preview-info">
                        Supported types: images (jpg, png, gif, etc.) and text files
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="preview-loading">
                  <p>No preview data available</p>
                </div>
              )}
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
                  <span className="shortcut-desc">Toggle preview for focused file</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Shift + Arrow</span>
                  <span className="shortcut-desc">Select files while navigating</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + A</span>
                  <span className="shortcut-desc">Select all files</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Esc</span>
                  <span className="shortcut-desc">
                    Exit rename → close help → cancel delete → close preview → close search → clear selection → clear focus
                  </span>
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
                  <span className="shortcut-keys">Cmd + +</span>
                  <span className="shortcut-desc">Zoom in (grid view)</span>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-keys">Cmd + -</span>
                  <span className="shortcut-desc">Zoom out (grid view)</span>
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

      {/* Sync Dialog */}
      {syncDialogOpen && (
        <div className="modal-overlay" onClick={handleCloseSyncDialog}>
          <div className="modal-dialog sync-dialog" onClick={(e) => e.stopPropagation()}>
            {syncStep === "config" && (
              <>
                <h3>Folder Sync</h3>
                <div className="sync-form">
                  <div className="sync-form-group">
                    <label>Local Folder (Mac)</label>
                    <div className="sync-path-input">
                      <input
                        type="text"
                        value={syncLocalPath}
                        onChange={(e) => setSyncLocalPath(e.target.value)}
                        placeholder="Select a local folder..."
                        readOnly
                      />
                      <button onClick={handleSelectSyncLocalFolder}>Browse</button>
                    </div>
                  </div>

                  <div className="sync-form-group">
                    <label>Device Folder</label>
                    <div className="sync-path-input">
                      <input
                        type="text"
                        value={syncDevicePath}
                        onChange={(e) => setSyncDevicePath(e.target.value)}
                        placeholder="/storage/emulated/0/Music"
                      />
                    </div>
                  </div>

                  <div className="sync-form-group">
                    <label>Sync Direction</label>
                    <div className="sync-radio-group">
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "PhoneToComputer"}
                          onChange={() => setSyncDirection("PhoneToComputer")}
                        />
                        Phone → Computer
                      </label>
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "ComputerToPhone"}
                          onChange={() => setSyncDirection("ComputerToPhone")}
                        />
                        Computer → Phone
                      </label>
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncDirection"
                          checked={syncDirection === "BothWays"}
                          onChange={() => {
                            setSyncDirection("BothWays");
                            setSyncDeleteMissing(false);
                          }}
                        />
                        Both Ways
                      </label>
                    </div>
                  </div>

                  <div className="sync-form-group">
                    <label>Match by</label>
                    <div className="sync-radio-group">
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncMatchMode"
                          checked={syncMatchMode === "filename"}
                          onChange={() => setSyncMatchMode("filename")}
                        />
                        Filename — match files by name and path
                      </label>
                      <label className="sync-radio-label">
                        <input
                          type="radio"
                          name="syncMatchMode"
                          checked={syncMatchMode === "content"}
                          onChange={() => setSyncMatchMode("content")}
                        />
                        Content (MD5) — detect renamed files by content hash (slower)
                      </label>
                    </div>
                  </div>

                  <div className="sync-form-group">
                    <label>Options</label>
                    <div className="sync-options-group">
                      <label className="sync-checkbox-label">
                        <input
                          type="checkbox"
                          checked={syncRecursive}
                          onChange={(e) => setSyncRecursive(e.target.checked)}
                        />
                        Include subfolders
                      </label>

                      <label className={`sync-checkbox-label ${syncDirection === "BothWays" ? "disabled" : ""}`}>
                        <input
                          type="checkbox"
                          checked={syncDeleteMissing}
                          disabled={syncDirection === "BothWays"}
                          onChange={(e) => setSyncDeleteMissing(e.target.checked)}
                        />
                        Delete missing files
                        {syncDirection === "BothWays" && (
                          <span style={{ fontSize: 12, color: "#999" }}>(not available for Both Ways)</span>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button onClick={handleCloseSyncDialog} className="cancel-btn">
                    Cancel
                  </button>
                  <button
                    onClick={handlePreviewSync}
                    disabled={!syncLocalPath || !syncDevicePath || syncPreviewing}
                    className="sync-confirm-btn"
                  >
                    {syncPreviewing ? "Scanning..." : "Preview"}
                  </button>
                </div>
              </>
            )}

            {syncStep === "preview" && syncPreview && (
              <>
                <h3>Sync Preview</h3>
                {syncPreview.actions.length === 0 ? (
                  <div className="sync-in-sync-message">
                    Everything is already in sync.
                  </div>
                ) : (
                  <>
                    <div className="sync-preview-summary">
                      {syncPreview.copy_count > 0 && (
                        <span className="sync-preview-stat">
                          <span className="action-badge copy">Copy</span> {syncPreview.copy_count}
                        </span>
                      )}
                      {syncPreview.update_count > 0 && (
                        <span className="sync-preview-stat">
                          <span className="action-badge update">Update</span> {syncPreview.update_count}
                        </span>
                      )}
                      {syncPreview.delete_count > 0 && (
                        <span className="sync-preview-stat">
                          <span className="action-badge delete">Delete</span> {syncPreview.delete_count}
                        </span>
                      )}
                      {syncPreview.rename_count > 0 && (
                        <span className="sync-preview-stat">
                          <span className="action-badge rename">Rename</span> {syncPreview.rename_count}
                        </span>
                      )}
                      <span className="sync-preview-stat">
                        Transfer: {formatBytes(syncPreview.total_transfer_bytes)}
                      </span>
                    </div>

                    <div className="sync-preview-table-container">
                      <table className="sync-preview-table">
                        <thead>
                          <tr>
                            <th>File</th>
                            <th>Action</th>
                            <th>Direction</th>
                            <th>Size</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncPreview.actions.map((action, i) => (
                            <tr key={i} className={`action-${action.action_type}`}>
                              <td title={action.reason}>
                                {action.action_type === "rename" && action.rename_from
                                  ? <>{action.rename_from} → {action.file_path}</>
                                  : action.file_path}
                              </td>
                              <td>
                                <span className={`action-badge ${action.action_type}`}>
                                  {action.action_type}
                                </span>
                              </td>
                              <td>{action.direction}</td>
                              <td>{formatBytes(action.size)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <div className="modal-actions">
                  <button onClick={() => setSyncStep("config")} className="cancel-btn">
                    Back
                  </button>
                  {syncPreview.actions.length > 0 && (
                    <button onClick={handleExecuteSync} className="sync-confirm-btn">
                      Start Sync
                    </button>
                  )}
                </div>
              </>
            )}

            {syncStep === "progress" && (
              <>
                <h3>Syncing...</h3>
                <div className="sync-progress-container">
                  {syncProgress && (
                    <>
                      <div className="sync-progress-file">
                        {syncProgress.current_file}
                      </div>
                      <div className="sync-progress-bar">
                        <div
                          className="sync-progress-bar-fill"
                          style={{
                            width: `${syncProgress.total_count > 0
                              ? (syncProgress.completed_count / syncProgress.total_count) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                      <div className="sync-progress-stats">
                        <span>{syncProgress.completed_count} / {syncProgress.total_count} files</span>
                        <span>{formatBytes(syncProgress.completed_bytes)} / {formatBytes(syncProgress.total_bytes)}</span>
                      </div>
                    </>
                  )}
                  {!syncProgress && <p>Starting sync...</p>}
                </div>
              </>
            )}

            {syncStep === "result" && syncResult && (
              <>
                <h3>Sync Complete</h3>
                <div className="sync-result-summary">
                  <div className="sync-result-stat">
                    <span>Successful</span>
                    <span>{syncResult.success_count}</span>
                  </div>
                  {syncResult.skip_count > 0 && (
                    <div className="sync-result-stat">
                      <span>Skipped</span>
                      <span>{syncResult.skip_count}</span>
                    </div>
                  )}
                  {syncResult.error_count > 0 && (
                    <div className="sync-result-stat">
                      <span>Errors</span>
                      <span>{syncResult.error_count}</span>
                    </div>
                  )}
                  {syncResult.errors.length > 0 && (
                    <div className="sync-errors-list">
                      {syncResult.errors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="modal-actions">
                  <button onClick={handleCloseSyncDialog} className="sync-confirm-btn">
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
