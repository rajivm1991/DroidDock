/**
 * The copy that is on screen: its rows, pause and cancel flags, and the
 * byte-progress listener. Starting a copy and asking about name clashes
 * happen in the queue and the flow hooks.
 */
import { useEffect, useRef, useState } from "react";
import { type TransferJob, type TransferFile } from "../../components/transfer/TransferPanel";
import { listen } from "@tauri-apps/api/event";

export function useTransferJob() {
  /** Finished jobs for this session only. Not written to disk. */
  const [transferHistory, setTransferHistory] = useState<TransferJob[]>([]);

  // File transfer state
  const [downloading, setDownloading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  // The queue replaces the old one-line progress banners. See TransferPanel.tsx
  // for why the copy stays on screen with bytes, speed, and time remaining.
  const [transferJob, setTransferJob] = useState<TransferJob | null>(null);
  const transferJobRef = useRef<TransferJob | null>(null);
  // Pause and cancel are read from the async copy loop, which would otherwise
  // close over a stale render. Pause waits between files. Cancel also asks
  // Rust to kill the adb process that is already running.
  const transferControl = useRef({ pause: false, cancel: false });
  /** Row id currently inside download_file / upload_file (set before invoke). */
  const inFlightTransferIdRef = useRef<string | null>(null);
  const [revealAfterDownload, setRevealAfterDownload] = useState<boolean>(() => {
    const saved = localStorage.getItem("droiddock-reveal-after-download");
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [downloadOptionsOpen, setDownloadOptionsOpen] = useState<boolean>(false);

  // Byte events from adb pull/push. The id was assigned when the file was
  // queued, so this listener can update the right row without knowing which
  // command is in flight. Functional setState avoids a stale job closure.
  // Bytes never move backward for a row — upload ticks used to briefly report
  // 0 between phone stats and the overall bar snapped empty.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ transfer_id: string; bytes: number; total: number }>(
      "transfer-byte-progress",
      (event) => {
        const { transfer_id, bytes, total } = event.payload;
        setTransferJob((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            files: prev.files.map((file) => {
              if (file.id !== transfer_id) return file;
              const nextTotal = total > 0 ? total : file.total;
              const nextBytes = Math.max(file.bytes, bytes);
              // Rust emits the first event right before adb starts moving
              // bytes, so that is when Preparing becomes Copying.
              return {
                ...file,
                status: file.status === "preparing" ? ("active" as const) : file.status,
                bytes: nextTotal > 0 ? Math.min(nextBytes, nextTotal) : nextBytes,
                total: nextTotal,
              };
            }),
          };
          transferJobRef.current = next;
          return next;
        });
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "droiddock-reveal-after-download",
      JSON.stringify(revealAfterDownload),
    );
  }, [revealAfterDownload]);

  function updateTransferFile(id: string, patch: Partial<TransferFile>) {
    setTransferJob((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        files: prev.files.map((file) => (file.id === id ? { ...file, ...patch } : file)),
      };
      transferJobRef.current = next;
      return next;
    });
  }

  function setJobAwaitingConflict(awaiting: boolean) {
    setTransferJob((prev) => {
      if (!prev) return prev;
      const next = { ...prev, awaitingConflict: awaiting };
      transferJobRef.current = next;
      return next;
    });
  }

  /** Every row that has not finished becomes cancelled (the queue stopped). */
  function cancelRemainingRows() {
    setTransferJob((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        awaitingConflict: false,
        files: prev.files.map((row) =>
          row.status === "queued" ||
          row.status === "awaiting_conflict" ||
          row.status === "preparing"
            ? { ...row, status: "cancelled" as const }
            : row,
        ),
      };
      transferJobRef.current = next;
      return next;
    });
  }

  function pauseTransfer() {
    transferControl.current.pause = true;
    setTransferJob((prev) => {
      if (!prev) return prev;
      const next = { ...prev, paused: true };
      transferJobRef.current = next;
      return next;
    });
  }

  function resumeTransfer() {
    transferControl.current.pause = false;
    setTransferJob((prev) => {
      if (!prev) return prev;
      const next = { ...prev, paused: false };
      transferJobRef.current = next;
      return next;
    });
  }

  return {
    transferHistory,
    setTransferHistory,
    downloading,
    setDownloading,
    uploading,
    setUploading,
    downloadProgress,
    setDownloadProgress,
    uploadProgress,
    setUploadProgress,
    transferJob,
    setTransferJob,
    transferJobRef,
    transferControl,
    inFlightTransferIdRef,
    revealAfterDownload,
    setRevealAfterDownload,
    downloadOptionsOpen,
    setDownloadOptionsOpen,
    updateTransferFile,
    setJobAwaitingConflict,
    cancelRemainingRows,
    pauseTransfer,
    resumeTransfer,
  };
}
