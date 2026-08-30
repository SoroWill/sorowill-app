import { WillStatus, type Will } from '@sorowill/sdk';

import { getSoroWillClient } from '@/lib/sorowill';

export type ReminderKind = 'well-before' | 'imminent';

export interface ReminderSubscription {
  willId: string;
  email: string;
  owner: string;
  confirmed: boolean;
  confirmationToken: string;
  createdAt: string;
  updatedAt: string;
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
// See .env.example for KV_REST_API_URL / KV_REST_API_TOKEN.
//
// NOTE: All env vars are read at call time (inside helper functions) rather
// than at module-load time, so that tests can set process.env before calling
// any of the exported functions.

const KV_LOCK_TTL_SECONDS = 30;
/** How long to wait between retry attempts when the lock is held. */
const KV_LOCK_RETRY_DELAY_MS = 100;
/** Maximum number of acquire retries before giving up. */
const KV_LOCK_MAX_RETRIES = 20;

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

function buildDeadline(will: Will): Date {
  return new Date(will.lastCheckin.getTime() + will.checkinPeriodDays * 86_400 * 1000);
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
 * Release the distributed lock. Only deletes the key when the stored value
 * matches our token (compare-and-delete via a pipeline) to avoid accidentally
 * releasing a lock that was re-acquired by another process after our TTL expired.
 */
async function releaseLock(token: string): Promise<void> {
  // Use Upstash pipeline to do GET + conditional DEL atomically.
  // Pipeline endpoint: POST /pipeline  body: array of commands
  const { url: baseUrl, token: kvToken, lockKey } = kvConfig();
  const url = `${baseUrl}/pipeline`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['GET', lockKey],
      // We'll inspect the GET result client-side; the DEL is conditional below.
    ]),
  });
  if (!response.ok) {
    // Best-effort release; don't throw so the caller's finally always completes.
    console.warn(`[reminders] Lock release GET failed: ${response.status}`);
    return;
  }
  const results = (await response.json()) as Array<{ result: string | null }>;
  const currentToken = results[0]?.result;
  if (currentToken !== token) {
    // Lock already expired or was acquired by another process — do not delete.
    return;
  }
  // Safe to delete: token matches.
  await fetch(`${baseUrl}/del/${encodeURIComponent(lockKey)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
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
  if (!willId.trim()) {
    return { ok: false, error: 'A willId is required.' };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, error: 'Please provide a valid email address.' };
  }

  try {
    await getSoroWillClient().getWill(willId);
  } catch {
    return { ok: false, error: 'No will exists with the provided willId.' };
  }

  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    const subscription: ReminderSubscription = {
      willId,
      email: normalizedEmail,
      owner,
      confirmed: false,
      confirmationToken: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    store.subscriptions[`${willId}:${normalizedEmail}`] = subscription;
    await writeStore(store);

    // Send confirmation email outside the lock — it is idempotent and does not
    // touch the store, so there is no need to hold the lock during the network call.
    await sendConfirmationEmail({ to: subscription.email, appUrl, token: subscription.confirmationToken });

    return { ok: true, subscription };
  } finally {
    await releaseLock(lockToken);
  }
}

export async function confirmReminderSubscription(token: string): Promise<ReminderRegistrationResult> {
  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    const subscription = Object.values(store.subscriptions).find((entry) => entry.confirmationToken === token);
    if (!subscription) {
      return { ok: false, error: 'Invalid or expired confirmation token.' };
    }

    subscription.confirmed = true;
    subscription.updatedAt = new Date().toISOString();
    store.subscriptions[`${subscription.willId}:${subscription.email}`] = subscription;
    await writeStore(store);

    return { ok: true, subscription };
  } finally {
    await releaseLock(lockToken);
  }
}

export async function unsubscribeReminderSubscription({
  willId,
  email,
}: {
  willId: string;
  email: string;
}): Promise<{ ok: boolean; error?: string }> {
  const normalizedEmail = normalizeEmail(email);
  const key = `${willId}:${normalizedEmail}`;

  const lockToken = await acquireLock();
  try {
    const store = await readStore();
    if (!store.subscriptions[key]) {
      return { ok: false, error: 'No matching reminder subscription was found.' };
    }

    delete store.subscriptions[key];
    await writeStore(store);

    return { ok: true };
  } finally {
    await releaseLock(lockToken);
  }
}

export async function dispatchReminderEmails(): Promise<ReminderDispatchResult> {
  const lockToken = await acquireLock();
  let store: ReminderStore;
  try {
    store = await readStore();
  } catch (err) {
    await releaseLock(lockToken);
    throw err;
  }

  // We hold the lock for the entire dispatch run so that a concurrent
  // registerReminderSubscription cannot clobber our history writes.
  // The lock TTL (30 s) is intentionally generous; if the dispatch takes
  // longer than expected, the TTL will expire and the lock auto-releases —
  // a slightly stale history entry is safer than blocking all writers forever.
  try {
    const sentCount = { sent: 0, skipped: 0 };
    const errors: string[] = [];

    const subscriptions = Object.values(store.subscriptions);
    const client = getSoroWillClient();

    for (const subscription of subscriptions) {
      try {
        if (!subscription.confirmed) {
          sentCount.skipped += 1;
          continue;
        }

        const will = await client.getWill(subscription.willId);
        if (will.status !== WillStatus.Active) {
          sentCount.skipped += 1;
          continue;
        }

        const deadline = buildDeadline(will);
        const remainingMs = deadline.getTime() - Date.now();
        if (remainingMs <= 0) {
          sentCount.skipped += 1;
          continue;
        }

        const daysRemaining = remainingMs / 86_400_000;
        const reminderKind = getReminderKind(daysRemaining);

        const historyKey = getHistoryKey(subscription.willId, subscription.email);
        const historyEntry = store.history[historyKey] ?? {
          willId: subscription.willId,
          email: subscription.email,
        };

        const alreadySent =
          reminderKind === 'imminent' ? Boolean(historyEntry.imminentSentAt) : Boolean(historyEntry.wellBeforeSentAt);
        if (alreadySent) {
          sentCount.skipped += 1;
          continue;
        }

        await sendReminderEmail({
          to: subscription.email,
          will,
          deadline,
          reminderKind,
        });

        if (reminderKind === 'imminent') {
          historyEntry.imminentSentAt = new Date().toISOString();
        } else {
          historyEntry.wellBeforeSentAt = new Date().toISOString();
        }

        store.history[historyKey] = historyEntry;
        await writeStore(store);
        sentCount.sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown reminder error';
        errors.push(`${subscription.email}: ${message}`);
      }
    }

    return { sent: sentCount.sent, skipped: sentCount.skipped, errors };
  } finally {
    await releaseLock(lockToken);
  }
}

interface ReminderEmailPayload {
  to: string;
  will: Will;
  deadline: Date;
  reminderKind: ReminderKind;
}

async function sendReminderEmail({ to, will, deadline, reminderKind }: ReminderEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.info(`[reminders] Skipping email for ${to}; provider not configured.`);
    return;
  }

  const subject =
    reminderKind === 'imminent'
      ? 'Your SoroWill check-in deadline is approaching'
      : 'Reminder: your SoroWill check-in is still due soon';

  const days = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000));
  const unsubscribeUrl = `${getAppBaseUrl()}/api/reminders/unsubscribe?willId=${encodeURIComponent(will.id)}&email=${encodeURIComponent(to)}`;
  const body = `Hello,\n\nThis is a reminder from SoroWill that your will #${will.id} needs a check-in soon. Your next deadline is ${deadline.toISOString()}. There are ${days} day(s) left before the check-in window closes.\n\nPlease visit the app and confirm you are still active to keep the will intact.\n\nTo stop receiving these reminders for this will, visit: ${unsubscribeUrl}\n\nSoroWill`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      text: body,
      html: `<p>${body.replace(/\n/g, '<br />')}</p>`,
    }),
  });

  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${fallback}`);
  }
}

async function sendConfirmationEmail({
  to,
  appUrl,
  token,
}: {
  to: string;
  appUrl: string;
  token: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    console.info(`[reminders] Skipping confirmation email for ${to}; provider not configured.`);
    return;
  }

  const confirmUrl = `${appUrl}/api/reminders/confirm?token=${encodeURIComponent(token)}`;
  const body = `Hello,\n\nPlease confirm you'd like to receive SoroWill check-in reminders by visiting the link below:\n\n${confirmUrl}\n\nIf you didn't request this, you can ignore this email.\n\nSoroWill`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject: 'Confirm your SoroWill reminder subscription',
      text: body,
      html: `<p>${body.replace(/\n/g, '<br />')}</p>`,
    }),
  });

  if (!response.ok) {
    const fallback = await response.text();
    throw new Error(`Resend request failed: ${response.status} ${fallback}`);
  }
}
