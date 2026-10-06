import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { unsubscribeReminderSubscription } from '@/lib/reminders';

async function handleUnsubscribe(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('token') || undefined;

  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        if (body.token) token = body.token;
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        if (formData.get('token')) token = String(formData.get('token'));
      }
    } catch {
      // Fall back to query parameters if body parsing fails
    }
  }

  if (!token) {
    return new NextResponse(
      `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>A valid unsubscribe token is required.</p></body></html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }

  try {
    const result = await unsubscribeReminderSubscription({ token });
    const message = result.ok
      ? 'You have been unsubscribed from check-in reminder emails for this will.'
      : result.error || 'Could not process unsubscribe request.';

    return new NextResponse(
      `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>${message}</p></body></html>`,
      {
        status: result.ok ? 200 : 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not process unsubscribe request.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleUnsubscribe(request);
}

export async function POST(request: Request) {
  // Form encoding stays allowed for RFC 8058 one-click unsubscribe from mail clients.
  const unsupported = rejectUnsupportedContentType(request, [
    'application/json',
    'application/x-www-form-urlencoded',
  ]);
  if (unsupported) return unsupported;

  return handleUnsubscribe(request);
}
