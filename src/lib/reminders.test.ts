import { afterEach, describe, expect, it } from 'vitest';

import { POST as dispatchHandler } from '@/app/api/reminders/dispatch/route';

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = originalSecret;
  }
});

describe('reminders dispatch route auth', () => {
  it('fails closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;

    const response = await dispatchHandler(
      new Request('http://localhost/api/reminders/dispatch', { method: 'POST' }),
    );
    expect(response.status).toBe(401);
  });

  it('rejects a mismatched bearer token', async () => {
    process.env.CRON_SECRET = 'expected-secret';

    const response = await dispatchHandler(
      new Request('http://localhost/api/reminders/dispatch', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(response.status).toBe(401);
  });
});
