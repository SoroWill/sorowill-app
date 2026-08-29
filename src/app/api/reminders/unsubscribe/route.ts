import { NextResponse } from 'next/server';

import { unsubscribeReminderSubscription } from '@/lib/reminders';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const willId = url.searchParams.get('willId') || '';
  const email = url.searchParams.get('email') || '';

  try {
    const result = await unsubscribeReminderSubscription({ willId, email });
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
