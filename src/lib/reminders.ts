import { WillStatus, type Will } from '@sorowill/sdk';

import { nextCheckinDeadline } from '@/lib/deadlines';
import { getSoroWillClient } from '@/lib/sorowill';
export { dispatchReminderEmails, dispatchReminderBatch, dispatchDueReminders } from '@/lib/reminders/dispatch';

export type ReminderKind = 'well-before' | 'imminent';

export interface ReminderSubscription {
  willId: string;
  email: string;
  owner: string;
  confirmed: boolean;
  confirmationToken?: string | null;
  confirmationExpiresAt?: string | null;
  unsubscribeToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Window during which a confirmation token is valid (24 hours).
 * Expired tokens cannot be confirmed and return an error.
 */
export const CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Escapes characters with special meaning in HTML contexts.
 * Applied to all dynamic values interpolated into HTML email templates.
 */
export function escapeHtml(value: string): string {
  if (typeof value !== 'string') {
    value = String(value);
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReminderHistoryEntry {
  willId: string;
  email: string;
  wellBeforeSentAt?: string;
  imminentSentAt?: string;
}

export interface ReminderStore {
  subscriptions: Record<string, ReminderSubscription>;
  history: Record<string, ReminderHistoryEntry>;
}

export interface ReminderRegistrationResult {
  ok: boolean;
  subscription?: ReminderSubscription;
  error?: string;
}

export interface ReminderDispatchResult {
  sent: number;
  skipped: number;
  errors: string[];
}

// Reminder subscriptions/history are persisted to a Vercel KV / Upstash Redis
// REST endpoint so they survive across serverless invocations (the local
// filesystem is ephemeral per-invocation on Vercel and cannot be relied on).
// See .env.example and README.md#reminder-delivery for KV_REST_API_URL / KV_REST_API_TOKEN.
//
// NOTE: All env vars are read at call time (inside helper functions) rather
// than at module-load time, so that tests can set process.env before calling
// any of the exported functions.

const KV_LOCK_TTL_SECONDS = 30;
/** How long to wait between retry attempts when the lock is held. */
const KV_LOCK_RETRY_DELAY_MS = 100;
/** Maximum number of acquire retries before giving up. */
const KV_LOCK_MAX_RETRIES = 20;
/** Renew the lock when remaining TTL drops below this threshold (seconds). */
const KV_LOCK_RENEW_THRESHOLD_SECONDS = 10;

function kvConfig(): { url: string; token: string; storeKey: string; lockKey: string } {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const storeKey = process.env.REMINDER_STORE_KV_KEY || 'sorowill:reminder-store';
  if (!url || !token) {
    throw new Error(
      'Reminder storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN ' +
        '(a Vercel KV / Upstash Redis REST endpoint) so reminder subscriptions persist ' +
        'across serverless invocations. See .env.example.',
    );
  }
  return { url, token, storeKey, lockKey: `${storeKey}:lock` };
}

function getAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getReminderKind(daysRemaining: number): ReminderKind {
  return daysRemaining <= 14 ? 'imminent' : 'well-before';
}

/**
 * Terminal will statuses for which reminder subscriptions and history are no
 * longer meaningful. Once a will reaches one of these states it will never
 * become Active again, so its subscription and history entries are pruned from
 * the store to keep it (and the per-run RPC calls it drives) bounded.
 */
const TERMINAL_WILL_STATUSES: ReadonlySet<WillStatus> = new Set([
  WillStatus.Triggered,
  WillStatus.Released,
  WillStatus.Cancelled,
  WillStatus.Archived,
  WillStatus.Settled,
]);

function isTerminalWillStatus(status: WillStatus): boolean {
  return TERMINAL_WILL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Distributed lock helpers (Upstash REST SET NX / DEL)
// ---------------------------------------------------------------------------

/**
 * Attempt to acquire a distributed lock.
 * Uses SET <key> <token> EX <ttl> NX via the Upstash REST API.
 * Returns the lock token on success, or null if the lock is already held.
 */
async function tryAcquireLock(token: string): Promise<boolean> {
  // Upstash REST: POST /set/<key>/<value>?EX=<ttl>&NX=
  const { url: baseUrl, token: kvToken, lockKey } = kvConfig();
  const url = new URL(
    `/set/${encodeURIComponent(lockKey)}/${encodeURIComponent(token)}`,
    baseUrl,
  );
  url.searchParams.set('EX', String(KV_LOCK_TTL_SECONDS));
  url.searchParams.set('NX', '');

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!response.ok) {
    throw new Error(`Lock acquire request failed: ${response.status}`);
  }
  const body = (await response.json()) as { result: string | null };
  // Upstash returns {"result":"OK"} on success or {"result":null} when key exists.
  return body.result === 'OK';
}

/**
 * Release the distributed lock atomically using an Upstash EVAL Lua script.
 * Only deletes the key when the stored value matches our token (compare-and-delete).
 * This avoids the non-atomic GET-then-DEL race where the lock could be acquired
 * by another process after our GET but before our DEL.
 */
async function releaseLock(token: string): Promise<void> {
  const { url: baseUrl, token: kvToken, lockKey } = kvConfig();
  const script = `
    local current = redis.call('GET', KEYS[1])
    if current == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `;
  const response = await fetch(`${baseUrl}/eval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script,
      keys: [lockKey],
      arguments: [token],
    }),
  });
  if (!response.ok) {
    console.warn(`[reminders] Lock release EVAL failed: ${response.status}`);
  }
}

/**
 * Acquire the distributed lock, retrying up to KV_LOCK_MAX_RETRIES times with
 * a short delay between attempts. Throws if the lock cannot be obtained in time.
 * Returns the token to be passed to releaseLock().
 */
async function acquireLock(): Promise<string> {
  // kvConfig() will throw if the env vars are not set — that surfaces the error
  // clearly before we attempt any network calls.
  kvConfig();
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt <= KV_LOCK_MAX_RETRIES; attempt++) {
    if (await tryAcquireLock(token)) {
      return token;
    }
    // Wait before retrying.
    await new Promise<void>((resolve) => setTimeout(resolve, KV_LOCK_RETRY_DELAY_MS));
  }
  throw new Error(
    `[reminders] Could not acquire store lock after ${KV_LOCK_MAX_RETRIES} retries. ` +
      'Another process may be holding it or the lock TTL has not yet expired.',
  );
}

/**
 * Renew the distributed lock TTL if it is close to expiring.
 * Uses Upstash REST EXPIRE to extend the lock by another KV_LOCK_TTL_SECONDS.
 * Returns true if the lock was renewed or still has plenty of time left.
 */
async function renewLock(lockKey: string): Promise<boolean> {
  const { url: baseUrl, token: kvToken } = kvConfig();
  const response = await fetch(`${baseUrl}/expire/${encodeURIComponent(lockKey)}/${KV_LOCK_TTL_SECONDS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  if (!response.ok) {
    return false;
  }
  const body = (await response.json()) as { result: number | null };
  return body.result === 1;
}

// ---------------------------------------------------------------------------
// Store read / write
// ---------------------------------------------------------------------------

async function readStore(): Promise<ReminderStore> {
  const { url, token, storeKey } = kvConfig();
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

async function writeStore(store: ReminderStore): Promise<void> {
  const { url, token, storeKey } = kvConfig();
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

function getHistoryKey(willId: string, email: string): string {
  return `${willId}:${normalizeEmail(email)}`;
}

/**
 * Remove a subscription and its history entry from the store. Used when a will
 * reaches a terminal status so the store does not grow without bound.
 */
function pruneSubscription(store: ReminderStore, subscriptionKey: string): void {
  const subscription = store.subscriptions[subscriptionKey];
  if (subscription) {
    delete store.history[getHistoryKey(subscription.willId, subscription.email)];
  }
  delete store.subscriptions[subscriptionKey];
}

export async function registerReminderSubscription({
  willId,
  email,
  owner,
  appUrl,
}: {
  willId: string;
  email: string;
  owner: string;
  appUrl: string;
}): Promise<ReminderRegistrationResult> {
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    const normalizedEmail = normalizeEmail(email);
    const subscriptionKey = `${willId}:${normalizedEmail}`;
    const confirmationToken = crypto.randomUUID();
    const now = new Date();

    const subscription: ReminderSubscription = {
      willId,
      email: normalizedEmail,
      owner,
      confirmed: false,
      confirmationToken,
      confirmationExpiresAt: new Date(now.getTime() + CONFIRMATION_TOKEN_TTL_MS).toISOString(),
      unsubscribeToken: crypto.randomUUID(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    store.subscriptions[subscriptionKey] = subscription;
    await writeStore(store);

    return { ok: true, subscription };
  } finally {
    await releaseLock(lockToken);
  }
}

export async function confirmReminderSubscription(
  token: string,
): Promise<ReminderRegistrationResult> {
  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    let found: { key: string; sub: ReminderSubscription } | null = null;

    for (const [key, sub] of Object.entries(store.subscriptions)) {
      if (sub.confirmationToken === token) {
        found = { key, sub };
        break;
      }
    }

    if (!found) {
      return { ok: false, error: 'Invalid or expired confirmation token.' };
    }

    const { key, sub } = found;
    const now = new Date();

    if (sub.confirmationExpiresAt && new Date(sub.confirmationExpiresAt).getTime() < now.getTime()) {
      return { ok: false, error: 'Invalid or expired confirmation token.' };
    }

    sub.confirmed = true;
    sub.confirmationToken = null;
    sub.confirmationExpiresAt = null;
    sub.updatedAt = now.toISOString();

    store.subscriptions[key] = sub;
    await writeStore(store);

    return { ok: true, subscription: sub };
  } finally {
    await releaseLock(lockToken);
  }
}

export async function unsubscribeReminderSubscription({
  token,
  willId,
  email,
}: {
  token?: string;
  willId?: string;
  email?: string;
}): Promise<ReminderRegistrationResult> {
  // Token-based unsubscribe only (prevent guessing via willId+email)
  if (!token) {
    return { ok: false, error: 'A valid unsubscribe token is required.' };
  }

  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    let found: { key: string; sub: ReminderSubscription } | null = null;

    for (const [key, sub] of Object.entries(store.subscriptions)) {
      if (sub.unsubscribeToken === token) {
        found = { key, sub };
        break;
      }
    }

    if (!found) {
      return { ok: false, error: 'Invalid or expired unsubscribe token.' };
    }

    pruneSubscription(store, found.key);
    await writeStore(store);

    return { ok: true };
  } finally {
    await releaseLock(lockToken);
  }
}

export function buildConfirmationEmailContent({
  appUrl,
  token,
}: {
  appUrl: string;
  token: string;
}): {
  subject: string;
  html: string;
  text: string;
  confirmUrl: string;
} {
  const confirmUrl = `${appUrl}/api/reminders/confirm?token=${encodeURIComponent(token)}`;
  const escapedUrl = escapeHtml(confirmUrl);
  return {
    subject: 'Confirm your SoroWill reminder subscription',
    html: `<p>Click <a href="${escapedUrl}">${escapedUrl}</a> to confirm your subscription.</p>`,
    text: `Confirm your subscription: ${confirmUrl}`,
    confirmUrl,
  };
}

export function buildReminderEmailContent({
  appUrl,
  willId,
  deadline,
  reminderKind,
  unsubscribeToken,
}: {
  appUrl: string;
  willId: string;
  deadline: Date;
  reminderKind: ReminderKind;
  unsubscribeToken: string;
}): {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
} {
  const unsubscribeUrl = `${appUrl}/api/reminders/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const escapedWillId = escapeHtml(willId);
  const escapedUrl = escapeHtml(unsubscribeUrl);
  const deadlineStr = deadline.toISOString();

  const subject = reminderKind === 'imminent'
    ? `🚨 Urgent: Your will check-in is due soon`
    : `📬 Reminder: Check in with your will`;

  return {
    subject,
    html: `<p>Will ID: will #${escapedWillId}</p><p>Deadline: ${deadlineStr}</p><p><a href="${escapedUrl}">${escapedUrl}</a></p>`,
    text: `Will ID: will #${willId}\nDeadline: ${deadlineStr}\nUnsubscribe: ${unsubscribeUrl}`,
    unsubscribeUrl,
  };
}
