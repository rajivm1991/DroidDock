/**
 * Pointer-anchored context menu shared by the phone and Mac panes. Primary Copy
 * names the open folder on the other side when a phone is connected; both sides
 * can create a New folder in the open directory. Phone rows get Preview, Rename,
 * and Delete; Mac rows get Open in Finder and Copy absolute path. Copy-to-phone
 * is omitted when no phone is connected. Selection is the caller’s job — this
 * menu does not change it. Sync and Mac rename/delete/preview are out of scope
 * here.
 *
 * Ctrl+Return (and right-click) open this menu. While it is open, ↑↓ move the
 * highlight among items and Return runs the highlighted action — same keys as
 * the file list would use, so the shortcuts hook leaves them alone via capture.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type FileMenuSide = "phone" | "mac";

type MenuAction = {
  id: string;
  label: string;
  primary?: boolean;
  run: () => void;
};

export function FileMenu({
  x,
  y,
  side,
  isDirectory,
  copyLabel,
  onCopy,
  onNewFolder,
  onPreview,
  onRename,
  onDelete,
  onOpenInFinder,
  onCopyAbsolutePath,
  onClose,
}: {
  x: number;
  y: number;
  side: FileMenuSide;
  isDirectory: boolean;
  /** e.g. Copy to “Downloads” on This Mac */
  copyLabel: string;
  /** Omit on Mac when no phone is connected. */
  onCopy?: () => void;
  /** Create a folder in the open directory on this side. */
  onNewFolder?: () => void;
  onPreview?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  /** Mac only — reveal the row’s path in Finder. */
  onOpenInFinder?: () => void;
  /** Mac only — put the full Mac path on the clipboard. */
  onCopyAbsolutePath?: () => void;
  onClose: () => void;
}) {
  const actions = useMemo(() => {
    const items: MenuAction[] = [];
    if (onCopy) {
      items.push({ id: "copy", label: copyLabel, primary: true, run: onCopy });
    }
    if (onNewFolder) {
      items.push({ id: "new-folder", label: "New folder", run: onNewFolder });
    }
    if (side === "mac" && onOpenInFinder) {
      items.push({ id: "finder", label: "Open in Finder", run: onOpenInFinder });
    }
    if (side === "mac" && onCopyAbsolutePath) {
      items.push({
        id: "copy-path",
        label: "Copy absolute path",
        run: onCopyAbsolutePath,
      });
    }
    if (side === "phone" && !isDirectory && onPreview) {
      items.push({ id: "preview", label: "Preview", run: onPreview });
    }
    if (side === "phone" && onRename) {
      items.push({ id: "rename", label: "Rename", run: onRename });
    }
    if (side === "phone" && onDelete) {
      items.push({ id: "delete", label: "Delete", run: onDelete });
    }
    return items;
  }, [
    side,
    isDirectory,
    copyLabel,
    onCopy,
    onNewFolder,
    onPreview,
    onRename,
    onDelete,
    onOpenInFinder,
    onCopyAbsolutePath,
  ]);

  const [highlightIndex, setHighlightIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setHighlightIndex(0);
  }, [actions.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (actions.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setHighlightIndex((i) => (i + 1) % actions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setHighlightIndex((i) => (i - 1 + actions.length) % actions.length);
        return;
      }
      if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        const action = actions[highlightIndex];
        if (action) action.run();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [actions, highlightIndex, onClose]);

  useEffect(() => {
    const btn = menuRef.current?.querySelectorAll('[role="menuitem"]')[highlightIndex] as
      | HTMLElement
      | undefined;
    btn?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  const left = Math.min(x, window.innerWidth - 260);
  const top = Math.min(y, window.innerHeight - 40 * Math.max(actions.length, 1) - 24);

  return (
    <div
      className="file-menu-backdrop"
      onClick={onClose}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={menuRef}
        className="file-menu"
        style={{ left, top }}
        role="menu"
        onClick={(event) => event.stopPropagation()}
      >
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className={`${action.primary ? "file-menu-primary" : ""}${
              index === highlightIndex ? " is-highlighted" : ""
            }`.trim()}
            onMouseEnter={() => setHighlightIndex(index)}
            onClick={action.run}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
