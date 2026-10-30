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
import { checkRateLimit, resetRateLimits, buildRateLimitKey } from '@/lib/rate-limit';

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
    const key1 = buildRateLimitKey(['a:b', 'c']);
    const key2 = buildRateLimitKey(['a', 'b:c']);
    expect(key1).not.toBe(key2);

    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key1, 3, 1000, now).allowed).toBe(true);
    }
    expect(checkRateLimit(key1, 3, 1000, now).allowed).toBe(false);
    expect(checkRateLimit(key2, 3, 1000, now).allowed).toBe(true);
  });

  it('validates that the separator does not appear in any key part', () => {
    expect(() => buildRateLimitKey(['a:b', 'c'], ':')).toThrow();
    expect(() => buildRateLimitKey(['a', 'b:c'], ':')).toThrow();
    expect(() => buildRateLimitKey(['a', 'b'], ':')).not.toThrow();
  });
});
