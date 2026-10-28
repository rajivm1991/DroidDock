/**
 * Payloads and progress shapes the folder-sync dialog shares with the Rust
 * commands. Field names match the invoke contract. Nothing here starts a sync.
 */

export type SyncDirection = "PhoneToComputer" | "ComputerToPhone" | "BothWays";

export interface SyncOptions {
  local_path: string;
  device_path: string;
  direction: SyncDirection;
  recursive: boolean;
  delete_missing: boolean;
  match_mode: string;
  file_patterns: string[];
  allow_copy: boolean;
  allow_update: boolean;
  allow_rename: boolean;
}

export interface SyncAction {
  file_path: string;
  action_type: string;
  direction: string;
  size: number;
  reason: string;
  rename_from: string | null;
}

export interface SyncPreview {
  actions: SyncAction[];
  total_transfer_bytes: number;
  copy_count: number;
  update_count: number;
  delete_count: number;
  skip_count: number;
  rename_count: number;
}

export interface ScanProgress {
  side: "computer" | "phone";
  phase: "listing" | "hashing";
  done: number;
  total: number | null;
}

export interface SyncProgress {
  current_file: string;
  completed_count: number;
  total_count: number;
  completed_bytes: number;
  total_bytes: number;
}

export interface SyncResult {
  success_count: number;
  copied_count: number;
  updated_count: number;
  renamed_count: number;
  deleted_count: number;
  skip_count: number;
  error_count: number;
  errors: string[];
}

export interface SavedSync {
  id: string;
  name: string;
  options: SyncOptions;
}

export function describeScan(p: ScanProgress): string {
  if (p.phase === "hashing") {
    return `Hashing ${p.done.toLocaleString()} / ${(p.total ?? 0).toLocaleString()} files`;
  }
  return p.total !== null
    ? `${p.done.toLocaleString()} / ${p.total.toLocaleString()} items scanned`
    : `${p.done.toLocaleString()} items scanned`;
}
