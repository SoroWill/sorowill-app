/**
 * #221 — Concurrent read-modify-write safety test for the reminder store.
 *
 * Strategy:
 *  - Mock all KV REST fetch calls so the test runs without a real Redis.
 *  - Use an in-memory store object as the source of truth.
 *  - The lock (SET NX) is simulated faithfully: only one caller wins per token.
 *  - Run registerReminderSubscription and dispatchReminderEmails concurrently
 *    and verify both writes are present in the final store state — i.e., neither
 *    clobbers the other.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WillStatus } from '@sorowill/sdk';
import {
  registerReminderSubscription,
  dispatchReminderEmails,
  type ReminderStore,
} from '@/lib/reminders';

// ---------------------------------------------------------------------------
// Minimal Will fixture used by getSoroWillClient mock
// ---------------------------------------------------------------------------
const WILL_ID = 'will-concurrent-test-1';
const mockWill = {
  id: WILL_ID,
  owner: 'GOWNER',
  status: WillStatus.Active,
  lastCheckin: new Date(Date.now() - 10 * 86_400_000), // 10 days ago
  checkinPeriodDays: 60,
  beneficiaries: [],
  guardians: [],
  balance: '100',
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock @sorowill/sdk so getWill never hits the network.
vi.mock('@sorowill/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sorowill/sdk')>();
  return {
    ...actual,
    WillStatus: actual.WillStatus,
  };
});

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: vi.fn().mockResolvedValue(mockWill),
  }),
}));

// ---------------------------------------------------------------------------
// In-memory KV store simulation
// ---------------------------------------------------------------------------

/** The in-memory store blob, serialised as a JSON string (or null = not set). */
let kvStore: string | null = null;
/** The current distributed lock token, or null when free. */
let kvLock: string | null = null;

/**
 * A faithfully-simulated Upstash REST fetch shim.
 * Handles:
 *   GET  /get/<key>                     → {result: <value>|null}
 *   POST /set/<key>                     → {result:"OK"}
 *   POST /set/<lock-key>/<token>?EX=&NX  → {result:"OK"|null}  (NX = set only if missing)
 *   POST /del/<lock-key>                → {result:1}
 *   POST /pipeline                      → [{result:...}, ...]
 */
