import assert from 'node:assert/strict';

import { POST as dispatchHandler } from '@/app/api/reminders/dispatch/route';

async function testMissingSecretFailsClosed() {
  delete process.env.CRON_SECRET;

  const response = await dispatchHandler(new Request('http://localhost/api/reminders/dispatch', { method: 'POST' }));
  assert.equal(response.status, 401, 'expected dispatch to reject requests when CRON_SECRET is unset');
}

async function testWrongTokenIsUnauthorized() {
  process.env.CRON_SECRET = 'expected-secret';

  const response = await dispatchHandler(
    new Request('http://localhost/api/reminders/dispatch', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    }),
  );
  assert.equal(response.status, 401, 'expected dispatch to reject requests with a mismatched token');

  delete process.env.CRON_SECRET;
}

async function main() {
  await testMissingSecretFailsClosed();
  await testWrongTokenIsUnauthorized();
  console.log('reminders.test.ts: all tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
