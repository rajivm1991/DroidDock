/**
 * Kind labels for List, the MIME type a preview should use, and how many
 * Icons columns fit so arrow keys can move by a row. Thumbnails are loaded
 * elsewhere.
 */

import type { FileEntry } from "./file-types";

const IMAGE_MIME_TYPES: { [key: string]: string } = {
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'png': 'image/png',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'bmp': 'image/bmp'
};

/** MIME type from file extension; defaults to image/jpeg when unknown. */
export function getImageMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return IMAGE_MIME_TYPES[ext || ''] || 'image/jpeg'; // default to jpeg if unknown
}

/** Kind/type label for the List Kind column (Folder, Image, Video, …). */
export function getFileKind(file: FileEntry): string {
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

/**
 * Count of `.grid-item` tiles in the first visual row for arrow-key navigation.
 * Pass a pane root so Phone and This Mac grids are not mixed when both are open.
 */
export function calculateGridColumns(root?: ParentNode | null): number {
  const gridItems = (root ?? document).querySelectorAll(".grid-item");
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
