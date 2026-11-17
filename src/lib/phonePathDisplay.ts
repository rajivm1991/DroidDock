/**
 * Labels for the phone path: Internal storage, SD Card, and the folder
 * segments under them. Callers still decide where a click goes.
 */

export function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function isExternalSD(path: string): boolean {
  // External SD cards typically have paths like /storage/XXXX-XXXX
  const match = path.match(/^\/storage\/[0-9A-F]{4}-[0-9A-F]{4}/i);
  return match !== null;
}

export function isInternalStorage(path: string, detectedStoragePath: string): boolean {
  return path.startsWith("/storage/emulated/0") ||
    path === "/storage/emulated/0" ||
    path.startsWith(detectedStoragePath) ||
    path === detectedStoragePath;
}

export type DisplaySegment = {
  label: string;
  isStorage: boolean;
  actualIndex: number;
};

/** Friendly crumb list for list/icons (storage root + remaining folders). */
export function getDisplaySegments(
  currentPath: string,
  detectedStoragePath: string,
): DisplaySegment[] {
  const segments = pathSegments(currentPath);
  const result: DisplaySegment[] = [];

  // Check if we're in internal storage
  if (isInternalStorage(currentPath, detectedStoragePath)) {
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
