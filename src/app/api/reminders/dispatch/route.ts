import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { dispatchDueReminders } from '@/lib/reminders/dispatch';

export const dynamic = 'force-dynamic';

/**
 * Constant-time comparison of two strings.
 *
 * V8's `===`/`!==` short-circuits on the first mismatched byte, which leaks
 * how many leading characters of a guessed secret are correct. We hash both
 * sides to a fixed-length digest first so that inputs of differing lengths
 * can still be compared with `crypto.timingSafeEqual` without throwing.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

async function handleDispatch(request: Request) {
  const expectedToken = process.env.CRON_SECRET;

  // Fail closed: if CRON_SECRET is not configured, reject the request rather
  // than skipping the auth check and exposing the endpoint publicly.
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const expectedToken = process.env.CRON_SECRET;

  // Fail closed: if CRON_SECRET is not configured, reject the request rather
  // than skipping the auth check and exposing the endpoint publicly.
  if (!expectedToken) {
    return NextResponse.json(
      { sent: 0, skipped: 0, errors: ['Server misconfigured: CRON_SECRET is not set'] },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
