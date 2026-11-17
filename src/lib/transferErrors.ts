/**
 * How the copy queue recognises the two errors it handles specially. Rust reports a
 * stopped copy as exactly "Cancelled" and a file-over-folder clash as a message that
 * starts with "Type mismatch". Every other error embeds a file path, so a path such as
 * "/sdcard/Cancelled report.pdf" must never be mistaken for either of them.
 */

export function isCancelledError(message: string): boolean {
  return message === "Cancelled";
}

export function isTypeMismatchError(message: string): boolean {
  return message.startsWith("Type mismatch");
}
