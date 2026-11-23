/**
 * Tests for issue #399:
 * POST /api/reminders/register must rate-limit per client IP and send Retry-After.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/reminders', () => ({
  registerReminderSubscription: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({ getWill: vi.fn(async () => ({ id: 'w1' })) }),
}));
vi.mock('viem', () => ({ verifyMessage: vi.fn(async () => true) }));

import { POST } from '@/app/api/reminders/register/route';
import {
  checkRateLimit,
  resetRateLimits,
  buildRateLimitKey,
  parseRetryAfter,
  formatRetryAfterMessage,
} from '@/lib/rate-limit';
import { registerReminderSubscription } from '@/lib/reminders';

const VALID_WILL_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

function makeRequest(ip: string, email = 'a@example.com'): Request {
  return new Request('https://app.example.com/api/reminders/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    body: JSON.stringify({
      willId: VALID_WILL_ID,
      email,
      owner: '0xabc',
      signature: '0xsig',
      message: 'm',
    }),
  });
}

beforeEach(() => {
  resetRateLimits();
});

describe('#399 — IP rate limiting on reminder registration', () => {
  it('blocks bulk registrations from the same IP after 10 per hour with Retry-After', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest('203.0.113.7', `user${i}@example.com`));
      expect(res.status).toBe(200);
    }

    const blocked = await POST(makeRequest('203.0.113.7', 'user11@example.com'));
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it('includes a parseable Retry-After header on the 429 response', async () => {
    for (let i = 0; i < 10; i++) {
      await POST(makeRequest('203.0.113.7', `user${i}@example.com`));
    }

    const blocked = await POST(makeRequest('203.0.113.7', 'user11@example.com'));
    expect(blocked.status).toBe(429);

    const header = blocked.headers.get('Retry-After');
    expect(header).not.toBeNull();
    const parsed = parseRetryAfter(header, Date.now());
    expect(parsed).not.toBeNull();
    expect(parsed).toBeGreaterThan(0);
    expect(parsed).toBeLessThanOrEqual(3600);
  });

  it('does not affect requests from a different IP', async () => {
    for (let i = 0; i < 11; i++) await POST(makeRequest('203.0.113.7'));
    const res = await POST(makeRequest('198.51.100.2'));
    expect(res.status).toBe(200);
  });

  it('resets the window after it expires', () => {
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(checkRateLimit('k', 10, 1000, now).allowed).toBe(true);
    expect(checkRateLimit('k', 10, 1000, now).allowed).toBe(false);
    expect(checkRateLimit('k', 10, 1000, now + 1000).allowed).toBe(true);
  });
});

describe('#680 — rate-limit key construction avoids collisions', () => {
  it('gives distinct windows to IPv6 addresses that contain colons', () => {
    const now = 1_000_000;
    const ipA = '2001:db8::1';
    const ipB = '2001:db8::2';

    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(`reminders:register:${ipA}`, 5, 1000, now).allowed).toBe(true);
    }
    // ipA is now exhausted...
    expect(checkRateLimit(`reminders:register:${ipA}`, 5, 1000, now).allowed).toBe(false);
    // ...but ipB must still have its own independent window.
    expect(checkRateLimit(`reminders:register:${ipB}`, 5, 1000, now).allowed).toBe(true);
  });

  it('does not collide when parts contain the separator character', () => {
    const now = 1_000_000;
    // Naive concatenation with ':' would make these two keys identical:
    //   'a:b' + ':' + 'c'  ===  'a' + ':' + 'b:c'
    const key1 = buildRateLimitKey('a:b', 'c');
    const key2 = buildRateLimitKey('a', 'b:c');
    expect(key1).not.toBe(key2);

    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key1, 3, 1000, now).allowed).toBe(true);
    }
    expect(checkRateLimit(key1, 3, 1000, now).allowed).toBe(false);
    expect(checkRateLimit(key2, 3, 1000, now).allowed).toBe(true);
  });

  it('validates that the separator does not appear in any key part', () => {
    expect(() => buildRateLimitKey('a:b', 'c')).toThrow();
    expect(() => buildRateLimitKey('a', 'b:c')).toThrow();
    expect(() => buildRateLimitKey('a', 'b')).not.toThrow();
  });
});

describe('#793 — parseRetryAfter', () => {
  const now = Date.UTC(2024, 0, 1, 0, 0, 0);

  it('parses numeric seconds', () => {
    expect(parseRetryAfter('120', now)).toBe(120);
    expect(parseRetryAfter('0', now)).toBe(0);
    expect(parseRetryAfter(' 45 ', now)).toBe(45);
  });

  it('parses HTTP-date values into seconds from now', () => {
    const future = new Date(now + 90_000).toUTCString();
    expect(parseRetryAfter(future, now)).toBe(90);
  });

  it('clamps past HTTP-dates to zero', () => {
    const past = new Date(now - 90_000).toUTCString();
    expect(parseRetryAfter(past, now)).toBe(0);
  });

  it('returns null for missing headers', () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter('', now)).toBeNull();
  });

  it('returns null for invalid headers', () => {
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter('-5', now)).toBeNull();
    expect(parseRetryAfter('not-a-date', now)).toBeNull();
  });
});

describe('#793 — formatRetryAfterMessage', () => {
  it('formats a countdown message in seconds', () => {
    expect(formatRetryAfterMessage(45)).toMatch(/45/);
    expect(formatRetryAfterMessage(45)).toMatch(/retry/i);
  });

  it('formats a countdown message in minutes and seconds', () => {
    const msg = formatRetryAfterMessage(125);
    expect(msg).toMatch(/2/);
    expect(msg).toMatch(/5/);
  });

  it('handles zero gracefully', () => {
    expect(formatRetryAfterMessage(0)).toMatch(/retry/i);
  });
});

describe('#793 — reminders auto-retry after rate limit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(registerReminderSubscription).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules a retry after the Retry-After wait and succeeds', async () => {
    const { registerWithRetry } = await import('@/lib/reminders');
    const payload = {
      willId: VALID_WILL_ID,
      email: 'a@example.com',
      owner: '0xabc',
      signature: '0xsig',
      message: 'm',
    };

    const rateLimited = vi.fn(async () => ({
      ok: false as const,
      status: 429,
      retryAfter: 30,
    }));
    const success = vi.fn(async () => ({ ok: true as const }));
    vi.mocked(registerReminderSubscription)
      .mockImplementationOnce(rateLimited as never)
      .mockImplementationOnce(success as never);

    const promise = registerWithRetry(payload, { maxRetries: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;

    expect(rateLimited).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it('does not retry when the error is not a rate limit', async () => {
    const { registerWithRetry } = await import('@/lib/reminders');
    const payload = {
      willId: VALID_WILL_ID,
      email: 'a@example.com',
      owner: '0xabc',
      signature: '0xsig',
      message: 'm',
    };

    const failure = vi.fn(async () => ({
      ok: false as const,
      status: 400,
      error: 'bad request',
    }));
    vi.mocked(registerReminderSubscription).mockImplementationOnce(failure as never);

    const result = await registerWithRetry(payload, { maxRetries: 1 });
    expect(failure).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false });
  });
});
