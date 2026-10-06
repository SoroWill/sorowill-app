import type { ReminderStore, ReminderDispatchResult } from '@/lib/reminders';
import { getReminderKind, acquireLock, releaseLock } from '@/lib/reminders';
import { nextCheckinDeadline } from '@/lib/deadlines';
import { getSoroWillClient } from '@/lib/sorowill';

const BATCH_SIZE = 10;

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
      for (const [subKey, subscription] of batch) {
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
