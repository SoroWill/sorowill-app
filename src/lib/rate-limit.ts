/**
 * Configurable API rate limiting.
 *
 * Limits are resolved from environment variables so they can be tuned per
 * deployment without a code change. When no env vars are set, the documented
 * defaults below are used, preserving the original hard-coded behavior.
 *
 * Global defaults:
 *   RATE_LIMIT_DEFAULT_MAX       (default: 60)
 *   RATE_LIMIT_DEFAULT_WINDOW_MS (default: 60000)
 *
 * Per-endpoint overrides:
 *   RATE_LIMIT_<ENDPOINT>_MAX
 *   RATE_LIMIT_<ENDPOINT>_WINDOW_MS
 * where <ENDPOINT> is the endpoint key uppercased with non-alphanumeric
 * characters replaced by underscores (e.g. "reminders/confirm" ->
 * REMINDERS_CONFIRM).
 */

export interface RateLimitConfig {
  /** Maximum number of requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  max: 60,
  windowMs: 60_000,
};

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function envKeyForEndpoint(endpoint: string): string {
  return endpoint
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Resolve the rate-limit configuration for a given endpoint.
 *
 * Resolution order (first defined value wins):
 *   1. Per-endpoint env override (RATE_LIMIT_<ENDPOINT>_MAX / _WINDOW_MS)
 *   2. Global env default (RATE_LIMIT_DEFAULT_MAX / _WINDOW_MS)
 *   3. Built-in default (DEFAULT_RATE_LIMIT)
 */
export function getRateLimitConfig(endpoint?: string): RateLimitConfig {
  const globalMax = parsePositiveInt(process.env.RATE_LIMIT_DEFAULT_MAX);
  const globalWindow = parsePositiveInt(
    process.env.RATE_LIMIT_DEFAULT_WINDOW_MS,
  );

  let max = globalMax ?? DEFAULT_RATE_LIMIT.max;
  let windowMs = globalWindow ?? DEFAULT_RATE_LIMIT.windowMs;

  if (endpoint) {
    const key = envKeyForEndpoint(endpoint);
    const endpointMax = parsePositiveInt(
      process.env[`RATE_LIMIT_${key}_MAX`],
    );
    const endpointWindow = parsePositiveInt(
      process.env[`RATE_LIMIT_${key}_WINDOW_MS`],
    );
    if (endpointMax !== undefined) max = endpointMax;
    if (endpointWindow !== undefined) windowMs = endpointWindow;
  }

  return { max, windowMs };
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
  limit: number;
}

/**
 * Check and record a request against the rate limit for an endpoint.
 *
 * @param endpoint Logical endpoint key (e.g. "reminders/confirm").
 * @param identifier Caller identity used to scope the bucket (e.g. IP).
 */
export function checkRateLimit(
  endpoint: string,
  identifier: string,
): RateLimitResult {
  const { max, windowMs } = getRateLimitConfig(endpoint);
  const now = Date.now();
  const key = `${endpoint}:${identifier}`;

  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  const allowed = bucket.count <= max;

  return {
    allowed,
    remaining: Math.max(0, max - bucket.count),
    resetMs: Math.max(0, bucket.resetAt - now),
    limit: max,
  };
}

/**
 * Parses a `Retry-After` header value into a wait duration in seconds.
 *
 * The header may be either a non-negative number of seconds (e.g. `"120"`) or
 * an HTTP-date (e.g. `"Wed, 21 Oct 2015 07:28:00 GMT"`). Returns `0` when the
 * value is absent, empty, or unparseable so callers can treat it as "no hint".
 */
export function parseRetryAfter(headerValue: string | null, now: number = Date.now()): number {
  if (!headerValue) return 0;
  const trimmed = headerValue.trim();
  if (!trimmed) return 0;

  // Numeric form: delay in seconds.
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Math.ceil(Number(trimmed)));
  }

  // HTTP-date form: wait until that instant.
  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/**
 * Builds a 429 response carrying a `Retry-After` header derived from a
 * `RateLimitResult`, so clients know when to retry.
 */
export function buildRateLimitResponse(
  result: RateLimitResult,
  message = 'Too many requests. Please try again later.',
): Response {
  const retryAfter = Math.max(1, Math.ceil(result.retryAfterSeconds));
  return new Response(JSON.stringify({ error: message, retryAfterSeconds: retryAfter }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
  });
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim();
  return ip || 'unknown';
}

export function resetRateLimits(): void {
  windows.clear();
}
