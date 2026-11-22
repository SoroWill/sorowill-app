import { NextResponse } from 'next/server';
import { withCorrelationId } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

/**
 * GET /api/time
 *
 * Returns the server's current time in epoch milliseconds so clients can
 * correct deadline math for local clock skew (#751).
 */
function handleGET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = withCorrelationId(handleGET);
