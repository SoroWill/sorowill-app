import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { dispatchDueReminders } from '@/lib/reminders/dispatch';
import { apiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Minimum recommended length for CRON_SECRET.
 *
 * A short secret has low entropy, so even a timing-safe comparison offers
 * little protection against brute-force guessing. 32 characters of random
 * data provides ~192 bits of entropy when drawn from a 62-char alphabet.
 */
const MIN_CRON_SECRET_LENGTH = 32;

/**
 * Warn (once per invocation) when the configured secret is too short.
 * Weak secrets undermine the timing-safe comparison below.
 */
function warnIfSecretTooShort(secret: string): void {
  if (secret.length < MIN_CRON_SECRET_LENGTH) {
    console.warn(
      `[reminders/dispatch] CRON_SECRET is only ${secret.length} characters long; ` +
        `a weak secret undermines the timing-safe comparison. ` +
        `Use at least ${MIN_CRON_SECRET_LENGTH} random characters (e.g. \`openssl rand -hex 32\`).`,
    );
  }
}

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
    return apiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  warnIfSecretTooShort(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return apiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

async function handleGET(request: Request) {
  const expectedToken = process.env.CRON_SECRET;

  // Fail closed: if CRON_SECRET is not configured, reject the request rather
  // than skipping the auth check and exposing the endpoint publicly.
  if (!expectedToken) {
    return apiError(
      'INTERNAL_ERROR',
      'Server misconfigured: CRON_SECRET is not set',
      500,
    );
  }

  warnIfSecretTooShort(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return apiError('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

async function handlePOST(request: Request) {
  return handleDispatch(request);
}

export const GET = withCorrelationId(handleGET);
export const POST = withCorrelationId(handlePOST);
