/**
 * Activity log / audit trail (#894). Every user action is appended to a bounded, per-wallet
 * in-browser log with a timestamp and the acting wallet address, and can be downloaded as
 * JSON or CSV. Nothing leaves the browser: the log is stored in `localStorage` so it survives
 * a reload, and it is keyed by wallet so one account never sees another's trail.
 */

export const ACTIVITY_LOG_KEY = 'sorowill:activity-log';
/** Oldest entries are dropped once the log grows past this, so storage cannot fill up. */
export const ACTIVITY_LOG_LIMIT = 500;

export type ActivityAction =
  | 'wallet-connected'
  | 'wallet-disconnected'
  | 'wills-loaded'
  | 'wills-refreshed'
  | 'check-in'
  | 'will-exported'
  | 'activity-log-downloaded';

export interface ActivityEntry {
  /** Unique id for the entry. */
  id: string;
  /** ISO 8601 timestamp of when the action happened. */
  timestamp: string;
  /** The action that was performed. */
  action: ActivityAction;
  /** Wallet address of the user who performed it, or `null` when no wallet was connected. */
  user: string | null;
  /** Human readable description of the action. */
  detail: string;
  /** Extra structured context (will id, file name, counts, ...). */
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ActivityLogOptions {
  /** Injectable clock, for deterministic tests. */
  now?: Date;
  /** Injectable id generator, for deterministic tests. */
  id?: string;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ActivityEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.timestamp === 'string' &&
    typeof entry.action === 'string' &&
    typeof entry.detail === 'string' &&
    (entry.user === null || typeof entry.user === 'string')
  );
}

/** Every logged entry, oldest first. Returns `[]` when storage is unavailable or corrupt. */
export function getActivityLog(): ActivityEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Entries for one wallet (or the wallet-less entries when `user` is `null`), oldest first. */
export function getActivityLogForUser(user: string | null): ActivityEntry[] {
  return getActivityLog().filter((entry) => entry.user === user);
}

/**
 * Appends an entry to the log and returns it. Never throws: a full or disabled storage must not
 * break the action the user was performing.
 */
export function logActivity(
  action: ActivityAction,
  user: string | null,
  detail: string,
  metadata?: ActivityEntry['metadata'],
  options: ActivityLogOptions = {},
): ActivityEntry {
  const entry: ActivityEntry = {
    id: options.id ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    timestamp: (options.now ?? new Date()).toISOString(),
    action,
    user,
    detail,
    ...(metadata ? { metadata } : {}),
  };

  if (!isBrowser()) return entry;

  try {
    const entries = [...getActivityLog(), entry].slice(-ACTIVITY_LOG_LIMIT);
    window.localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or blocked (private mode): the action itself still succeeds.
  }

  return entry;
}

/** Removes every entry, or only those of one wallet when `user` is given. */
export function clearActivityLog(user?: string | null): void {
  if (!isBrowser()) return;
  try {
    if (user === undefined) {
      window.localStorage.removeItem(ACTIVITY_LOG_KEY);
      return;
    }
    const remaining = getActivityLog().filter((entry) => entry.user !== user);
    window.localStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(remaining));
  } catch {
    // Nothing to do: the log is best effort.
  }
}

function escapeCSVField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** The log as CSV, one row per entry, oldest first. */
export function exportActivityLogToCSV(entries: ActivityEntry[]): string {
  const headers = ['Timestamp', 'Action', 'User', 'Detail', 'Metadata'];
  const rows = entries.map((entry) =>
    [
      escapeCSVField(entry.timestamp),
      escapeCSVField(entry.action),
      escapeCSVField(entry.user),
      escapeCSVField(entry.detail),
      escapeCSVField(entry.metadata ? JSON.stringify(entry.metadata) : ''),
    ].join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

/** Version of the JSON log layout, bumped if the shape changes. */
export const ACTIVITY_LOG_EXPORT_VERSION = 1;

/** The log as pretty printed JSON, with the export time and entry count. */
export function exportActivityLogToJSON(entries: ActivityEntry[], exportedAt: Date = new Date()): string {
  return JSON.stringify(
    {
      version: ACTIVITY_LOG_EXPORT_VERSION,
      exportedAt: exportedAt.toISOString(),
      count: entries.length,
      entries,
    },
    null,
    2,
  );
}

/** File name for a log download, for example `sorowill-activity-2026-11-22.json`. */
export function activityLogFileName(extension: 'csv' | 'json', date: Date = new Date()): string {
  return `sorowill-activity-${date.toISOString().slice(0, 10)}.${extension}`;
}

/** Triggers a browser download of `content` as `fileName`. No-op outside the browser. */
export function downloadActivityLog(content: string, fileName: string, mimeType: string): void {
  if (!isBrowser()) return;
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
