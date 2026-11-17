/**
 * Settings: display, the phone start folder, presets, and help. Saved values
 * stay with the parent. Picking a start folder does not move the phone there
 * until the next time a phone connects.
 */

import type { RefObject } from "react";
import { THUMBNAIL_MAX_MB } from "../../lib/file-types";
import { MAX_CUSTOM_PRESETS, type CustomPreset, type FolderOpenClick, type PhoneDefaultFolder } from "../../lib/presets";

export interface SettingsDialogProps {
  thumbnailsEnabled: boolean;
  onThumbnailsEnabledChange: (value: boolean) => void;
  showHiddenFiles: boolean;
  onShowHiddenFilesChange: (value: boolean) => void;
  themeMode: "light" | "dark" | "system";
  onThemeModeChange: (mode: "light" | "dark" | "system") => void;
  folderOpenClick: FolderOpenClick;
  onFolderOpenClickChange: (value: FolderOpenClick) => void;
  phoneDefaultFolder: PhoneDefaultFolder;
  onPhoneDefaultFolderChange: (value: PhoneDefaultFolder) => void;
  phoneDefaultMenuOpen: boolean;
  onPhoneDefaultMenuOpenChange: (open: boolean | ((prev: boolean) => boolean)) => void;
  phoneDefaultPickerRef: RefObject<HTMLDivElement | null>;
  phoneCustomPresets: CustomPreset[];
  macCustomPresets: CustomPreset[];
  onRemovePhonePreset: (path: string) => void;
  onRemoveMacPreset: (path: string) => void;
  onShowQuickTour: () => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  thumbnailsEnabled,
  onThumbnailsEnabledChange,
  showHiddenFiles,
  onShowHiddenFilesChange,
  themeMode,
  onThemeModeChange,
  folderOpenClick,
  onFolderOpenClickChange,
  phoneDefaultFolder,
  onPhoneDefaultFolderChange,
  phoneDefaultMenuOpen,
  onPhoneDefaultMenuOpenChange,
  phoneDefaultPickerRef,
  phoneCustomPresets,
  macCustomPresets,
  onRemovePhonePreset,
  onRemoveMacPreset,
  onShowQuickTour,
  onShowShortcuts,
  onClose,
}: SettingsDialogProps) {
  return (
    <div
      className="modal-overlay"
      onClick={() => {
        onPhoneDefaultMenuOpenChange(false);
        onClose();
      }}
    >
      {/*
        Settings mixed toggles, presets, and the start folder with no section
        breaks. Grouped sections + start-folder picker.
      */}
      <div
        className="modal-dialog settings-dialog"
        onClick={(e) => e.stopPropagation()}
        aria-modal="true"
      >
        <h3>Settings</h3>
        <p className="settings-dialog-intro">
          Display, phone start folder, and saved place shortcuts.
        </p>

        <section className="settings-section" aria-labelledby="settings-display-title">
          <span className="settings-section-title" id="settings-display-title">
            Display
          </span>
          <span className="settings-section-hint">
            How file lists look in both panes.
          </span>
          <div className="settings-item">
            <label className="toggle-label">
              <span>Show Thumbnails</span>
              <input
                type="checkbox"
                checked={thumbnailsEnabled}
                onChange={(e) => onThumbnailsEnabledChange(e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-switch"></span>
            </label>
            {/*
              The larger Icons size is kept when this is turned off, and both
              the toggle and that size are still there the next time the app opens.
            */}
            <p className="settings-item-hint">
              Icons view on Phone and This Mac: photo/video previews for files
              under {THUMBNAIL_MAX_MB} MB (jpg, png, gif, webp, bmp, mp4, mov,
              and similar). Larger files keep type icons. While this is on,
              Icons can zoom past the usual largest size so previews are easier
              to see. Turning it off returns to that usual size, and turning it
              on again brings the larger size back. This is remembered the next
              time DroidDock opens. List and Columns stay glyphs only. Phone
              previews load over USB; videos need ffmpeg on this Mac.
            </p>
          </div>
          <div className="settings-item">
            <label className="toggle-label">
              <span>Show Hidden Files</span>
              <input
                type="checkbox"
                checked={showHiddenFiles}
                onChange={(e) => onShowHiddenFilesChange(e.target.checked)}
                className="toggle-checkbox"
              />
              <span className="toggle-switch"></span>
            </label>
          </div>
          <div className="settings-item">
            <span className="settings-item-label">Appearance</span>
            <div className="theme-segmented" role="radiogroup" aria-label="Appearance">
              {(["light", "dark", "system"] as const).map((mode) => (
                <button
                  key={mode}
                  role="radio"
                  aria-checked={themeMode === mode}
                  className={`theme-segment${themeMode === mode ? " active" : ""}`}
                  onClick={() => onThemeModeChange(mode)}
                >
                  {mode === "light" ? "Light" : mode === "dark" ? "Dark" : "Sync with System"}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-item">
            {/*
              Open-on-single-click vs Finder-like double-click is a preference;
              default stays double. Multi-select modifiers never open a folder even
              in single-click mode.
            */}
            <span className="settings-item-label">Open folders with</span>
            <div
              className="theme-segmented"
              role="radiogroup"
              aria-label="Open folders with"
            >
              {(
                [
                  ["double", "Double-click"],
                  ["single", "Single-click"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={folderOpenClick === value}
                  className={`theme-segment${folderOpenClick === value ? " active" : ""}`}
                  onClick={() => onFolderOpenClickChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section
          className="settings-section settings-section-inline"
          aria-labelledby="settings-phone-start-title"
        >
          <div className="settings-section-copy">
            <span className="settings-section-title" id="settings-phone-start-title">
              Phone start folder
            </span>
            <span className="settings-section-hint">
              Opens when a phone connects. If it is missing or empty, Internal
              storage is used instead.
            </span>
          </div>
          <div className="settings-default-picker phone-picker" ref={phoneDefaultPickerRef}>
            <button
              type="button"
              className={`phone-picker-trigger ${phoneDefaultMenuOpen ? "is-open" : ""}`}
              aria-labelledby="settings-phone-start-title"
              aria-haspopup="listbox"
              aria-expanded={phoneDefaultMenuOpen}
              onClick={() => onPhoneDefaultMenuOpenChange((open) => !open)}
            >
              <span className="phone-picker-value">
                {phoneDefaultFolder === "camera"
                  ? "Camera"
                  : phoneDefaultFolder === "screenshots"
                    ? "Screenshots"
                    : phoneDefaultFolder === "downloads"
                      ? "Downloads"
                      : "Internal storage"}
              </span>
              <span className="phone-picker-chevron" aria-hidden>
                ▾
              </span>
            </button>
            {phoneDefaultMenuOpen && (
              <ul
                className="phone-picker-menu"
                role="listbox"
                aria-labelledby="settings-phone-start-title"
              >
                {(
                  [
                    ["camera", "Camera"],
                    ["screenshots", "Screenshots"],
                    ["downloads", "Downloads"],
                    ["internal", "Internal storage"],
                  ] as const
                ).map(([value, label]) => (
                  <li key={value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={phoneDefaultFolder === value}
                      className={`phone-picker-option ${
                        phoneDefaultFolder === value ? "is-active" : ""
                      }`}
                      onClick={() => {
                        onPhoneDefaultFolderChange(value);
                        onPhoneDefaultMenuOpenChange(false);
                      }}
                    >
                      <span className="phone-picker-option-name">{label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="settings-section" aria-labelledby="settings-phone-presets-title">
          <span className="settings-section-title" id="settings-phone-presets-title">
            Phone presets
          </span>
          <span className="settings-section-hint">
            In the phone pane, select a folder (or open it) and press + next to
            the place marks. Up to {MAX_CUSTOM_PRESETS} custom shortcuts.
          </span>
          {phoneCustomPresets.length === 0 ? (
            <p className="settings-preset-empty">No custom phone presets yet.</p>
          ) : (
            <div className="settings-preset-list">
              {phoneCustomPresets.map((preset) => (
                <div key={preset.path} className="settings-preset-row">
                  <div className="settings-preset-meta">
                    <span className="settings-preset-name">{preset.label}</span>
                    <span className="settings-preset-path" title={preset.path}>
                      {preset.path}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-preset-remove"
                    onClick={() => onRemovePhonePreset(preset.path)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="settings-mac-presets-title">
          <span className="settings-section-title" id="settings-mac-presets-title">
            Mac presets
          </span>
          <span className="settings-section-hint">
            In This Mac, select a folder (or open it) and press + next to the
            place marks. Up to {MAX_CUSTOM_PRESETS} custom shortcuts.
          </span>
          {macCustomPresets.length === 0 ? (
            <p className="settings-preset-empty">No custom Mac presets yet.</p>
          ) : (
            <div className="settings-preset-list">
              {macCustomPresets.map((preset) => (
                <div key={preset.path} className="settings-preset-row">
                  <div className="settings-preset-meta">
                    <span className="settings-preset-name">{preset.label}</span>
                    <span className="settings-preset-path" title={preset.path}>
                      {preset.path}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="settings-preset-remove"
                    onClick={() => onRemoveMacPreset(preset.path)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="settings-section" aria-labelledby="settings-help-title">
          <span className="settings-section-title" id="settings-help-title">
            Help
          </span>
          <span className="settings-section-hint">
            Quick tour of the dual-pane shell, plus keys for browsing and
            copying.
          </span>
          {/*
            Tour dismisses permanently; people need a way back without clearing
            localStorage by hand. Reopen TutorialOverlay and clear the dismiss
            flag. Does not auto-replay on every Settings open.
          */}
          <button
            type="button"
            className="settings-action-btn"
            onClick={onShowQuickTour}
          >
            <span className="settings-action-btn-label">Show quick tour</span>
            <span className="settings-action-btn-chevron" aria-hidden>
              ›
            </span>
          </button>
          <button
            type="button"
            className="settings-action-btn"
            onClick={onShowShortcuts}
          >
            <span className="settings-action-btn-label">Keyboard shortcuts</span>
            <span className="settings-action-btn-chevron" aria-hidden>
              ›
            </span>
          </button>
        </section>

        <div className="modal-actions">
          <button
            type="button"
            onClick={() => {
              onPhoneDefaultMenuOpenChange(false);
              onClose();
            }}
            className="cancel-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
