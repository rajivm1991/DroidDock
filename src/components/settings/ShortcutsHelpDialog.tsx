/**
 * Static list of keyboard shortcuts, opened with Cmd+/. The parent shows and
 * hides it. Escape is handled here in the capture phase so macOS does not
 * leave fullscreen before the dialog closes; the shortcuts hook also closes
 * it as a backstop. Key labels use Return (the Mac keycap), not Enter.
 * Pane-scoped keys follow the active side (Phone or This Mac).
 */
import { useEffect } from "react";

export function ShortcutsHelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog shortcuts-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard Shortcuts</h3>
        <div className="shortcuts-grid">
          <div className="shortcuts-section">
            <h4>Panes</h4>
            <div className="shortcut-item">
              <span className="shortcut-keys">Ctrl + Tab</span>
              <span className="shortcut-desc">Switch active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + [</span>
              <span className="shortcut-desc">Back on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + ]</span>
              <span className="shortcut-desc">Forward on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Ctrl + Return</span>
              <span className="shortcut-desc">
                Open menu for the focused or selected item
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">↑ ↓</span>
              <span className="shortcut-desc">
                While the menu is open: move among menu items
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Return</span>
              <span className="shortcut-desc">
                While the menu is open: run the highlighted item
              </span>
            </div>
          </div>

          <div className="shortcuts-section">
            <h4>Navigation</h4>
            <div className="shortcut-item">
              <span className="shortcut-keys">↑ ↓</span>
              <span className="shortcut-desc">
                List: move and select (Shift extends)
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">↑ ↓ ← →</span>
              <span className="shortcut-desc">
                Icons: move and select (Shift extends)
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">↑ ↓</span>
              <span className="shortcut-desc">
                Columns: move and select without opening a folder
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">→</span>
              <span className="shortcut-desc">Columns: open the highlighted folder</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">←</span>
              <span className="shortcut-desc">Columns: go back one column</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Return</span>
              <span className="shortcut-desc">Open the focused folder</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Delete</span>
              <span className="shortcut-desc">Go to parent folder</span>
            </div>
          </div>

          <div className="shortcuts-section">
            <h4>Selection &amp; copy</h4>
            <div className="shortcut-item">
              <span className="shortcut-keys">Shift + Arrow</span>
              <span className="shortcut-desc">Add to the selection while moving</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + A</span>
              <span className="shortcut-desc">Select all on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + C</span>
              <span className="shortcut-desc">
                Remember selection; tip shows ⌘V on the other pane
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + V</span>
              <span className="shortcut-desc">
                Paste into the open folder on the other pane
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + D</span>
              <span className="shortcut-desc">
                Copy selection now into the open folder on the other pane
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Esc</span>
              <span className="shortcut-desc">
                Close tip or menu → exit rename → close dialogs → clear selection
              </span>
            </div>
          </div>

          <div className="shortcuts-section">
            <h4>Phone only</h4>
            <div className="shortcut-item">
              <span className="shortcut-keys">Space</span>
              <span className="shortcut-desc">Preview focused file</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + Return</span>
              <span className="shortcut-desc">Rename focused file or folder</span>
            </div>
          </div>

          <div className="shortcuts-section">
            <h4>View &amp; search</h4>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + 1</span>
              <span className="shortcut-desc">List view on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + 2</span>
              <span className="shortcut-desc">Icons view on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + 3</span>
              <span className="shortcut-desc">Columns view on the active pane</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + +</span>
              <span className="shortcut-desc">
                Zoom in (Icons). Goes larger while Show Thumbnails is on
              </span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + -</span>
              <span className="shortcut-desc">Zoom out (Icons view)</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + F</span>
              <span className="shortcut-desc">Focus filter on the active pane</span>
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
              <span className="shortcut-keys">Cmd + I</span>
              <span className="shortcut-desc">Sync folders</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + /</span>
              <span className="shortcut-desc">Show this help</span>
            </div>
            <div className="shortcut-item">
              <span className="shortcut-keys">Cmd + ,</span>
              <span className="shortcut-desc">Open settings</span>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button
            onClick={onClose}
            className="cancel-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
