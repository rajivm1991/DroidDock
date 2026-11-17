/**
 * Reads a saved true or false setting without ever throwing. A missing, damaged, or
 * unexpected value gives null, so the caller can fall back to its default instead of
 * crashing the app at startup.
 */
export function readStoredBoolean(
  key: string,
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean | null {
  try {
    const value = storage.getItem(key);
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  } catch {
    return null;
  }
}
