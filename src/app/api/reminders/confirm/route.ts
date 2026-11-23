import { NextResponse } from 'next/server';

import { confirmReminderSubscription, escapeHtml } from '@/lib/reminders';
import { errorResponse, ErrorCodes } from '@/lib/errors';

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
 * Error responses use the standardized API error format (#798):
 *   { error: { code, message } }
 */
async function handleGET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';

  const result = isValidReminderToken(token)
    ? await confirmReminderSubscription(token)
    : { ok: false, error: 'The confirmation link is invalid or has already been used.' };

  if (!result.ok) {
    return errorResponse(
      ErrorCodes.INVALID_TOKEN,
      result.error || 'The confirmation link is invalid or has already been used.',
      400,
    );
  }

  const message =
    'Your subscription to check-in reminder emails has been confirmed. Thank you!';

  return new NextResponse(
    `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>${escapeHtml(message)}</p></body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

export const GET = withCorrelationId(handleGET);
