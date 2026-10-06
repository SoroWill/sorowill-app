// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/reminders/dispatch', () => ({
  dispatchDueReminders: vi.fn().mockResolvedValue({ sent: 1, skipped: 0, errors: [] }),
}));

import { POST } from '@/app/api/reminders/dispatch/route';

function request(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request('http://localhost/api/reminders/dispatch', { method: 'POST', headers });
}

describe('POST /api/reminders/dispatch auth (#281)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts the exact bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await POST(request('Bearer s3cret'));
    expect(res.status).toBe(200);
  });

  it.each([
    ['a wrong token of the same length', 'Bearer s3creX'],
    ['a wrong token of a different length', 'Bearer nope'],
    ['a missing Bearer prefix', 's3cret'],
    ['an empty header', ''],
  ])('rejects %s', async (_label, header) => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await POST(request(header));
    expect(res.status).toBe(401);
  });

  it('rejects when the Authorization header is absent', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await POST(request());
    expect(res.status).toBe(401);
  });

  it('fails closed when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await POST(request('Bearer '));
    expect(res.status).toBe(401);
  });
});
