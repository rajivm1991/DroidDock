import { useEffect, useRef, useState } from "react";
import {
  previewMarksFromItems,
  TransferMarksStack,
} from "./TransferMarksStack";
import { useSmoothedProgress } from "../../hooks/ui/useSmoothedProgress";
import {
  useVerticalScrollEdgeFades,
  verticalScrollFadeClassName,
} from "../../hooks/ui/useVerticalScrollEdgeFades";

/**
 * Transfer queue panel. Downloads used to be a single dismissible status line with
 * no bar, byte total, speed, or ETA — closing it hid the text while adb kept
 * running, and uploads did not get even that line.
 *
 * Shows one byte-weighted overall bar, a row per file, and controls while the
 * browser stays usable underneath. Pause lets the in-flight adb call finish but
 * holds files that have not started; Cancel stops that call. Dismiss appears only
 * after the job ends so an active copy cannot vanish by accident. Successful and
 * cancelled jobs auto-dismiss after a few seconds; failures stay until Dismiss or
 * Retry. After eight seconds below ~50 KB/s a slow-cable hint appears — it does
 * not cancel the copy or detect the cable, it only warns.
 *
 * Progress is smoothed Finder-style: measured bytes are the floor; between sparse
 * adb ticks the bar keeps moving from recent throughput instead of CSS step animation.
 * Stats use fixed widths and tabular numbers so live updates do not shift neighbors;
 * titles and names ellipsize. Tokens (`--text`, `--muted`, `--accent`) keep labels
 * readable in light and dark.
 *
 * A decorative one-to-four FileMark stack sits left of the title (nested paths
 * collapse to one folder mark per root). Multi-file jobs expand via “Show files” /
 * “Hide files” on the right, not a chevron on the icons. Single-file jobs are
 * compact: filename under the title, one bar, no file list or 1/1 counter.
 *
 * Long file lists scroll inside the panel with top/bottom edge fades like
 * breadcrumbs; the list divider stays on the shell. App.tsx owns the job,
 * conflict preflight, and Rust download/upload/cancel; Skipped and Kept both rows
 * reflect conflict choices on either direction.
 */

export type TransferDirection = "download" | "upload";

/**
 * `preparing`: the row is queued for adb but no bytes have moved yet (destination
 * re-check, Keep-both name probes, removing a replaced folder). The smoothed bar
 * used to advance during that window and looked like an active copy — bars freeze
 * and the UI shows “Preparing…” until Rust's first byte event moves the row to
 * `active`. Preparing bytes do not count toward progress totals.
 */
export type TransferFileStatus =
  | "queued"
  | "preparing"
  | "awaiting_conflict"
  | "active"
  | "done"
  | "skipped"
  | "renamed"
  | "failed"
  | "cancelled";

export interface TransferFile {
  /** Sent to Rust as `transferId` and matched on `transfer-byte-progress`. */
  id: string;
  name: string;
  status: TransferFileStatus;
  bytes: number;
  total: number;
  error?: string;
  /**
   * Kept on the row so Retry can run the same copy again without asking
   * the person to re-pick the file. Not shown in the panel.
   */
  devicePath: string;
  localPath: string;
}

export interface TransferJob {
  id: string;
  direction: TransferDirection;
  /** Short label such as "Downloading to Downloads". */
  title: string;
  destination: string;
  files: TransferFile[];
  startedAt: number | null;
  finishedAt: number | null;
  paused: boolean;
  /** True while a conflict dialog is open; smoothed progress must not crawl even if a row looks active. No adb copy runs in this state. */
  awaitingConflict: boolean;
  /** Set when the person cancels the job (including from a conflict dialog). Outcome reads Cancelled even if some rows already finished — those rows stay Done/Skipped. */
  userCancelled: boolean;
}

interface TransferPanelProps {
  job: TransferJob;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onRetryFailed: () => void;
  onReveal: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  return `${secs}s`;
}

