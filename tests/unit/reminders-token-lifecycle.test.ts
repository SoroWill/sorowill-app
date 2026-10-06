import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WillStatus } from '@sorowill/sdk';
import {
  registerReminderSubscription,
  confirmReminderSubscription,
  unsubscribeReminderSubscription,
  buildConfirmationEmailContent,
  buildReminderEmailContent,
  escapeHtml,
  type ReminderStore,
  CONFIRMATION_TOKEN_TTL_MS,
} from '@/lib/reminders';
import { GET as unsubscribeGet, POST as unsubscribePost } from '@/app/api/reminders/unsubscribe/route';
import { GET as confirmGet } from '@/app/api/reminders/confirm/route';

const WILL_ID = '42';
const mockWill = {
  id: WILL_ID,
  owner: 'GOWNER123',
  status: WillStatus.Active,
  lastCheckin: new Date(Date.now() - 5 * 86_400_000),
  checkinPeriodDays: 30,
  beneficiaries: [],
  guardians: [],
  balance: '500',
};

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

let kvStore: string | null = null;
let kvLock: string | null = null;

function makeKvFetch(storeKey: string, lockKey: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url).pathname;
    const searchParams = new URL(url).searchParams;
    const segments = path.split('/').filter(Boolean);
    const method = (init?.method ?? 'GET').toUpperCase();

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

    if (command === 'get') {
      const key = decodeURIComponent(segments[1] ?? '');
      const value = key === storeKey ? kvStore : key === lockKey ? kvLock : null;
      return new Response(JSON.stringify({ result: value }), { status: 200 });
    }

    if (command === 'set' && method === 'POST') {
      const key = decodeURIComponent(segments[1] ?? '');
      const isNX = searchParams.has('NX');

      if (key === lockKey) {
        const token = decodeURIComponent(segments[2] ?? '');
        if (isNX && kvLock !== null) {
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

    if (command === 'del' && method === 'POST') {
      const key = decodeURIComponent(segments[1] ?? '');
      if (key === lockKey) kvLock = null;
      return new Response(JSON.stringify({ result: 1 }), { status: 200 });
    }

    if (command === 'eval' && method === 'POST') {
      const evalBody = JSON.parse((init?.body as string) ?? '{}') as {
        script?: string;
        keys?: string[];
        arguments?: string[];
      };
      const key = evalBody.keys?.[0];
      const token = evalBody.arguments?.[0];
      // Compare and delete: if kvLock === token, delete it
      if (key === lockKey && kvLock === token) {
        kvLock = null;
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: 0 }), { status: 200 });
    }

    if (command === 'expire' && method === 'POST') {
      // Lock renewal: if lock exists, keep it
      const key = decodeURIComponent(segments[1] ?? '');
      if (key === lockKey && kvLock !== null) {
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: 0 }), { status: 200 });
    }

    return new Response(JSON.stringify({ result: null }), { status: 200 });
  };
}

