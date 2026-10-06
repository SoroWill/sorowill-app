import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { registerReminderSubscription } from '@/lib/reminders';
import { getSoroWillClient } from '@/lib/sorowill';

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

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
    const appUrl = new URL(request.url).origin;

    if (!willId || !email || !owner || !signature || !message) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields' },
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
