/**
 * Minimal fixed-window, in-memory rate limiter keyed by an arbitrary string
 * (e.g. client IP). State is per server instance; it bounds abuse from a
 * single client but is not a substitute for edge/WAF rate limiting.
 *
 * Algorithm (fixed window): the first request for a key opens a window of
 * `windowMs` and sets its counter to 1. Each later request in that window
 * increments the counter and is allowed while `count <= limit`. Once
 * `resetAt` passes, the next request starts a fresh window. Rejected requests
 * still count, so hammering a blocked key does not buy extra attempts.
 * Thresholds are chosen per caller, next to the call site (e.g.
 * `src/app/api/reminders/register/route.ts`), because what is "normal" depends
 * on the endpoint.
 *
 * Threat model: this protects cheap-to-call, expensive-to-serve endpoints
 * (signature verification, RPC lookups, outbound email) from a single client
 * scripting requests — junk-payload floods, email spam via repeated
 * registrations, and ID enumeration by probing responses.
 *
 * Known limitations, accepted for simplicity:
 *   - Burst at the boundary: a client can send `limit` requests at the end of
 *     one window and `limit` more at the start of the next, so the worst case
 *     is 2x `limit` in a short span. Fine for coarse abuse limits; use a
 *     sliding window or token bucket if exact smoothing matters.
 *   - Per instance: with N server instances (or after a restart) the
 *     effective limit is up to N x `limit`. Distributed attackers with many
 *     IPs are out of scope here; that belongs at the edge/WAF.
 *   - IP spoofing: `getClientIp` trusts `x-forwarded-for`, so the app must sit
 *     behind a proxy that overwrites that header. Exposed directly, a client
 *     could rotate the header to get a fresh bucket on every request.
 *   - Clients without a resolvable IP share one `'unknown'` bucket.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Builds a collision-safe rate-limit key from multiple parts.
 *
 * Naive concatenation (e.g. `parts.join(':')`) is unsafe: if a part itself
 * contains the separator, distinct inputs can produce the same key. For
 * example, with `':'` as separator, `['reminders', 'register', '127.0.0.1']`
 * and `['reminders', 'register:127.0.0.1']` both yield
 * `'reminders:register:127.0.0.1'`. IPv6 addresses contain colons, so this is
 * a realistic collision.
 *
 * Approach chosen: length-prefixed encoding. Each part is encoded as
 * `<length>:<value>` and the parts are concatenated. Because the length is
 * unambiguous, no part's content can ever be confused with a separator or
 * with another part's boundary, regardless of what characters it contains.
 * This is deterministic, human-debuggable, and avoids the overhead of
 * JSON.stringify while being equally collision-safe.
 *
 * Alternatives considered:
 *  - JSON.stringify(parts): collision-safe and simple, but produces noisier
 *    keys and is slightly slower; length-prefixing is equivalent in safety
 *    with less overhead.
 *  - Validating that a separator is absent from parts and throwing: brittle,
 *    since callers cannot always control part contents (e.g. client IPs), and
 *    would turn a rate-limit check into a runtime error.
 *  - Escaping the separator within parts: requires careful, error-prone
 *    escape/unescape logic; length-prefixing sidesteps it entirely.
 */
export function buildRateLimitKey(...parts: string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join('|');
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    // Drop expired entries opportunistically so the map cannot grow unbounded.
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
    entry = { count: 0, resetAt: now + windowMs };
    windows.set(key, entry);
  }
  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

/**
 * The response for a request that was over its limit (#808): HTTP 429, a
 * `Retry-After` header in seconds and a JSON body that repeats the wait, so
 * clients can read it from either place. Rate-limited routes should return
 * this instead of building their own response.
 */
export function tooManyRequestsResponse(rate: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Too many requests',
      retryAfterSeconds: rate.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rate.retryAfterSeconds),
      },
    },
  );
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim();
  return ip || 'unknown';
}

export function resetRateLimits(): void {
  windows.clear();
}