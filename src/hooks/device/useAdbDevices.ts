/**
 * Whether adb is available, and the phones plugged in. While adb is ready the
 * list refreshes about once a second, and the selected phone stays put if it
 * is still there. Loading that phone’s files is a separate effect.
 */
import { SetStateAction, useEffect, useState } from "react";
import { type AdbDevice, sameAdbDeviceList } from "../../lib/adbDevices";
import { invoke } from "@tauri-apps/api/core";

export interface UseAdbDevicesArgs {
  setError: (value: SetStateAction<string>) => void;
}

export function useAdbDevices({
  setError,
}: UseAdbDevicesArgs) {
  const [adbAvailable, setAdbAvailable] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<AdbDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [adbPath, setAdbPath] = useState<string>("");

  // Check if ADB is available on startup
  useEffect(() => {
    checkAdb();
  }, []);

  /**
   * Plug/unplug used to need a manual Refresh — easy to miss when the device disconnects
   * or a cable is reattached. Background device poll while ADB is ready (1s). Safe because
   * an unchanged list skips React updates, and get_devices caches model names so each
   * tick is mostly a cheap `adb devices` (not getprop every second). Does not watch USB
   * at the OS layer, remove Refresh, or use `adb track-devices`.
   */
  useEffect(() => {
    if (!adbAvailable) return;
    void loadDevices();
    const timer = window.setInterval(() => {
      void loadDevices();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [adbAvailable]);

  async function checkAdb() {
    try {
      const currentPath = await invoke<string>("get_current_adb_path");
      setAdbPath(currentPath);

      const available = await invoke<boolean>("check_adb");
      setAdbAvailable(available);
    } catch (err) {
      setAdbAvailable(false);
      setError("ADB is not installed or not in PATH");
    }
  }

  /**
   * Selection used to stick after unplug if another device remained, and polls must not
   * wipe unrelated error banners every few seconds. Refresh the list; keep the current
   * phone if still present; otherwise pick the first ready device (or the first
   * listed). Skip setState when the list is unchanged so the UI does not flicker on
   * every poll. Does not reload the file list itself (path/device effects handle that).
   */
  async function loadDevices() {
    try {
      const deviceList = await invoke<AdbDevice[]>("get_devices");
      setDevices((prev) => (sameAdbDeviceList(prev, deviceList) ? prev : deviceList));
      setSelectedDevice((current) => {
        if (deviceList.length === 0) {
          // Empty sidebar explains how to connect — not a red banner.
          return "";
        }
        if (current && deviceList.some((d) => d.id === current)) {
          return current;
        }
        const ready = deviceList.find((d) => d.status === "device");
        return (ready ?? deviceList[0]).id;
      });
    } catch (err) {
      /**
       * Connect-empty assumes ADB is present; if the binary was moved or deleted after
       * setup, keep polling from showing a dead phone list. Re-check ADB and return to
       * AdbSetupScreen when it is gone. Does not teach platform-tools install here.
       */
      const message = String(err);
      const adbGone =
        /Failed to execute adb|No such file|not found|ENOENT|cannot find/i.test(
          message,
        );
      if (adbGone) {
        setAdbAvailable(false);
        setDevices([]);
        setSelectedDevice("");
        setError("");
        return;
      }
      setError(`Failed to get devices: ${err}`);
    }
  }

  return {
    adbAvailable,
    devices,
    selectedDevice,
    setSelectedDevice,
    adbPath,
    checkAdb,
    loadDevices,
  };
}
