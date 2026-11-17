/** Shared file row used by the phone browser and the Mac pane. */
export interface FileEntry {
  name: string;
  permissions: string;
  size: string;
  date: string;
  is_directory: boolean;
  extension: string | null;
}

/** Phone ADB pull and local Mac reads both skip files above this size; Settings copy matches the Rust limit. Thumbnails apply in Icons view only (List/Columns keep type glyphs). */
export const THUMBNAIL_MAX_BYTES = 50_000_000;
export const THUMBNAIL_MAX_MB = 50;

const THUMBNAIL_IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"] as const;
const THUMBNAIL_VIDEO_EXTS = ["mp4", "avi", "mov", "mkv", "webm", "3gp", "m4v"] as const;

export function needsThumbnail(file: FileEntry): boolean {
  if (file.is_directory || !file.extension) return false;
  const ext = file.extension.toLowerCase().replace(/^\./, "");
  return (
    (THUMBNAIL_IMAGE_EXTS as readonly string[]).includes(ext) ||
    (THUMBNAIL_VIDEO_EXTS as readonly string[]).includes(ext)
  );
}
