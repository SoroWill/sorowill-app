import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/reminders/dispatch', () => ({
  dispatchDueReminders: vi.fn().mockResolvedValue({ sent: 0, skipped: 0, errors: [] }),
}));

import { GET } from './route';
import { dispatchDueReminders } from '@/lib/reminders/dispatch';

const mockDispatchDueReminders = vi.mocked(dispatchDueReminders);

describe('GET /api/reminders/dispatch', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mockDispatchDueReminders.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it('rejects the request when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;

    const request = new Request('http://localhost/api/reminders/dispatch', {
      method: 'GET',
    });

    const response = await GET(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mockDispatchDueReminders).not.toHaveBeenCalled();
  });

  it('rejects the request when the bearer token does not match', async () => {
    process.env.CRON_SECRET = 'super-secret';

    const request = new Request('http://localhost/api/reminders/dispatch', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-token' },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mockDispatchDueReminders).not.toHaveBeenCalled();
  });

  it('dispatches reminder emails when the bearer token matches', async () => {
    process.env.CRON_SECRET = 'super-secret';
    mockDispatchDueReminders.mockResolvedValue({ sent: 0, skipped: 0, errors: [] });

    const request = new Request('http://localhost/api/reminders/dispatch', {
      method: 'GET',
      headers: { authorization: 'Bearer super-secret' },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockDispatchDueReminders).toHaveBeenCalledTimes(1);
  });
});
