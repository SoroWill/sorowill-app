/**
 * Fixed-window, in-memory rate limiting for API routes.
 *
 * State is per server instance, so it bounds abuse from a single client but is
 * not a substitute for edge/WAF rate limiting. Thresholds are resolved from
 * environment variables (see `getRateLimitConfig`) so a deployment can tune
 * them without a code change; call sites pick the endpoint key and the client
 * identifier (usually the IP).
 *
 * Known limitations, accepted for simplicity:
 *   - Burst at the boundary: a client can send `limit` requests at the end of
 *     one window and `limit` more at the start of the next.
 *   - Per instance: with N server instances the effective limit is up to N x.
 *   - IP spoofing: `getClientIp` trusts `x-forwarded-for`, so the app must sit
 *     behind a proxy that overwrites it.
 *   - Clients without a resolvable IP share one `'unknown'` bucket.
 *
 * Environment variables:
 *   RATE_LIMIT_DEFAULT_MAX        (default: 60)
 *   RATE_LIMIT_DEFAULT_WINDOW_MS  (default: 60000)
 *   RATE_LIMIT_<ENDPOINT>_MAX / _WINDOW_MS
 * where <ENDPOINT> is the endpoint key uppercased with non-alphanumerics turned
 * into underscores (e.g. "reminders/register" → REMINDERS_REGISTER).
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

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function envKeyForEndpoint(endpoint: string): string {
  return endpoint
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve the rate-limit configuration for an endpoint. Resolution order, first
 * defined value wins: per-endpoint override, global default, built-in default.
 */
export function getRateLimitConfig(endpoint?: string): RateLimitConfig {
  const globalMax = parsePositiveInt(process.env.RATE_LIMIT_DEFAULT_MAX);
  const globalWindow = parsePositiveInt(process.env.RATE_LIMIT_DEFAULT_WINDOW_MS);

  let max = globalMax ?? DEFAULT_RATE_LIMIT.max;
  let windowMs = globalWindow ?? DEFAULT_RATE_LIMIT.windowMs;

  if (endpoint) {
    const key = envKeyForEndpoint(endpoint);
    const endpointMax = parsePositiveInt(process.env[`RATE_LIMIT_${key}_MAX`]);
    const endpointWindow = parsePositiveInt(process.env[`RATE_LIMIT_${key}_WINDOW_MS`]);
    if (endpointMax !== undefined) max = endpointMax;
    if (endpointWindow !== undefined) windowMs = endpointWindow;
  }

  return { max, windowMs };
}

/**
 * Builds a collision-safe key from multiple parts.
 *
 * Naive `parts.join(':')` is unsafe because a part may contain the separator
 * (IPv6 addresses do), making two distinct inputs produce the same key. Each
 * part is length-prefixed here, which is unambiguous whatever its content.
 */
export function buildRateLimitKey(...parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window resets. */
  resetMs: number;
  /** Seconds until the window resets, for a `Retry-After` header. */
  retryAfterSeconds: number;
  limit: number;
}

/**
 * Check and record a request against a window.
 *
 * @param key      Collision-safe key, usually from `buildRateLimitKey`.
 * @param limit    Maximum requests per window (defaults to the configured default).
 * @param windowMs Window length in milliseconds (defaults to the configured default).
 * @param now      Time in milliseconds; defaults to the current time.
 */
export function checkRateLimit(
  key: string,
  limit: number = DEFAULT_RATE_LIMIT.max,
  windowMs: number = DEFAULT_RATE_LIMIT.windowMs,
  now: number = Date.now(),
): RateLimitResult {
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    // Drop expired entries opportunistically so the map cannot grow unbounded.
    for (const [candidate, window] of windows) {
      if (window.resetAt <= now) windows.delete(candidate);
    }
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }

  entry.count += 1;
  const resetMs = Math.max(0, entry.resetAt - now);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetMs,
    retryAfterSeconds: Math.max(0, Math.ceil(resetMs / 1000)),
    limit,
  };
}

/**
 * Parses a `Retry-After` header into seconds to wait. Accepts either a number
 * of seconds or an HTTP-date. Returns `null` when the value is absent, empty
 * or unparseable, so callers can distinguish "no hint" from an explicit zero;
 * a date in the past is a valid hint and clamps to `0`.
 */
export function parseRetryAfter(
  headerValue: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;
  if (/^[+-]?\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    // A negative delay is invalid rather than an explicit "retry now".
    return seconds >= 0 ? Math.ceil(seconds) : null;
  }

  const target = Date.parse(trimmed);
  if (Number.isNaN(target)) return null;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** A human-readable "try again in …" message for a Retry-After wait. */
export function formatRetryAfterMessage(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  if (total <= 0) return 'Please retry in a moment.';
  if (total < 60) return `Please retry in ${total} second${total === 1 ? '' : 's'}.`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `Please retry in ${minutes} minute${minutes === 1 ? '' : 's'}${rest ? ` and ${rest} second${rest === 1 ? '' : 's'}` : ''}.`;
}

/** Builds a 429 response carrying a `Retry-After` header from a rate-limit result. */
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

/** The caller's IP, as far as the proxy in front of the app reports it. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim();
  return ip || 'unknown';
}

/** Clears every window. Used by tests. */
export function resetRateLimits(): void {
  windows.clear();
}
