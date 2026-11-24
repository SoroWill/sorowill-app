import type { ReminderStore, ReminderDispatchResult } from '@/lib/reminders';
import { getReminderKind, acquireLock, releaseLock, parseReminderStore } from '@/lib/reminders';
import { nextCheckinDeadline } from '@/lib/deadlines';
import { getSoroWillClient } from '@/lib/sorowill';

const BATCH_SIZE = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string | undefined | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  return EMAIL_REGEX.test(email.trim());
}

async function readStoreFromKv(): Promise<ReminderStore> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const storeKey = process.env.REMINDER_STORE_KV_KEY || 'sorowill:reminder-store';

  if (!url || !token) {
    throw new Error('KV configuration missing');
  }

  const response = await fetch(`${url}/get/${encodeURIComponent(storeKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to read reminder store: ${response.status}`);
  }

  const payload = (await response.json()) as { result: string | null };
  if (!payload.result) {
    return { subscriptions: {}, history: {} };
  }

  const parsed = JSON.parse(payload.result) as Partial<ReminderStore>;
  return {
    subscriptions: parsed.subscriptions ?? {},
    history: parsed.history ?? {},
  };
}

async function writeStoreToKv(store: ReminderStore): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const storeKey = process.env.REMINDER_STORE_KV_KEY || 'sorowill:reminder-store';

  if (!url || !token) {
    throw new Error('KV configuration missing');
  }

  const response = await fetch(`${url}/set/${encodeURIComponent(storeKey)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(store),
  });

  if (!response.ok) {
    throw new Error(`Failed to write reminder store: ${response.status}`);
  }
}

export async function dispatchReminder(willId: string): Promise<void> {
  // Stub: dispatch logic would send actual emails here
  console.log(`Dispatching reminder for will ${willId}`);
}

export async function dispatchReminderBatch(
  willIds: string[],
): Promise<ReminderDispatchResult> {
  const results: ReminderDispatchResult = {
    sent: 0,
    skipped: 0,
    errors: [],
  };

  for (const willId of willIds) {
    try {
      await dispatchReminder(willId);
      results.sent++;
    } catch (err) {
      results.errors.push(`${willId}: ${String(err)}`);
    }
  }

  return results;
}

export async function dispatchReminderEmails(): Promise<ReminderDispatchResult> {
  const result: ReminderDispatchResult = {
    sent: 0,
    skipped: 0,
    errors: [],
  };

  const lockToken = await acquireLock();
  try {
    // Read store AFTER acquiring lock
    const store = await readStoreFromKv();
    const client = getSoroWillClient();

    const subscriptionEntries = Object.entries(store.subscriptions);
    const batches = [];

    // Split into batches
    for (let i = 0; i < subscriptionEntries.length; i += BATCH_SIZE) {
      batches.push(subscriptionEntries.slice(i, i + BATCH_SIZE));
    }

    // Process each batch
    for (const batch of batches) {
      for (const [, subscription] of batch) {
        // Skip unconfirmed subscriptions
        if (!subscription.confirmed) {
          result.skipped++;
          continue;
        }

        // Skip if already in history
        const histKey = `${subscription.willId}:${subscription.email}`;
        if (store.history[histKey]) {
          result.skipped++;
          continue;
        }

        // Skip invalid email formats before attempting to send
        if (!isValidEmail(subscription.email)) {
          console.warn(
            `Skipping reminder for will ${subscription.willId}: invalid email format "${subscription.email}"`,
          );
          result.skipped++;
          continue;
        }

        try {
          // Get the will to determine reminder kind
          const will = await client.getWill(subscription.willId);
          const deadline = nextCheckinDeadline(will);
          const daysRemaining = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
          const kind = getReminderKind(daysRemaining);

          // Dispatch the email (stub)
          await dispatchReminder(subscription.willId);

          // Record in history based on reminder kind
          const now = new Date().toISOString();
          if (!store.history[histKey]) {
            store.history[histKey] = {
              willId: subscription.willId,
              email: subscription.email,
            };
          }

          if (kind === 'imminent') {
            store.history[histKey]!.imminentSentAt = now;
          } else {
            store.history[histKey]!.wellBeforeSentAt = now;
          }

          result.sent++;
        } catch (err) {
          result.errors.push(`${subscription.willId}: ${String(err)}`);
        }
      }

      // Write after each batch
      await writeStoreToKv(store);
    }
  } catch (err) {
    result.errors.push(`Dispatch failed: ${String(err)}`);
  } finally {
    await releaseLock(lockToken);
  }

  return result;
}

export async function dispatchDueReminders(): Promise<ReminderDispatchResult> {
  return dispatchReminderEmails();
}

// ---------------------------------------------------------------------------
// Backup / restore (#913)
//
// The reminder store is the only durable application data this app owns (wills
// live on-chain and are recoverable from the contract). A daily job copies it
// to a separate KV key, keeping the last BACKUP_RETENTION snapshots, and the
// restore path validates a snapshot before it replaces the live store.
// ---------------------------------------------------------------------------

/** How many daily snapshots are kept. Older ones are pruned. */
export const BACKUP_RETENTION = 7;

export interface BackupSnapshot {
  /** ISO timestamp of when the snapshot was taken. */
  createdAt: string;
  /** Schema version of the payload, so a future format can be told apart. */
  version: 1;
  store: ReminderStore;
}

export interface BackupResult {
  ok: boolean;
  /** KV key the snapshot was written to. */
  key?: string;
  /** Number of subscriptions captured. */
  subscriptions?: number;
  /** Number of history entries captured. */
  history?: number;
  /** Keys pruned because they fell outside the retention window. */
  pruned?: string[];
  error?: string;
}

export interface RestoreResult {
  ok: boolean;
  /** KV key the snapshot was read from. */
  key?: string;
  subscriptions?: number;
  history?: number;
  error?: string;
}

function backupConfig(): { url: string; token: string; prefix: string } {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error('KV configuration missing');
  }
  const storeKey = process.env.REMINDER_STORE_KV_KEY || 'sorowill:reminder-store';
  return { url, token, prefix: `${storeKey}:backup:` };
}

/** The KV key for the snapshot taken on `date` (UTC day granularity). */
export function backupKeyFor(date: Date, prefix = 'sorowill:reminder-store:backup:'): string {
  return `${prefix}${date.toISOString().slice(0, 10)}`;
}

async function kvGet(url: string, token: string, key: string): Promise<string | null> {
  const response = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to read ${key}: ${response.status}`);
  }
  const payload = (await response.json()) as { result: string | null };
  return payload.result ?? null;
}