function makeKvFetch(storeKey: string, lockKey: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url).pathname;
    const searchParams = new URL(url).searchParams;
    const segments = path.split('/').filter(Boolean);
    const method = (init?.method ?? 'GET').toUpperCase();

    // POST /pipeline
    if (method === 'POST' && segments[0] === 'pipeline') {
      const commands = JSON.parse((init?.body as string) ?? '[]') as string[][];
      const results = commands.map((cmd) => {
        const verb = cmd[0]?.toUpperCase();
        const key = cmd[1];
        if (verb === 'GET') {
          return { result: key === lockKey ? kvLock : kvStore };
        }
        return { result: null };
      });
      return new Response(JSON.stringify(results), { status: 200 });
    }

    const command = segments[0];

    // GET /get/<key>
    if (command === 'get') {
      const key = decodeURIComponent(segments[1] ?? '');
      const value = key === storeKey ? kvStore : key === lockKey ? kvLock : null;
      return new Response(JSON.stringify({ result: value }), { status: 200 });
    }

    // POST /set/<key>[/<value>]
    if (command === 'set' && method === 'POST') {
      const key = decodeURIComponent(segments[1] ?? '');
      const isNX = searchParams.has('NX');

      if (key === lockKey) {
        // Distributed lock acquire path: SET <lockKey> <token> EX <ttl> NX
        const token = decodeURIComponent(segments[2] ?? '');
        if (isNX && kvLock !== null) {
          // Already locked — return null to signal failure
          return new Response(JSON.stringify({ result: null }), { status: 200 });
        }
        kvLock = token;
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }

      if (key === storeKey) {
        kvStore = (init?.body as string) ?? null;
        return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
      }

      return new Response(JSON.stringify({ result: 'OK' }), { status: 200 });
    }

    // POST /del/<key>
    if (command === 'del' && method === 'POST') {
      const key = decodeURIComponent(segments[1] ?? '');
      if (key === lockKey) kvLock = null;
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }

    return new Response(JSON.stringify({ result: null }), { status: 200 });
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('#221 concurrent register + dispatch — no writes lost', () => {
  const KV_REST_API_URL = 'https://fake-kv.upstash.io';
  const KV_REST_API_TOKEN = 'fake-token';
  const STORE_KEY = 'sorowill:reminder-store';
  const LOCK_KEY = `${STORE_KEY}:lock`;

  beforeEach(() => {
    kvStore = null;
    kvLock = null;
    process.env.KV_REST_API_URL = KV_REST_API_URL;
    process.env.KV_REST_API_TOKEN = KV_REST_API_TOKEN;
    process.env.REMINDER_STORE_KV_KEY = STORE_KEY;
    // Disable email delivery
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    // Replace global fetch with our simulator
    vi.stubGlobal('fetch', makeKvFetch(STORE_KEY, LOCK_KEY));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.REMINDER_STORE_KV_KEY;
  });

  it('concurrent register calls both persist their subscriptions', async () => {
    const [r1, r2] = await Promise.all([
      registerReminderSubscription({
        willId: WILL_ID,
        email: 'alice@example.com',
        owner: 'GOWNER',
        appUrl: 'http://localhost:3000',
      }),
      registerReminderSubscription({
        willId: WILL_ID,
        email: 'bob@example.com',
        owner: 'GOWNER',
        appUrl: 'http://localhost:3000',
      }),
    ]);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    const finalStore = JSON.parse(kvStore!) as ReminderStore;
    expect(Object.keys(finalStore.subscriptions)).toHaveLength(2);
    expect(finalStore.subscriptions[`${WILL_ID}:alice@example.com`]).toBeDefined();
    expect(finalStore.subscriptions[`${WILL_ID}:bob@example.com`]).toBeDefined();
  });

  it('concurrent register + dispatch — subscription and history both present', async () => {
    // Pre-seed one confirmed subscription so dispatch has something to process.
    const preStore: ReminderStore = {
      subscriptions: {
        [`${WILL_ID}:existing@example.com`]: {
          willId: WILL_ID,
          email: 'existing@example.com',
          owner: 'GOWNER',
          confirmed: true,
          confirmationToken: 'tok-existing',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      history: {},
    };
    kvStore = JSON.stringify(preStore);

    const [regResult, dispResult] = await Promise.all([
      registerReminderSubscription({
        willId: WILL_ID,
        email: 'newcomer@example.com',
        owner: 'GOWNER',
        appUrl: 'http://localhost:3000',
      }),
      dispatchReminderEmails(),
    ]);

    expect(regResult.ok).toBe(true);
    expect(dispResult.errors).toHaveLength(0);

    const finalStore = JSON.parse(kvStore!) as ReminderStore;

    // The newly registered subscription must not have been lost.
    expect(finalStore.subscriptions[`${WILL_ID}:newcomer@example.com`]).toBeDefined();

    // The existing subscription must still be present.
    expect(finalStore.subscriptions[`${WILL_ID}:existing@example.com`]).toBeDefined();

    // The dispatch must have recorded a history entry for the existing subscription
    // (well-before, since the will was checked in 10 days ago and the period is 60 days,
    // leaving ~50 days — well above the 14-day imminent threshold).
    expect(finalStore.history[`${WILL_ID}:existing@example.com`]).toBeDefined();
    expect(
      finalStore.history[`${WILL_ID}:existing@example.com`]?.wellBeforeSentAt,
    ).toBeTruthy();
  });

  it('two concurrent dispatch calls do not double-send (history deduplication)', async () => {
    // Pre-seed one confirmed subscription.
    const preStore: ReminderStore = {
      subscriptions: {
        [`${WILL_ID}:dedup@example.com`]: {
          willId: WILL_ID,
          email: 'dedup@example.com',
          owner: 'GOWNER',
          confirmed: true,
          confirmationToken: 'tok-dedup',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      history: {},
    };
    kvStore = JSON.stringify(preStore);

    const [d1, d2] = await Promise.all([dispatchReminderEmails(), dispatchReminderEmails()]);

    // Exactly one of them should have sent (whichever won the lock first).
    // The other must have found the history entry already written and skipped.
    const totalSent = d1.sent + d2.sent;
    const totalSkipped = d1.skipped + d2.skipped;

    expect(totalSent).toBe(1);
    // The second dispatch sees the subscription as already sent → skipped.
    expect(totalSkipped).toBeGreaterThanOrEqual(1);

    const finalStore = JSON.parse(kvStore!) as ReminderStore;
    const histEntry = finalStore.history[`${WILL_ID}:dedup@example.com`];
    expect(histEntry?.wellBeforeSentAt).toBeTruthy();
  });
});
