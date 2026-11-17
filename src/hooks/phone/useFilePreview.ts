/**
 * Loads a phone preview and remembers image size and orientation. Arrow keys
 * move to the next or previous file. FilePreviewDialog draws it; selection
 * stays with the phone list.
 */
import { SetStateAction, useCallback, useEffect, useState } from "react";
import { type FilePreview } from "../../types/transfer";
import { invoke } from "@tauri-apps/api/core";
import { calculateGridColumns } from "../../lib/fileDisplay";
import { type FileEntry } from "../../lib/file-types";

export interface UseFilePreviewArgs {
  selectedDevice: string;
  currentPath: string;
  files: FileEntry[];
  setError: (value: SetStateAction<string>) => void;
  showHiddenFiles: boolean;
  selectedFiles: Set<string>;
  setSelectedFiles: (value: SetStateAction<Set<string>>) => void;
  searchMode: boolean;
  searchResults: FileEntry[];
  sortColumn: "name" | "size" | "date";
  sortDirection: "asc" | "desc";
  viewMode: "table" | "grid" | "column";
  focusedIndex: number;
  setFocusedIndex: (value: SetStateAction<number>) => void;
  getDisplayFiles: () => FileEntry[];
}

export function useFilePreview({
  selectedDevice,
  currentPath,
  files,
  setError,
  showHiddenFiles,
  selectedFiles,
  setSelectedFiles,
  searchMode,
  searchResults,
  sortColumn,
  sortDirection,
  viewMode,
  focusedIndex,
  setFocusedIndex,
  getDisplayFiles,
}: UseFilePreviewArgs) {

  // File preview state
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [imageOrientation, setImageOrientation] = useState<'portrait' | 'landscape' | 'square'>('landscape');
  const [imageDimensions, setImageDimensions] = useState<{width: number; height: number} | null>(null);

  // Reset orientation and dimensions when preview is closed
  useEffect(() => {
    if (!showPreview) {
      setImageOrientation('landscape');
      setImageDimensions(null);
    }
  }, [showPreview]);

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
        nextIndex = focusedIndex + cols;
      } else if (key === 'ArrowUp') {
        nextIndex = focusedIndex - cols;
      } else if (key === 'ArrowRight') {
        nextIndex = focusedIndex + 1;
      } else if (key === 'ArrowLeft') {
        nextIndex = focusedIndex - 1;
      }
    } else if (viewMode === 'table' || viewMode === 'column') {
      // Table and column view: simple up/down
      if (key === 'ArrowDown') {
        nextIndex = focusedIndex + 1;
      } else if (key === 'ArrowUp') {
        nextIndex = focusedIndex - 1;
      } else {
        // Left/Right don't apply in table/column view
        return;
      }
    } else {
      // Other view modes: don't support preview navigation
      return;
    }

    // Stop at list boundaries - don't wrap around
    if (nextIndex < 0 || nextIndex >= displayFiles.length) {
      return;
    }

    // Skip directories - find next previewable file, stopping at the boundary
    const direction = (key === 'ArrowDown' || key === 'ArrowRight') ? 1 : -1;

    while (nextIndex >= 0 && nextIndex < displayFiles.length) {
      const file = displayFiles[nextIndex];

      // Found a previewable file
      if (!file.is_directory) {
        break;
      }

      // Skip this directory, try next
      nextIndex += direction;
    }

    // Check if we found a previewable file within bounds
    if (nextIndex < 0 || nextIndex >= displayFiles.length) {
      // Hit the boundary without finding a previewable file, don't move
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
      setError(""); // Clear any previous errors
    } catch (err) {
      setError(`Failed to preview file: ${err}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedDevice, focusedIndex, viewMode, files, searchResults, searchMode, currentPath, showHiddenFiles, sortColumn, sortDirection]);

  return {
    showPreview,
    setShowPreview,
    previewData,
    setPreviewData,
    previewLoading,
    previewFileName,
    imageOrientation,
    setImageOrientation,
    imageDimensions,
    setImageDimensions,
    handlePreview,
    previewFileByName,
    previewFile,
    handlePreviewNavigation,
  };
}
