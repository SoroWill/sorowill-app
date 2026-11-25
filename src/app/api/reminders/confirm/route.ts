import { NextResponse } from 'next/server';

import { confirmReminderSubscription } from '@/lib/reminders';
import { escapeHtml } from '@/lib/html';
import { withCorrelationId } from '@/lib/correlation';

/**
 * @openapi GET
 * {
 *   "summary": "Confirm a reminder subscription",
 *   "description": "Opened from the link in the confirmation email. Answers with a small HTML page rather than JSON. A token is valid for 24 hours and works once.",
 *   "tags": [
 *     "Reminders"
 *   ],
 *   "parameters": [
 *     {
 *       "name": "token",
 *       "in": "query",
 *       "required": true,
 *       "schema": {
 *         "type": "string"
 *       },
 *       "description": "The token from the email link."
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The subscription is confirmed.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>Your subscription to check-in reminder emails has been confirmed. Thank you!</p>"
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The token is missing, invalid, expired or already used.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>The confirmation link is invalid or has already been used.</p>"
 *         }
 *       }
 *     }
 *   }
 * }
 */

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
 *
 * Both success and failure render an HTML page: the link is opened in a
 * browser, so a JSON envelope would show raw internals to the user (#337).
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
