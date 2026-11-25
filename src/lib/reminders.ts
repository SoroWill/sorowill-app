
export { dispatchReminderEmails, dispatchReminderBatch, dispatchDueReminders } from '@/lib/reminders/dispatch';

import { parseRetryAfter } from '@/lib/rate-limit';

export type ReminderKind = 'well-before' | 'imminent';

/**
 * Rate limit details surfaced when a reminders request is rejected with 429.
 * `retryAfterMs` is the parsed Retry-After wait (0 when the header is absent
 * or unparseable) and `message` is a user-facing countdown string.
 */
export interface ReminderRateLimitInfo {
  retryAfterMs: number;
  message: string;
}

export interface ReminderRateLimitError extends Error {
  status: 429;
  retryAfterMs: number;
  retryAfterSeconds: number;
  rateLimit: ReminderRateLimitInfo;
}

/** Formats a user-facing retry message, e.g. "Rate limited. Retry in 30s". */
export function formatRetryAfterMessage(retryAfterMs: number): string {
  const seconds = Math.max(0, Math.ceil(retryAfterMs / 1000));
  return `Rate limited. Retry in ${seconds}s`;
}

/**
 * Builds a 429 error carrying the parsed Retry-After wait so callers can show
 * a countdown and schedule an automatic retry.
 */
export function createReminderRateLimitError(
  response: { headers: { get(name: string): string | null } },
  fallbackMessage = 'Too many reminder requests. Please try again later.',
): ReminderRateLimitError {
  const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After')) ?? 0;
  const message = retryAfterMs > 0 ? formatRetryAfterMessage(retryAfterMs) : fallbackMessage;
  const error = new Error(message) as ReminderRateLimitError;
  error.name = 'ReminderRateLimitError';
  error.status = 429;
  error.retryAfterMs = retryAfterMs;
  error.retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
  error.rateLimit = { retryAfterMs, message };
  return error;
}

export function isReminderRateLimitError(error: unknown): error is ReminderRateLimitError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: unknown }).status === 429 &&
    typeof (error as { retryAfterMs?: unknown }).retryAfterMs === 'number'
  );
}

/**
 * Runs `task`, and if it fails with a 429 that carries a Retry-After wait,
 * waits that long and retries once. The returned result's `rateLimit` is
 * cleared (undefined) once the retry succeeds so stale countdown messages
 * are not shown to the user.
 */
export async function withReminderRateLimitRetry<T>(
  task: () => Promise<T>,
  options: { maxRetries?: number } = {},
): Promise<{ result?: T; rateLimit?: ReminderRateLimitInfo; error?: unknown }> {
  const maxRetries = options.maxRetries ?? 1;
  let attempt = 0;
  for (;;) {
    try {
      const result = await task();
      return { result };
    } catch (error) {
      if (!isReminderRateLimitError(error) || attempt >= maxRetries || error.retryAfterMs <= 0) {
        return {
          error,
          rateLimit: isReminderRateLimitError(error) ? error.rateLimit : undefined,
        };
      }
      attempt += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, error.retryAfterMs));
    }
  }
}

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

// Escaping lives in '@/lib/html' so route handlers can use it without the
// store; re-exported here for existing imports.
export { escapeHtml } from '@/lib/html';
import { escapeHtml } from '@/lib/html';

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
// NOTE: The KV env vars are snapshotted once at module load (see kvConfig
// below) instead of being re-read from process.env on every KV round-trip.

const KV_LOCK_TTL_SECONDS = 30;
/** How long to wait between retry attempts when the lock is held. */
const KV_LOCK_RETRY_DELAY_MS = 100;
/** Maximum number of acquire retries before giving up. */
const KV_LOCK_MAX_RETRIES = 20;
type KvConfig = { url: string; token: string; storeKey: string; lockKey: string };

function readKvConfig(): KvConfig | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const storeKey = process.env.REMINDER_STORE_KV_KEY || 'sorowill:reminder-store';
  return { url, token, storeKey, lockKey: `${storeKey}:lock` };
}

// Env vars are read once at module load and cached. kvConfig() is called on
// every KV request (several per reminder operation, more under lock retries),
// and these values never change during the lifetime of a serverless instance,
// so re-reading process.env each time is wasted work (#698).
//
// If the snapshot is incomplete at load time (e.g. a test sets process.env in
// beforeEach after importing this module), kvConfig() falls back to a single
// lazy read and caches that result once it is complete. A missing
// configuration is never cached, so it keeps throwing until it is fixed.
let cachedKvConfig: KvConfig | null = readKvConfig();

/** Clears the cached KV config so the next call re-reads process.env. Test-only. */
export function resetKvConfigCache(): void {
  cachedKvConfig = null;
}

function kvConfig(): KvConfig {
  if (cachedKvConfig) return cachedKvConfig;
  const config = readKvConfig();
  if (!config) {
    throw new Error(
      'Reminder storage is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN ' +
        '(a Vercel KV / Upstash Redis REST endpoint) so reminder subscriptions persist ' +
        'across serverless invocations. See .env.example.',
    );
  }
  cachedKvConfig = config;
  return config;
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
export async function releaseLock(token: string): Promise<void> {
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
export async function acquireLock(): Promise<string> {
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
}: {
  willId: string;
  email: string;
  owner: string;
}): Promise<ReminderRegistrationResult> {
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Invalid email address.' };
  }

  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    const normalizedEmail = normalizeEmail(email);
    const subscriptionKey = `${willId}:${normalizedEmail}`;
    const now = new Date();

    // Check if subscription already exists
    const existing = store.subscriptions[subscriptionKey];

    if (existing && existing.confirmed) {
      // Preserve existing confirmed subscription but update updatedAt
      existing.updatedAt = now.toISOString();
      await writeStore(store);
      return { ok: true, subscription: existing };
    }

    const confirmationToken = crypto.randomUUID();
    const createdAt = existing?.createdAt || now.toISOString();

    const subscription: ReminderSubscription = {
      willId,
      email: normalizedEmail,
      owner,
      confirmed: existing?.confirmed ?? false,
      confirmationToken: existing?.confirmationToken || confirmationToken,
      confirmationExpiresAt: existing?.confirmationExpiresAt || new Date(now.getTime() + CONFIRMATION_TOKEN_TTL_MS).toISOString(),
      unsubscribeToken: existing?.unsubscribeToken || crypto.randomUUID(),
      createdAt,
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
}: {
  token?: string;
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
  const unsubscribeUrl = `${appUrl}/api/reminders/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}&lang=en`;
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

/**
 * Registers a reminder subscription, retrying once when the API answers 429
 * with a `Retry-After` hint (#793). The wait uses the server's hint so a client
 * does not hammer the endpoint while it is rate limited.
 */
export async function registerWithRetry(
  payload: Parameters<typeof registerReminderSubscription>[0],
  options: { maxRetries?: number } = {},
): Promise<ReminderRegistrationResult> {
  const maxRetries = options.maxRetries ?? 1;
  let attempt = 0;

  for (;;) {
    const result = (await registerReminderSubscription(payload)) as ReminderRegistrationResult & {
      status?: number;
      retryAfter?: number;
    };
    if (result.ok) return result;

    const retryAfter = result.retryAfter ?? 0;
    if (result.status !== 429 || attempt >= maxRetries || retryAfter <= 0) return result;

    attempt += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, retryAfter * 1000));
  }
}
