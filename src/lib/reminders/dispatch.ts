import type { ReminderStore, ReminderDispatchResult } from '@/lib/reminders';

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

export async function dispatchReminderEmails(
  store: ReminderStore,
): Promise<ReminderDispatchResult> {
  const result: ReminderDispatchResult = {
    sent: 0,
    skipped: 0,
    errors: [],
  };

  for (const [, subscription] of Object.entries(store.subscriptions)) {
    if (!subscription.confirmed) {
      result.skipped++;
      continue;
    }

    try {
      await dispatchReminder(subscription.willId);
      result.sent++;
    } catch (err) {
      result.errors.push(`${subscription.willId}: ${String(err)}`);
    }
  }

  return result;
}