async function kvSet(url: string, token: string, key: string, value: string): Promise<void> {
  const response = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body: value,
  });
  if (!response.ok) {
    throw new Error(`Failed to write ${key}: ${response.status}`);
  }
}

async function kvDel(url: string, token: string, key: string): Promise<void> {
  const response = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to delete ${key}: ${response.status}`);
  }
}

/** Lists the snapshot keys currently stored, newest first. */
export async function listBackupKeys(): Promise<string[]> {
  const { url, token, prefix } = backupConfig();
  const response = await fetch(`${url}/keys/${encodeURIComponent(`${prefix}*`)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Failed to list backups: ${response.status}`);
  }
  const payload = (await response.json()) as { result: string[] | null };
  return (payload.result ?? []).sort().reverse();
}

/**
 * Takes a snapshot of the reminder store and writes it under today's key,
 * then prunes snapshots beyond BACKUP_RETENTION. Safe to run more than once a
 * day: the same day's key is overwritten with the freshest copy.
 */
export async function createBackup(now: Date = new Date()): Promise<BackupResult> {
  try {
    const { url, token, prefix } = backupConfig();
    const store = await readStoreFromKv();
    const snapshot: BackupSnapshot = {
      createdAt: now.toISOString(),
      version: 1,
      store,
    };
    const key = backupKeyFor(now, prefix);
    await kvSet(url, token, key, JSON.stringify(snapshot));

    const keys = await listBackupKeys();
    const pruned: string[] = [];
    for (const stale of keys.slice(BACKUP_RETENTION)) {
      await kvDel(url, token, stale);
      pruned.push(stale);
    }

    return {
      ok: true,
      key,
      subscriptions: Object.keys(store.subscriptions).length,
      history: Object.keys(store.history).length,
      pruned,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Restores the reminder store from a snapshot. Without `key` the newest
 * snapshot is used. The payload is validated first, so a corrupt or truncated
 * backup is refused instead of wiping the live store.
 */
export async function restoreBackup(key?: string): Promise<RestoreResult> {
  try {
    const { url, token } = backupConfig();
    const targetKey = key ?? (await listBackupKeys())[0];
    if (!targetKey) {
      return { ok: false, error: 'No backup snapshots found.' };
    }

    const raw = await kvGet(url, token, targetKey);
    if (!raw) {
      return { ok: false, error: `Backup ${targetKey} not found.` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: `Backup ${targetKey} is not valid JSON.` };
    }

    const payload = parsed as Partial<BackupSnapshot>;
    const validated = parseReminderStore(payload?.store);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    await replaceStoreInKv(validated.store);
    return {
      ok: true,
      key: targetKey,
      subscriptions: Object.keys(validated.store.subscriptions).length,
      history: Object.keys(validated.store.history).length,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function replaceStoreInKv(store: ReminderStore): Promise<void> {
  const lockToken = await acquireLock();
  try {
    await writeStoreToKv(store);
  } finally {
    await releaseLock(lockToken);
  }
}
