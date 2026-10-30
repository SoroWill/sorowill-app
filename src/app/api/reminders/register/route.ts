import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { isValidContractAddress } from '@/lib/willId';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { registerReminderSubscription } from '@/lib/reminders';
import { getSoroWillClient } from '@/lib/sorowill';

// Per-IP budget for reminder registration. See `src/lib/rate-limit.ts` for the
// algorithm and its limits.
//
// Threat model: this endpoint is unauthenticated until the signature check
// below, and each accepted request writes a subscription and can trigger an
// outbound email. Without a cap an attacker can:
//   - flood it with junk payloads to burn CPU on `verifyMessage` and RPC
//     quota on the `getWill` lookup (both run before we reject the request);
//   - use it as an email cannon, registering many victim addresses against a
//     will they own so the reminder service mails people who never opted in;
//   - enumerate will IDs by watching for 404 vs. 401 responses.
//
// Why 10 per hour: a legitimate owner registers a reminder once per will,
// and might retry a few times after a typo or wallet-signature rejection.
// 10 leaves plenty of headroom for that (and for several people behind one
// NAT/office IP) while capping an attacker at ~240 attempts/day per IP —
// too slow to enumerate IDs or spam meaningfully. A one-hour window matches
// how rarely the action is needed: a blocked user waits at most an hour, which
// is acceptable for a set-and-forget setting.
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  if (email.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

export async function POST(request: Request) {
  const rate = checkRateLimit(`reminders:register:${getClientIp(request)}`, IP_LIMIT, IP_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }
  const unsupported = rejectUnsupportedContentType(request);
  if (unsupported) return unsupported;

  try {
    const body = await request.json();
    const willId = typeof body?.willId === 'string' ? body.willId : '';
    const email = typeof body?.email === 'string' ? body.email : '';
    const owner = typeof body?.owner === 'string' ? body.owner : '';
    const signature = typeof body?.signature === 'string' ? body.signature : '';
    const message = typeof body?.message === 'string' ? body.message : '';

    if (!willId || !email || !owner || !signature || !message) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid email format' },
        { status: 400 },
      );
    }

    // Verify the caller controls the connected wallet that owns this will.
    let authorized = false;
    try {
      authorized = await verifyMessage({
        address: owner as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch {
      authorized = false;
    }

    if (!authorized) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // Verify the will actually exists on-chain before storing a subscription.
    try {
      const will = await getSoroWillClient().getWill(willId);
      if (!will) {
        return NextResponse.json(
          { ok: false, error: 'Will not found' },
          { status: 404 },
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Will not found' },
        { status: 404 },
      );
    }

    const result = await registerReminderSubscription({ willId, email, owner });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not register reminder';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
