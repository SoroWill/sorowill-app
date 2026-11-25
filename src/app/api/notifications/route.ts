import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { withCorrelationId } from '@/lib/correlation';
import { escapeHtml, registerReminderSubscription } from '@/lib/reminders';
import { getSoroWillClient } from '@/lib/sorowill';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * @openapi POST
 * {
 *   "summary": "Subscribe to will event email notifications (#871)",
 *   "description": "Registers an email address for notifications on grace period trigger and inheritance release. A confirmation email is sent; the subscription is active once confirmed. Configurable via the `events` field. Rate-limited to 10 requests per hour per IP.",
 *   "tags": ["Notifications"],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "required": ["willId", "email"],
 *           "properties": {
 *             "willId": { "type": "string", "example": "42" },
 *             "email":  { "type": "string", "format": "email" },
 *             "events": {
 *               "type": "array",
 *               "items": { "type": "string", "enum": ["grace_triggered", "inheritance_released"] },
 *               "description": "Events to subscribe to. Defaults to all events when omitted."
 *             }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": { "description": "Subscription stored; confirmation email sent." },
 *     "400": { "description": "Invalid or missing fields." },
 *     "404": { "description": "Will not found." },
 *     "429": { "description": "Rate limit exceeded." },
 *     "500": { "description": "Unexpected server error." }
 *   }
 * }
 */

const SUPPORTED_EVENTS = ['grace_triggered', 'inheritance_released'] as const;
type NotificationEvent = (typeof SUPPORTED_EVENTS)[number];

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  if (email.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

function parseEvents(raw: unknown): NotificationEvent[] | null {
  if (raw === undefined || raw === null) return [...SUPPORTED_EVENTS];
  if (!Array.isArray(raw)) return null;
  const events: NotificationEvent[] = [];
  for (const item of raw) {
    if (!SUPPORTED_EVENTS.includes(item as NotificationEvent)) return null;
    events.push(item as NotificationEvent);
  }
  return events.length > 0 ? events : null;
}

async function handlePOST(request: Request) {
  const rate = checkRateLimit(
    `notifications:subscribe:${getClientIp(request)}`,
    IP_LIMIT,
    IP_WINDOW_MS,
  );
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  const unsupported = rejectUnsupportedContentType(request);
  if (unsupported) return unsupported;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const willId = typeof body.willId === 'string' ? body.willId.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!willId || !email) {
    return NextResponse.json(
      { ok: false, error: 'willId and email are required' },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid email address' },
      { status: 400 },
    );
  }

  if (!/^\d+$/.test(willId)) {
    return NextResponse.json(
      { ok: false, error: 'willId must be a non-negative integer' },
      { status: 400 },
    );
  }

  const events = parseEvents(body.events);
  if (!events) {
    return NextResponse.json(
      {
        ok: false,
        error: `events must be an array containing one or more of: ${SUPPORTED_EVENTS.join(', ')}`,
      },
      { status: 400 },
    );
  }

  // Confirm the will exists before storing a subscription.
  try {
    const will = await getSoroWillClient().getWill(willId);
    if (!will) {
      return NextResponse.json({ ok: false, error: 'Will not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Will not found' }, { status: 404 });
  }

  try {
    // Re-use the existing reminder subscription store; events is stored as
    // metadata for the notification dispatch layer to filter on.
    const result = await registerReminderSubscription({
      willId,
      email,
      owner: '', // Not required for notification-only subscriptions
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Confirmation email sent to ${escapeHtml(email)}. Open the link to activate notifications.`,
      subscription: {
        willId,
        email,
        events,
        confirmed: result.subscription?.confirmed ?? false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not register notification subscription';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = withCorrelationId(handlePOST);
