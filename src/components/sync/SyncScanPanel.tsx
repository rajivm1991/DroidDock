/**
 * Live scan status for a folder sync: computer side, phone side, hashing, and
 * elapsed time. The parent starts and cancels the scan.
 */

import { formatElapsed } from "../../lib/format";
import { describeScan, type ScanProgress } from "../../types/sync";

export type SyncScanMap = Partial<Record<ScanProgress["side"], ScanProgress>>;

export function SyncScanPanel({
  syncScan,
  syncScanElapsed,
}: {
  syncScan: SyncScanMap;
  syncScanElapsed: number;
}) {
  const sides: { key: ScanProgress["side"]; label: string }[] = [
    { key: "computer", label: "Computer" },
    { key: "phone", label: "Phone" },
  ];
  return (
    <div className="sync-scan-panel">
      <div className="sync-progress-file">Scanning folders. Large folders can take a while.</div>
      {sides.map(({ key, label }) => {
        const p = syncScan[key];
        return (
          <div key={key} className="sync-scan-row">
            <div className="sync-progress-stats">
              <span>{label}</span>
              <span>{p ? describeScan(p) : "Waiting..."}</span>
            </div>
            {p?.phase === "hashing" && (
              <div className="sync-progress-bar">
                <div
                  className="sync-progress-bar-fill"
                  style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
      <div className="sync-progress-stats">
        <span>Elapsed</span>
        <span>{formatElapsed(syncScanElapsed)}</span>
      </div>
    </div>
  );
}
