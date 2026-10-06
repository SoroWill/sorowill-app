import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/reminders', () => ({
  registerReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
  confirmReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
  unsubscribeReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: vi.fn().mockResolvedValue({ id: '1' }),
  }),
}));

vi.mock('viem', () => ({
  verifyMessage: vi.fn().mockResolvedValue(true),
}));

import { POST as registerRoute } from '@/app/api/reminders/register/route';
import { GET as confirmRoute } from '@/app/api/reminders/confirm/route';
import { GET as unsubscribeGetRoute } from '@/app/api/reminders/unsubscribe/route';

describe('reminder routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid registration bodies', async () => {
    const response = await registerRoute(
      new Request('http://localhost/api/reminders/register', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(400);
  });

  it('registers a valid subscription', async () => {
    const response = await registerRoute(
      new Request('http://localhost/api/reminders/register', {
        method: 'POST',
        body: JSON.stringify({
          willId: '1',
          email: 'a@example.com',
          owner: '0xabc',
          signature: '0xsig',
          message: 'hello',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(response.status).toBe(200);
  });

  it('confirms and unsubscribes valid tokens', async () => {
    const confirmRes = await confirmRoute(
      new Request('http://localhost/api/reminders/confirm?token=ok'),
    );
    expect(confirmRes.status).toBe(200);

    const unsubscribeRes = await unsubscribeGetRoute(
      new Request('http://localhost/api/reminders/unsubscribe?token=ok'),
    );
    expect(unsubscribeRes.status).toBe(200);
  });
});
