/**
 * Top bar: phone picker, Look for phones, Sync, and Settings. It only draws
 * what the shell hooks pass in.
 */
import type { RefObject, SetStateAction } from "react";
import { type AdbDevice } from "../../lib/adbDevices";

export interface AppChromeProps {
  devices: AdbDevice[];
  selectedDevice: string;
  setSelectedDevice: (value: SetStateAction<string>) => void;
  setSettingsOpen: (value: SetStateAction<boolean>) => void;
  settingsOpen: boolean;
  phoneMenuOpen: boolean;
  setPhoneMenuOpen: (value: SetStateAction<boolean>) => void;
  phonePickerRef: RefObject<HTMLDivElement | null>;
  loadDevices: () => Promise<void>;
  handleOpenSyncDialog: () => void;
  connectedDevice: AdbDevice | undefined;
}

export function AppChrome({
  devices,
  selectedDevice,
  setSelectedDevice,
  setSettingsOpen,
  settingsOpen,
  phoneMenuOpen,
  setPhoneMenuOpen,
  phonePickerRef,
  loadDevices,
  handleOpenSyncDialog,
  connectedDevice,
}: AppChromeProps) {
  return (
    <header className="compact-header">
      <div className="header-row-1">
        <div className="header-controls header-controls-bar">
          {/*
            MacOS native <select> painted its own list over our header control and
            looked broken. Label + in-app panel below the trigger matches app chrome
            and reads as a chooser. Does not use system menus or emoji-only
            affordances.
          */}
          <div className="header-bar-start" ref={phonePickerRef}>
            <span className="header-field-label" id="phone-picker-label">
              Phone
            </span>
            <div className="phone-picker">
              <button
                type="button"
                className={`phone-picker-trigger control-btn header-icon-btn ${phoneMenuOpen ? "is-open" : ""}`}
                aria-labelledby="phone-picker-label"
                aria-haspopup="listbox"
                aria-expanded={phoneMenuOpen}
                disabled={devices.length === 0}
                onClick={() => setPhoneMenuOpen((open) => !open)}
              >
                <span className="phone-picker-value">
                  {connectedDevice
                    ? connectedDevice.model || connectedDevice.id
                    : "No phone connected"}
                </span>
                <span className="phone-picker-chevron" aria-hidden>
                  ▾
                </span>
              </button>
              {phoneMenuOpen && devices.length > 0 && (
                <ul className="phone-picker-menu" role="listbox" aria-labelledby="phone-picker-label">
                  {devices.map((device) => {
                    const active = device.id === selectedDevice;
                    const statusLabel =
                      device.status === "device" ? "Ready over USB" : device.status;
                    return (
                      <li key={device.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`phone-picker-option ${active ? "is-active" : ""}`}
                          onClick={() => {
                            setSelectedDevice(device.id);
                            setPhoneMenuOpen(false);
                          }}
                        >
                          <span className="phone-picker-option-name">
                            {device.model || device.id}
                          </span>
                          <span className="phone-picker-option-status">{statusLabel}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={loadDevices}
              className="control-btn header-icon-btn phone-refresh-btn tooltip-bottom"
              data-tooltip="Look for phones"
              aria-label="Look for phones"
            >
              ↻
            </button>
          </div>
          <div className="header-bar-end">
            <button
              type="button"
              onClick={handleOpenSyncDialog}
              disabled={!selectedDevice}
              className="control-btn header-icon-btn tooltip-bottom"
              data-tooltip="Sync folders (⌘I)"
              aria-label="Sync folders"
              data-tutorial="sync"
            >
              Sync
            </button>
            <div className="settings-dropdown">
              <button
                type="button"
                onClick={() => setSettingsOpen(!settingsOpen)}
                data-tooltip="Settings"
                aria-label="Settings"
                data-tutorial="settings"
                className="control-btn settings-btn header-icon-btn tooltip-bottom"
              >
                ⚙
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
