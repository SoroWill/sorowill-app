import { NextResponse } from 'next/server';

import { confirmReminderSubscription, escapeHtml } from '@/lib/reminders';
import { withCorrelationId } from '@/lib/correlation';

/**
 * GET /api/reminders/confirm?token=...
 *
 * Handles confirmation links sent to users via email.  Returns a
 * human-readable HTML page so users see a friendly message instead of a
 * raw JSON blob containing their email address and confirmation token. (#337)
 *
 * Status codes:
 *   200 — confirmation succeeded
 *   400 — token is missing, invalid, or already used
 */
async function handleGET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';

  const result = await confirmReminderSubscription(token);

  const message = result.ok
    ? 'Your subscription to check-in reminder emails has been confirmed. Thank you!'
    : result.error || 'The confirmation link is invalid or has already been used.';

  return new NextResponse(
    `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>${escapeHtml(message)}</p></body></html>`,
    {
      status: result.ok ? 200 : 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

export const GET = withCorrelationId(handleGET);
