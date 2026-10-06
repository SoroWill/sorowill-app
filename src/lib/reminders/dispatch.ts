export async function dispatchReminder(willId: string): Promise<void> {
  // Stub implementation for reminder dispatch
  console.log(`Dispatching reminder for will ${willId}`);
}

export async function dispatchReminderBatch(willIds: string[]): Promise<void> {
  // Stub implementation for batch reminder dispatch
  for (const willId of willIds) {
    await dispatchReminder(willId);
  }
}
