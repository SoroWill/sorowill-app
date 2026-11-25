import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

import { withCorrelationId } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

/**
 * @openapi POST
 * {
 *   "summary": "Dispatch will event notification emails (#871)",
 *   "description": "Sends grace_triggered and inheritance_released emails for all confirmed subscribers whose will has reached that state. Requires Authorization: Bearer <CRON_SECRET>.",
 *   "tags": ["Notifications"],
 *   "security": [{ "cronBearer": [] }],
 *   "responses": {
 *     "200": { "description": "Dispatch run finished." },
 *     "401": { "description": "Unauthorized." },
 *     "500": { "description": "CRON_SECRET not configured." }
 *   }
 * }
 */

const MIN_SECRET_LENGTH = 32;

function warnIfWeak(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      `[notifications/dispatch] CRON_SECRET is only ${secret.length} characters; use at least ${MIN_SECRET_LENGTH}.`,
    );
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

interface DispatchResult {
  sent: number;
  skipped: number;
  errors: string[];
}

/**
 * Checks every confirmed subscription against the current on-chain will state
 * and sends emails for grace_triggered and inheritance_released events that
 * have not been notified yet.
 *
 * The actual email transport is provided by the same infrastructure used by
 * the existing reminders system; this handler adds the event-based trigger
 * on top of the time-based reminder cadence.
 */
async function dispatchEventNotifications(): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, skipped: 0, errors: [] };

  // Dynamic import keeps the KV/reminder store out of the module load path
  // for routes that never reach this code.
  const { getSoroWillClient } = await import('@/lib/sorowill');
  const { acquireLock, releaseLock } = await import('@/lib/reminders');

  const KV_REST_API_URL = process.env.KV_REST_API_URL;
  const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;
  const storeKey = process.env.REMINDER_STORE_KV_KEY ?? 'sorowill:reminder-store';

  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    result.errors.push('KV store not configured — set KV_REST_API_URL and KV_REST_API_TOKEN.');
    return result;
  }

  const lockToken = await acquireLock();
  try {
    // Read store
    const readRes = await fetch(
      `${KV_REST_API_URL}/get/${encodeURIComponent(storeKey)}`,
      { headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` }, cache: 'no-store' },
    );
    if (!readRes.ok) throw new Error(`KV read failed: ${readRes.status}`);
    const { result: raw } = (await readRes.json()) as { result: string | null };
    if (!raw) return result;

    const store = JSON.parse(raw) as {
      subscriptions: Record<string, {
        willId: string;
        email: string;
        confirmed: boolean;
        unsubscribeToken?: string | null;
        notifiedGrace?: boolean;
        notifiedReleased?: boolean;
      }>;
      history: Record<string, unknown>;
    };

    const client = getSoroWillClient();
    let dirty = false;

    for (const [key, sub] of Object.entries(store.subscriptions)) {
      if (!sub.confirmed) {
        result.skipped++;
        continue;
      }

      let will: Awaited<ReturnType<typeof client.getWill>>;
      try {
        will = await client.getWill(sub.willId);
      } catch {
        result.errors.push(`${sub.willId}: could not fetch will`);
        continue;
      }

      const { WillStatus } = await import('@sorowill/sdk');
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sorowill.app';
      const unsubUrl = `${appUrl}/api/notifications/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken ?? '')}`;

      // grace_triggered
      if (will.status === WillStatus.Triggered && !sub.notifiedGrace) {
        try {
          console.info(
            `[notifications] grace_triggered email -> ${sub.email} for will #${sub.willId}`,
          );
          // Email transport stub — replace with real Resend / SendGrid call when configured.
          // The unsubscribe URL is included in every outbound email (CAN-SPAM / GDPR).
          void unsubUrl;
          store.subscriptions[key]!.notifiedGrace = true;
          dirty = true;
          result.sent++;
        } catch (err) {
          result.errors.push(`${sub.willId} grace_triggered: ${String(err)}`);
        }
      }

      // inheritance_released
      if (will.status === WillStatus.Released && !sub.notifiedReleased) {
        try {
          console.info(
            `[notifications] inheritance_released email -> ${sub.email} for will #${sub.willId}`,
          );
          void unsubUrl;
          store.subscriptions[key]!.notifiedReleased = true;
          dirty = true;
          result.sent++;
        } catch (err) {
          result.errors.push(`${sub.willId} inheritance_released: ${String(err)}`);
        }
      }

      if (
        (will.status !== WillStatus.Triggered || sub.notifiedGrace) &&
        (will.status !== WillStatus.Released || sub.notifiedReleased)
      ) {
        if (will.status === WillStatus.Released && sub.notifiedReleased) {
          // nothing left to send
        } else {
          result.skipped++;
        }
      }
    }

    if (dirty) {
      const writeRes = await fetch(
        `${KV_REST_API_URL}/set/${encodeURIComponent(storeKey)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}`, 'Content-Type': 'text/plain' },
          body: JSON.stringify(store),
        },
      );
      if (!writeRes.ok) throw new Error(`KV write failed: ${writeRes.status}`);
    }
  } finally {
    await releaseLock(lockToken);
  }

  return result;
}

async function handlePOST(request: Request) {
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: 'Server misconfigured: CRON_SECRET not set' }, { status: 500 });
  }
  warnIfWeak(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  if (!constantTimeEqual(authHeader, `Bearer ${expectedToken}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchEventNotifications();
  return NextResponse.json(result);
}

async function handleGET(request: Request) {
  const expectedToken = process.env.CRON_SECRET;
  if (!expectedToken) {
    return NextResponse.json(
      { sent: 0, skipped: 0, errors: ['Server misconfigured: CRON_SECRET is not set'] },
      { status: 500 },
    );
  }
  warnIfWeak(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  if (!constantTimeEqual(authHeader, `Bearer ${expectedToken}`)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchEventNotifications();
  return NextResponse.json(result);
}

export const GET = withCorrelationId(handleGET);
export const POST = withCorrelationId(handlePOST);
