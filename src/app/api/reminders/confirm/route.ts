import { NextResponse } from 'next/server';

import { confirmReminderSubscription } from '@/lib/reminders';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';

  const result = await confirmReminderSubscription(token);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