describe('Reminder Token Lifecycle & Security', () => {
  const STORE_KEY = 'sorowill:test:tokens';
  const LOCK_KEY = `${STORE_KEY}:lock`;
  const originalFetch = global.fetch;

  beforeEach(() => {
    kvStore = JSON.stringify({ subscriptions: {}, history: {} });
    kvLock = null;
    process.env.KV_REST_API_URL = 'https://fake-kv.upstash.io';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    process.env.REMINDER_STORE_KV_KEY = STORE_KEY;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.sorowill.org';

    global.fetch = vi.fn().mockImplementation(makeKvFetch(STORE_KEY, LOCK_KEY));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    delete process.env.REMINDER_STORE_KV_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe('Issue #332: Confirmation token expiry and one-time use', () => {
    it('generates a confirmation token with a 24-hour expiration window', async () => {
      const result = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'alice@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      expect(result.ok).toBe(true);
      expect(result.subscription).toBeDefined();
      expect(result.subscription?.confirmationToken).toBeTruthy();
      expect(result.subscription?.confirmationExpiresAt).toBeTruthy();

      const expiresAt = new Date(result.subscription!.confirmationExpiresAt!).getTime();
      const expectedMin = Date.now() + CONFIRMATION_TOKEN_TTL_MS - 5000;
      expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    });

    it('successfully confirms a subscription with a valid token and clears the token', async () => {
      const reg = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'alice@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      const token = reg.subscription!.confirmationToken!;
      const confirmRes = await confirmReminderSubscription(token);

      expect(confirmRes.ok).toBe(true);
      expect(confirmRes.subscription?.confirmed).toBe(true);
      expect(confirmRes.subscription?.confirmationToken).toBeNull();
      expect(confirmRes.subscription?.confirmationExpiresAt).toBeNull();

      const store = JSON.parse(kvStore!) as ReminderStore;
      const saved = store.subscriptions[`${WILL_ID}:alice@example.com`];
      expect(saved.confirmed).toBe(true);
      expect(saved.confirmationToken).toBeNull();
    });

    it('rejects confirmation token reuse after it has been used', async () => {
      const reg = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'alice@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      const token = reg.subscription!.confirmationToken!;

      // First confirmation succeeds
      const first = await confirmReminderSubscription(token);
      expect(first.ok).toBe(true);

      // Replay attempt fails with invalid or expired message
      const replay = await confirmReminderSubscription(token);
      expect(replay.ok).toBe(false);
      expect(replay.error).toBe('Invalid or expired confirmation token.');
    });

    it('rejects expired confirmation tokens', async () => {
      const expiredDate = new Date(Date.now() - 1000).toISOString();
      const preStore: ReminderStore = {
        subscriptions: {
          [`${WILL_ID}:bob@example.com`]: {
            willId: WILL_ID,
            email: 'bob@example.com',
            owner: 'GOWNER123',
            confirmed: false,
            confirmationToken: 'expired-token-123',
            confirmationExpiresAt: expiredDate,
            unsubscribeToken: 'unsub-token-bob',
            createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
          },
        },
        history: {},
      };
      kvStore = JSON.stringify(preStore);

      const res = await confirmReminderSubscription('expired-token-123');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Invalid or expired confirmation token.');

      // Subscription remains unconfirmed
      const store = JSON.parse(kvStore!) as ReminderStore;
      expect(store.subscriptions[`${WILL_ID}:bob@example.com`].confirmed).toBe(false);
    });

    it('confirm GET route returns 400 for invalid/expired tokens and 200 for valid token', async () => {
      const reg = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'carol@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });
      const token = reg.subscription!.confirmationToken!;

      // Valid token GET
      const okReq = new Request(`https://app.sorowill.org/api/reminders/confirm?token=${token}`);
      const okResp = await confirmGet(okReq);
      expect(okResp.status).toBe(200);

      // Replayed token GET
      const replayReq = new Request(`https://app.sorowill.org/api/reminders/confirm?token=${token}`);
      const replayResp = await confirmGet(replayReq);
      expect(replayResp.status).toBe(400);

      // Non-existent token GET
      const badReq = new Request(`https://app.sorowill.org/api/reminders/confirm?token=random-fake`);
      const badResp = await confirmGet(badReq);
      expect(badResp.status).toBe(400);
    });
  });

  describe('Issue #330: Unguessable unsubscribe tokens and rejection of willId+email only', () => {
    it('creates an unguessable unsubscribe token upon registration', async () => {
      const reg = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'dave@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      expect(reg.subscription?.unsubscribeToken).toBeTruthy();
      expect(reg.subscription?.unsubscribeToken?.length).toBeGreaterThan(10);
    });

    it('rejects unsubscribe requests providing only willId and email (no token)', async () => {
      await registerReminderSubscription({
        willId: WILL_ID,
        email: 'dave@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      // Calling function directly without token
      const res = await unsubscribeReminderSubscription({
        willId: WILL_ID,
        email: 'dave@example.com',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/token is required/i);

      // Subscription must remain untouched in store
      const store = JSON.parse(kvStore!) as ReminderStore;
      expect(store.subscriptions[`${WILL_ID}:dave@example.com`]).toBeDefined();

      // Calling GET /api/reminders/unsubscribe with only willId and email
      const req = new Request(
        `https://app.sorowill.org/api/reminders/unsubscribe?willId=${WILL_ID}&email=dave@example.com`,
      );
      const resp = await unsubscribeGet(req);
      expect(resp.status).toBe(400);
      const html = await resp.text();
      expect(html).toContain('A valid unsubscribe token is required.');

      // Subscription still untouched
      const storeAfter = JSON.parse(kvStore!) as ReminderStore;
      expect(storeAfter.subscriptions[`${WILL_ID}:dave@example.com`]).toBeDefined();
    });

    it('rejects unsubscribe with wrong or mismatched token', async () => {
      await registerReminderSubscription({
        willId: WILL_ID,
        email: 'dave@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });

      const res = await unsubscribeReminderSubscription({
        token: 'wrong-token-1234',
        willId: WILL_ID,
        email: 'dave@example.com',
      });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Invalid or expired unsubscribe token.');

      const store = JSON.parse(kvStore!) as ReminderStore;
      expect(store.subscriptions[`${WILL_ID}:dave@example.com`]).toBeDefined();
    });

    it('successfully unsubscribes with valid unguessable token via GET and POST', async () => {
      const reg = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'eve@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });
      const unsubToken = reg.subscription!.unsubscribeToken!;

      // GET with valid token
      const reqGet = new Request(`https://app.sorowill.org/api/reminders/unsubscribe?token=${unsubToken}`);
      const respGet = await unsubscribeGet(reqGet);
      expect(respGet.status).toBe(200);

      const store = JSON.parse(kvStore!) as ReminderStore;
      expect(store.subscriptions[`${WILL_ID}:eve@example.com`]).toBeUndefined();

      // Register another subscription to test POST
      const reg2 = await registerReminderSubscription({
        willId: WILL_ID,
        email: 'frank@example.com',
        owner: 'GOWNER123',
        appUrl: 'https://app.sorowill.org',
      });
      const unsubToken2 = reg2.subscription!.unsubscribeToken!;

      const reqPost = new Request('https://app.sorowill.org/api/reminders/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: unsubToken2 }),
      });
      const respPost = await unsubscribePost(reqPost);
      expect(respPost.status).toBe(200);

      const store2 = JSON.parse(kvStore!) as ReminderStore;
      expect(store2.subscriptions[`${WILL_ID}:frank@example.com`]).toBeUndefined();
    });
  });

  describe('Issue #335: HTML body clickable links and dynamic value escaping', () => {
    it('escapes HTML special characters correctly', () => {
      expect(escapeHtml('Hello & "World" <test>\'s')).toBe('Hello &amp; &quot;World&quot; &lt;test&gt;&#39;s');
    });

    it('buildConfirmationEmailContent wraps confirmUrl in anchor and escapes values', () => {
      const token = 'tok-123-abc';
      const appUrl = 'https://app.sorowill.org?ref=email&channel=web';
      const { text, html, confirmUrl } = buildConfirmationEmailContent({ appUrl, token });

      // Plain-text contains raw URL and no HTML tags
      expect(text).toContain(confirmUrl);
      expect(text).not.toContain('<a href=');

      // HTML contains clickable anchor with escaped URL in href and label
      const escapedConfirmUrl = escapeHtml(confirmUrl);
      expect(html).toContain(`<a href="${escapedConfirmUrl}">${escapedConfirmUrl}</a>`);
      expect(html).toContain('&amp;channel=web');
    });

    it('buildReminderEmailContent wraps unsubscribeUrl in anchor and escapes dynamic will ID and dates', () => {
      const willId = '99<script>';
      const deadline = new Date('2026-10-15T12:00:00.000Z');
      const unsubscribeToken = 'unsub-tok-xyz-456';

      const { text, html, unsubscribeUrl } = buildReminderEmailContent({
        appUrl: 'https://app.sorowill.org?mode=auto&lang=en',
        willId,
        deadline,
        reminderKind: 'well-before',
        unsubscribeToken,
      });

      // Plain-text contains raw unescaped values
      expect(text).toContain(`will #${willId}`);
      expect(text).toContain(unsubscribeUrl);
      expect(text).not.toContain('<a href=');

      // HTML body contains properly escaped dynamic values
      expect(html).not.toContain('<script>');
      expect(html).toContain('99&lt;script&gt;');
      expect(html).toContain('2026-10-15T12:00:00.000Z');

      // HTML body wraps unsubscribe URL in an attribute-escaped anchor
      const escapedUnsubscribeUrl = escapeHtml(unsubscribeUrl);
      expect(html).toContain(`<a href="${escapedUnsubscribeUrl}">${escapedUnsubscribeUrl}</a>`);
      expect(html).toContain('&amp;lang=en');
    });
  });
});
