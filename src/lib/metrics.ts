/**
 * In-process metrics store for the admin analytics dashboard (#914).
 *
 * Three kinds of samples are kept, each in a bounded ring buffer so memory use stays flat:
 *   - user events (wallet connects, will creations, check-ins, ...) counted per name,
 *   - performance samples (request durations) summarised per route,
 *   - errors (route, message, correlation id) for the most recent failures.
 *
 * The store lives in the server process only; it is never exposed to the browser except through
 * the admin API, which requires the `ADMIN_METRICS_TOKEN` bearer token.
 */

export type MetricEventName =
  | 'wallet_connect'
  | 'will_created'
  | 'will_checked_in'
  | 'will_released'
  | 'guardian_vote'
  | 'reminder_registered'
  | 'page_view';

export interface PerformanceSample {
  route: string;
  durationMs: number;
  status: number;
  at: number;
}

export interface ErrorSample {
  route: string;
  message: string;
  correlationId?: string;
  at: number;
}

export interface RoutePerformance {
  route: string;
  count: number;
  errorCount: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface MetricsSnapshot {
  generatedAt: number;
  uptimeMs: number;
  users: { events: Record<string, number>; total: number };
  performance: { routes: RoutePerformance[]; totalRequests: number; errorRate: number };
  errors: { recent: ErrorSample[]; total: number };
}

const MAX_PERFORMANCE_SAMPLES = 1000;
const MAX_ERROR_SAMPLES = 100;
const MAX_EVENT_NAMES = 50;

const startedAt = Date.now();
const eventCounts = new Map<string, number>();
const performanceSamples: PerformanceSample[] = [];
const errorSamples: ErrorSample[] = [];
let totalErrors = 0;

function pushBounded<T>(buffer: T[], value: T, max: number): void {
  buffer.push(value);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
}

/** Records one user-facing event. Unknown names are accepted so new call sites need no change here. */
export function recordEvent(name: MetricEventName | string, count = 1): void {
  if (!Number.isFinite(count) || count <= 0) return;
  if (!eventCounts.has(name) && eventCounts.size >= MAX_EVENT_NAMES) return;
  eventCounts.set(name, (eventCounts.get(name) ?? 0) + Math.floor(count));
}

/** Records the duration and status of one handled request. */
export function recordPerformance(route: string, durationMs: number, status = 200): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  pushBounded(performanceSamples, { route, durationMs, status, at: Date.now() }, MAX_PERFORMANCE_SAMPLES);
}

/** Records one error, keeping the most recent samples for the dashboard. */
export function recordError(route: string, error: unknown, correlationId?: string): void {
  totalErrors += 1;
  const message = error instanceof Error ? error.message : String(error);
  pushBounded(
    errorSamples,
    { route, message: message.slice(0, 500), correlationId, at: Date.now() },
    MAX_ERROR_SAMPLES,
  );
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

function summariseRoutes(samples: PerformanceSample[]): RoutePerformance[] {
  const byRoute = new Map<string, PerformanceSample[]>();
  for (const sample of samples) {
    const list = byRoute.get(sample.route);
    if (list) list.push(sample);
    else byRoute.set(sample.route, [sample]);
  }

  return [...byRoute.entries()]
    .map(([route, list]) => {
      const durations = list.map((s) => s.durationMs).sort((a, b) => a - b);
      const total = durations.reduce((sum, d) => sum + d, 0);
      return {
        route,
        count: list.length,
        errorCount: list.filter((s) => s.status >= 500).length,
        avgMs: Math.round((total / list.length) * 100) / 100,
        p95Ms: percentile(durations, 0.95),
        maxMs: durations[durations.length - 1] ?? 0,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** A point-in-time copy of everything the dashboard shows. */
export function getMetricsSnapshot(): MetricsSnapshot {
  const events = Object.fromEntries(eventCounts);
  const totalRequests = performanceSamples.length;
  const failedRequests = performanceSamples.filter((s) => s.status >= 500).length;

  return {
    generatedAt: Date.now(),
    uptimeMs: Date.now() - startedAt,
    users: {
      events,
      total: Object.values(events).reduce((sum, n) => sum + n, 0),
    },
    performance: {
      routes: summariseRoutes(performanceSamples),
      totalRequests,
      errorRate: totalRequests === 0 ? 0 : Math.round((failedRequests / totalRequests) * 10000) / 10000,
    },
    errors: {
      recent: [...errorSamples].reverse(),
      total: totalErrors,
    },
  };
}

/** Clears every sample. Used by tests and by the admin "reset" action. */
export function resetMetrics(): void {
  eventCounts.clear();
  performanceSamples.length = 0;
  errorSamples.length = 0;
  totalErrors = 0;
}

function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Renders a snapshot as CSV for the dashboard's report export. */
export function metricsToCsv(snapshot: MetricsSnapshot): string {
  const rows: string[][] = [['section', 'name', 'metric', 'value']];

  for (const [name, count] of Object.entries(snapshot.users.events)) {
    rows.push(['users', name, 'count', String(count)]);
  }
  rows.push(['users', 'total', 'count', String(snapshot.users.total)]);

  for (const route of snapshot.performance.routes) {
    rows.push(['performance', route.route, 'count', String(route.count)]);
    rows.push(['performance', route.route, 'avg_ms', String(route.avgMs)]);
    rows.push(['performance', route.route, 'p95_ms', String(route.p95Ms)]);
    rows.push(['performance', route.route, 'max_ms', String(route.maxMs)]);
    rows.push(['performance', route.route, 'errors', String(route.errorCount)]);
  }
  rows.push(['performance', 'total', 'requests', String(snapshot.performance.totalRequests)]);
  rows.push(['performance', 'total', 'error_rate', String(snapshot.performance.errorRate)]);

  rows.push(['errors', 'total', 'count', String(snapshot.errors.total)]);
  for (const error of snapshot.errors.recent) {
    rows.push([
      'errors',
      error.route,
      'message',
      `${new Date(error.at).toISOString()} ${error.message}${error.correlationId ? ` (${error.correlationId})` : ''}`,
    ]);
  }

  return rows.map((row) => row.map(csvField).join(',')).join('\n');
}

/** True when the request carries the admin bearer token configured in `ADMIN_METRICS_TOKEN`. */
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_METRICS_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const supplied = match[1].trim();
  if (supplied.length !== expected.length) return false;
  // Constant-time-ish comparison without pulling in node:crypto for edge runtimes.
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
