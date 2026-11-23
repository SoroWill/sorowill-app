import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/reminders', () => ({
  registerReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
  confirmReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
  unsubscribeReminderSubscription: vi.fn().mockResolvedValue({ ok: true }),
}));

const getWillMock = vi.fn().mockResolvedValue({ id: '1' });

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: getWillMock,
  }),
}));

vi.mock('viem', () => ({
  verifyMessage: vi.fn().mockResolvedValue(true),
}));

import { POST as registerRoute } from '@/app/api/reminders/register/route';
import { GET as confirmRoute } from '@/app/api/reminders/confirm/route';
import { GET as unsubscribeGetRoute } from '@/app/api/reminders/unsubscribe/route';

const VALID_WILL_ID = '1';
const VALID_OWNER = '0x' + 'ab'.repeat(20);
const CSRF_TOKEN = 'a'.repeat(64);
const registerHeaders = {
  'content-type': 'application/json',
  cookie: `sorowill_csrf=${CSRF_TOKEN}`,
  'x-csrf-token': CSRF_TOKEN,
};

describe('reminder routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid registration bodies', async () => {
    const response = await registerRoute(
      new Request('http://localhost/api/reminders/register', {
        method: 'POST',
        body: '{}',
        headers: registerHeaders,
      }),
    );
    expect(response.status).toBe(400);
  });

  it('registers a valid subscription', async () => {
    const response = await registerRoute(
      new Request('http://localhost/api/reminders/register', {
        method: 'POST',
        body: JSON.stringify({
          willId: VALID_WILL_ID,
          email: 'a@example.com',
          owner: VALID_OWNER,
          signature: '0xsig',
          message: 'hello',
        }),
        headers: registerHeaders,
      }),
    );
    expect(response.status).toBe(200);
  });

  it.each([
    ['empty', ''],
    ['wrong length', 'C' + 'A'.repeat(54)],
    ['invalid characters', 'C' + '!'.repeat(55)],
  ])('rejects %s willId format', async (_label, willId) => {
    const response = await registerRoute(
      new Request('http://localhost/api/reminders/register', {
        method: 'POST',
        body: JSON.stringify({
          willId,
          email: 'a@example.com',
          owner: VALID_OWNER,
          signature: '0xsig',
          message: 'hello',
        }),
        headers: registerHeaders,
      }),
    );
    expect(response.status).toBe(400);
    expect(getWillMock).not.toHaveBeenCalled();
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
