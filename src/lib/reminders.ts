import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

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

const DEFAULT_STORE_FILE = path.join(process.cwd(), '.reminder-store.json');

function getStoreFilePath(): string {
  return process.env.REMINDER_STORE_FILE || DEFAULT_STORE_FILE;
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

async function readStore(): Promise<ReminderStore> {
  const storePath = getStoreFilePath();
  try {
    const raw = await fs.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ReminderStore>;
    return {
      subscriptions: parsed.subscriptions ?? {},
      history: parsed.history ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { subscriptions: {}, history: {} };
    }
    throw error;
  }
}

async function writeStore(store: ReminderStore): Promise<void> {
  const storePath = getStoreFilePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
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

  const store = await readStore();
  const subscription: ReminderSubscription = {
    willId,
    email: normalizedEmail,
    owner,
    confirmed: false,
    confirmationToken: randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.subscriptions[`${willId}:${normalizedEmail}`] = subscription;
  await writeStore(store);

  await sendConfirmationEmail({ to: subscription.email, appUrl, token: subscription.confirmationToken });

  return { ok: true, subscription };
}

export async function confirmReminderSubscription(token: string): Promise<ReminderRegistrationResult> {
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
}

export async function dispatchReminderEmails(): Promise<ReminderDispatchResult> {
  const store = await readStore();
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
  const body = `Hello,\n\nThis is a reminder from SoroWill that your will #${will.id} needs a check-in soon. Your next deadline is ${deadline.toISOString()}. There are ${days} day(s) left before the check-in window closes.\n\nPlease visit the app and confirm you are still active to keep the will intact.\n\nSoroWill`;

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
