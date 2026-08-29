import { NextResponse } from 'next/server';

import { registerReminderSubscription } from '@/lib/reminders';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const willId = typeof body?.willId === 'string' ? body.willId : '';
    const email = typeof body?.email === 'string' ? body.email : '';
    const owner = typeof body?.owner === 'string' ? body.owner : '';
    const appUrl = new URL(request.url).origin;

    const result = await registerReminderSubscription({ willId, email, owner, appUrl });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not register reminder';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
