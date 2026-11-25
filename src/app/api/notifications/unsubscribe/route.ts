import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { withCorrelationId } from '@/lib/correlation';
import { escapeHtml, unsubscribeReminderSubscription } from '@/lib/reminders';

/**
 * @openapi GET
 * {
 *   "summary": "Unsubscribe from will event notifications (link)",
 *   "description": "Handles the unsubscribe link from notification emails. Returns an HTML confirmation page.",
 *   "tags": ["Notifications"],
 *   "parameters": [
 *     { "name": "token", "in": "query", "required": true, "schema": { "type": "string" } }
 *   ],
 *   "responses": {
 *     "200": { "description": "Successfully unsubscribed." },
 *     "400": { "description": "Token missing or invalid." }
 *   }
 * }
 */

function htmlPage(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:auto"><p>${escapeHtml(message)}</p><p><a href="/">Return to SoroWill</a></p></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function handleGET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? undefined;

  if (!token) {
    return htmlPage('A valid unsubscribe token is required.', 400);
  }

  try {
    const result = await unsubscribeReminderSubscription({ token });
    if (!result.ok) {
      return htmlPage(result.error ?? 'Could not process unsubscribe request.', 400);
    }
    return htmlPage('You have been unsubscribed from will event notifications.', 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not process unsubscribe request.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  const unsupported = rejectUnsupportedContentType(request, [
    'application/json',
    'application/x-www-form-urlencoded',
  ]);
  if (unsupported) return unsupported;

  const url = new URL(request.url);
  let token: string | undefined = url.searchParams.get('token') ?? undefined;

  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      if (typeof body.token === 'string') token = body.token;
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const t = formData.get('token');
      if (typeof t === 'string') token = t;
    }
  } catch {
    // Fall back to query parameter already parsed above
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'A valid unsubscribe token is required.' }, { status: 400 });
  }

  try {
    const result = await unsubscribeReminderSubscription({ token });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return htmlPage('You have been unsubscribed from will event notifications.', 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not process unsubscribe request.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = withCorrelationId(handleGET);
export const POST = withCorrelationId(handlePOST);
