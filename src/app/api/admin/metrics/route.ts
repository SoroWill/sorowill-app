import { NextResponse } from 'next/server';

import { apiError } from '@/lib/errors';
import { getMetricsSnapshot, isAdminRequest, metricsToCsv, recordEvent } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'wallet_connect',
  'will_created',
  'will_checked_in',
  'will_released',
  'guardian_vote',
  'reminder_registered',
  'page_view',
]);

/**
 * GET /api/admin/metrics
 *
 * Returns the analytics snapshot for the admin dashboard (#914): user event counts, per-route
 * performance and recent errors. Requires `Authorization: Bearer $ADMIN_METRICS_TOKEN`; when the
 * variable is unset the endpoint is disabled. `?format=csv` returns the same data as a report.
 */
export function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return apiError('unauthorized', 'Admin metrics token required', 401);
  }

  try {
    const snapshot = getMetricsSnapshot();
    const format = new URL(request.url).searchParams.get('format');

    if (format === 'csv') {
      return new NextResponse(metricsToCsv(snapshot), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="sorowill-metrics-${snapshot.generatedAt}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return apiError('server_error', 'Failed to read metrics', 500);
  }
}

/**
 * POST /api/admin/metrics
 *
 * Records one user event (`{ "event": "wallet_connect" }`). The browser cannot write metrics
 * directly; this route is the only way in, and it only accepts the known event names.
 */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return apiError('unauthorized', 'Admin metrics token required', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation', 'Body must be JSON', 400);
  }

  const event = (body as { event?: unknown } | null)?.event;
  if (typeof event !== 'string' || !ALLOWED_EVENTS.has(event)) {
    return apiError('validation', 'Unknown metric event', 400);
  }

  recordEvent(event);
  return NextResponse.json({ ok: true }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