const STATUS_LABEL: Record<TransferFileStatus, string> = {
  queued: "Queued",
  preparing: "Preparing…",
  awaiting_conflict: "Waiting…",
  active: "Copying",
  done: "Done",
  skipped: "Skipped",
  renamed: "Kept both",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * Nested queue paths like `Folder/file` collapse to one folder mark per root;
 * loose names use type glyphs. Shared with the drag ghost via TransferMarksStack.
 * Top-level folder names without a slash are not inferred as folders — the queue
 * expands folder jobs into nested paths before rows reach the panel.
 */
function previewMarksFromFiles(files: TransferFile[]) {
  return previewMarksFromItems(
    files.map((file) => ({
      name: file.name,
      isDirectory: false,
    })),
  );
}

export function TransferPanel({
  job,
  onPause,
  onResume,
  onCancel,
  onDismiss,
  onRetryFailed,
  onReveal,
}: TransferPanelProps) {
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(true);
  // Speed is the slope of bytes over a short window, not a lifetime average.
  // A lifetime average stays depressed after the slow start of a large file.
  const [samples, setSamples] = useState<{ at: number; bytes: number }[]>([]);
  const filesScrollerRef = useRef<HTMLUListElement>(null);
  const filesEdgeKey = `${job.id}:${job.files.length}:${expanded ? "open" : "closed"}`;
  const fileEdges = useVerticalScrollEdgeFades(filesScrollerRef, filesEdgeKey);

  const running = job.finishedAt == null;
  const waitingOnConflict = job.awaitingConflict;
  const truthBytes = job.files.reduce((sum, file) => {
    if (file.status === "done" || file.status === "renamed" || file.status === "skipped") {
      return sum + (file.total || file.bytes);
    }
    // Only count real adb progress — never crawl while awaiting_conflict.
    if (file.status === "active") return sum + file.bytes;
    return sum;
  }, 0);
  const totalBytes = job.files.reduce((sum, file) => sum + (file.total || 0), 0);
  const knownTotal = job.files.every(
    (file) => file.total > 0 || file.status === "skipped" || file.status === "awaiting_conflict",
  );

  const finishedCount = job.files.filter((file) =>
    file.status === "done" || file.status === "skipped" || file.status === "renamed",
  ).length;
  const failedCount = job.files.filter((file) => file.status === "failed").length;
  const cancelledCount = job.files.filter((file) => file.status === "cancelled").length;
  const active = job.files.find((file) => file.status === "active");
  const awaitingRow = job.files.find((file) => file.status === "awaiting_conflict");
  const preparingRow = active
    ? undefined
    : job.files.find((file) => file.status === "preparing");
  const preparing = !!preparingRow;
  // Cancel after some files finished used to read as Finished when no row was marked cancelled. Cancel wins over success; failures win when the job was not user-cancelled (Retry stays).
  const outcome: "running" | "failed" | "cancelled" | "success" = running
    ? "running"
    : job.userCancelled || cancelledCount > 0
      ? "cancelled"
      : failedCount > 0
        ? "failed"
        : "success";

  // Freeze smoothed bars while a conflict dialog is open or a row is still
  // preparing (no adb bytes yet) — no fake “copying”.
  const progressPaused = job.paused || waitingOnConflict || preparing;
  const displayBytes = useSmoothedProgress(truthBytes, totalBytes, {
    active: running && !waitingOnConflict && !preparing,
    paused: progressPaused,
    finished: !running,
    resetKey: job.id,
  });
  const displayActiveBytes = useSmoothedProgress(active?.bytes ?? 0, active?.total ?? 0, {
    active: running && !!active && !progressPaused,
    paused: progressPaused,
    finished: !active || active.status !== "active",
    resetKey: active ? `${job.id}:${active.id}` : `${job.id}:none`,
  });

  const percent =
    totalBytes > 0 ? Math.min(100, (displayBytes / totalBytes) * 100) : 0;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running, job.id]);

  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  // Success and cancelled jobs auto-dismiss after a few seconds so the strip does not linger like muted chrome; failures stay until Dismiss or Retry.
  useEffect(() => {
    if (outcome !== "success" && outcome !== "cancelled") return;
    const timer = window.setTimeout(() => onDismissRef.current(), 4500);
    return () => window.clearTimeout(timer);
  }, [outcome, job.id]);

  // Speed / ETA use measured truth, not the smoothed display.
  useEffect(() => {
    if (!running) return;
    setSamples((previous) => {
      const next = [...previous, { at: Date.now(), bytes: truthBytes }];
      const cutoff = Date.now() - 4000;
      return next.filter((sample) => sample.at >= cutoff);
    });
  }, [truthBytes, running]);

  const elapsedSec = job.startedAt ? Math.max(0, (now - job.startedAt) / 1000) : 0;
  let bytesPerSec = 0;
  if (samples.length >= 2) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = (last.at - first.at) / 1000;
    if (dt > 0.4) bytesPerSec = Math.max(0, (last.bytes - first.bytes) / dt);
  }
  const remainingBytes = Math.max(0, totalBytes - truthBytes);
  const etaSec = bytesPerSec > 0 ? remainingBytes / bytesPerSec : Number.POSITIVE_INFINITY;
  const filePercent =
    active && active.total > 0
      ? Math.min(100, (displayActiveBytes / active.total) * 100)
      : 0;

  const statusLabel =
    outcome === "running"
      ? waitingOnConflict
        ? "Waiting for your choice…"
        : job.paused
          ? "Paused"
          : preparing
            ? "Preparing…"
            : "Copying…"
      : outcome === "failed"
        ? `${failedCount} failed`
        : outcome === "cancelled"
          ? "Cancelled"
          : "Finished";

  const previewMarks = previewMarksFromFiles(job.files);
  const singleFile = job.files.length === 1;
  const soleFile = singleFile ? job.files[0] : null;
  const soleLeafName = soleFile
    ? soleFile.name.split("/").pop() || soleFile.name
    : "";

  const marks = <TransferMarksStack marks={previewMarks} />;

  return (
    <section
      className={`transfer-panel transfer-panel-${outcome}${
        singleFile ? " transfer-panel-single" : ""
      }`}
      aria-label="Transfer progress"
      aria-live={outcome === "running" ? "polite" : "assertive"}
    >
      <header className="transfer-panel-header">
        <div className="transfer-marks-wrap" aria-hidden>
          {marks}
        </div>
        <div className="transfer-heading">
          <div className="transfer-title-row">
            <div className="transfer-title">{job.title}</div>
            <span className={`transfer-status-pill is-${outcome}`}>{statusLabel}</span>
          </div>
          {singleFile && soleFile ? (
            <div className="transfer-destination transfer-destination-sole">
              <span className="transfer-sole-name" title={soleFile.name}>
                {soleLeafName}
              </span>
              <span className="transfer-sole-sep" aria-hidden>
                ·
              </span>
              <span className="transfer-sole-dest" title={job.destination}>
                {job.destination}
              </span>
            </div>
          ) : (
            <div className="transfer-destination">{job.destination}</div>
          )}
        </div>
        <div className="transfer-actions">
          {running && !waitingOnConflict && (
            job.paused ? (
              <button type="button" onClick={onResume}>Resume</button>
            ) : (
              <button type="button" onClick={onPause}>Pause</button>
            )
          )}
          {running && (
            <button type="button" onClick={onCancel}>Cancel</button>
          )}
          {!running && failedCount > 0 && (
            <button type="button" onClick={onRetryFailed}>Retry failed</button>
          )}
          {!running && job.direction === "download" && (
            <button type="button" onClick={onReveal}>Show in Finder</button>
          )}
          {!running && (
            <button type="button" className="transfer-dismiss-btn" onClick={onDismiss}>
              Dismiss
            </button>
          )}
          {/* Labeled Show/Hide files on the right — expand used to hide on the icon stack. Omitted for single-file jobs with no list. */}
          {!singleFile && (
            <button
              type="button"
              className={`transfer-files-toggle${expanded ? " is-open" : ""}`}
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide files" : `Show files (${job.files.length})`}
              <span className="transfer-files-toggle-chevron" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div
        className="transfer-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Overall transfer progress"
      >
        <div
          className="transfer-bar-fill"
          style={{
            transform: `scaleX(${
              knownTotal ? Math.min(1, percent / 100) : running ? 0.08 : 1
            })`,
          }}
        />
      </div>

      <div className="transfer-stats">
        <span className="transfer-stat transfer-stat-pct">
          {knownTotal ? `${Math.round(percent)}%` : "Measuring…"}
        </span>
        <span className="transfer-stat transfer-stat-bytes">
          {formatBytes(displayBytes)} / {knownTotal ? formatBytes(totalBytes) : "…"}
        </span>
        {!singleFile && (
          <span className="transfer-stat transfer-stat-files">
            {finishedCount} / {job.files.length} files
          </span>
        )}
        <span className="transfer-stat transfer-stat-speed">
          {bytesPerSec > 0 ? `${formatBytes(bytesPerSec)}/s` : "—"}
        </span>
        <span className="transfer-stat transfer-stat-elapsed">
          Elapsed {formatDuration(elapsedSec)}
        </span>
        <span className="transfer-stat transfer-stat-eta">
          {waitingOnConflict
            ? "Waiting…"
            : preparing && !job.paused
              ? "Preparing…"
            : running && !job.paused
              ? `Left ${formatDuration(etaSec)}`
              : job.paused
                ? "Paused"
                : outcome === "success"
                  ? "All done"
                  : statusLabel}
        </span>
      </div>
      {running &&
        !waitingOnConflict &&
        !preparing &&
        elapsedSec > 8 &&
        bytesPerSec < 50_000 &&
        truthBytes < Math.max(totalBytes, 1) && (
        <div className="transfer-slow">
          Very slow. The cable may be charge-only, or the phone is busy. This is not a frozen window.
        </div>
      )}

      {singleFile && soleFile?.status === "failed" && soleFile.error && (
        <div className="transfer-sole-error" title={soleFile.error}>
          {soleFile.error}
        </div>
      )}

      {!singleFile && awaitingRow && (
        <div className="transfer-current">
          <div className="transfer-current-name">{awaitingRow.name}</div>
          <div className="transfer-current-meta">Choose what to do in the dialog</div>
        </div>
      )}

      {!singleFile && preparingRow && !awaitingRow && (
        <div className="transfer-current">
          <div className="transfer-current-name">{preparingRow.name}</div>
          <div className="transfer-current-meta">Preparing — checking the destination</div>
        </div>
      )}

      {!singleFile && active && !awaitingRow && (
        <div className="transfer-current">
          <div className="transfer-current-name">{active.name}</div>
          <div className="transfer-bar transfer-bar-file">
            <div
              className="transfer-bar-fill"
              style={{ transform: `scaleX(${Math.min(1, filePercent / 100)})` }}
            />
          </div>
          <div className="transfer-current-meta">
            {formatBytes(displayActiveBytes)} /{" "}
            {active.total ? formatBytes(active.total) : "…"}
          </div>
        </div>
      )}

      {!singleFile && expanded && (
        <div
          className={`${verticalScrollFadeClassName(fileEdges)} transfer-files-fade`}
        >
          <ul className="transfer-files" ref={filesScrollerRef}>
            {job.files.map((file) => (
              <li key={file.id} className={`transfer-file is-${file.status}`}>
                <span className="transfer-file-name" title={file.error || file.name}>
                  {file.name}
                </span>
                <span className="transfer-file-size">
                  {file.total ? formatBytes(file.total) : ""}
                </span>
                <span className="transfer-file-bar">
                  {(file.status === "active" ||
                    file.status === "done" ||
                    file.status === "renamed") && (
                    <span
                      style={{
                        transform: `scaleX(${
                          file.status === "active"
                            ? Math.min(1, filePercent / 100)
                            : 1
                        })`,
                      }}
                    />
                  )}
                </span>
                <span className="transfer-file-status">
                  {file.status === "failed" && file.error
                    ? file.error
                    : STATUS_LABEL[file.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
