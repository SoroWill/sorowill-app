/**
 * Server-clock correction for deadline math (#751).
 *
 * Deadlines are derived from on-chain timestamps, so comparing them with a
 * skewed local clock shows wrong remaining time. The client fetches the
 * server time once, derives an offset (server - local) and applies it to every
 * "now" used for deadline comparisons.
 */

let offsetMs = 0;

/**
 * Offset to add to the local clock to get server time. The server timestamp
 * is assumed to have been taken halfway through the request round trip.
 */
export function computeClockOffset(serverNow: number, requestStart: number, responseEnd: number): number {
  const localMidpoint = requestStart + (responseEnd - requestStart) / 2;
  return serverNow - localMidpoint;
}

/** Apply a clock offset to a local timestamp. */
export function applyClockOffset(localNow: number, offset: number): number {
  return localNow + offset;
}

/** Current time corrected by the last synced offset (falls back to local time). */
export function serverNow(): number {
  return applyClockOffset(Date.now(), offsetMs);
}

export function getClockOffset(): number {
  return offsetMs;
}

/** Fetch server time and update the offset. Failures keep the previous offset. */
export async function syncServerClock(signal?: AbortSignal): Promise<number> {
  try {
    const start = Date.now();
    const res = await fetch('/api/time', { cache: 'no-store', signal });
    const end = Date.now();
    if (!res.ok) return offsetMs;
    const body = (await res.json()) as { now?: unknown };
    if (typeof body.now !== 'number' || !Number.isFinite(body.now)) return offsetMs;
    offsetMs = computeClockOffset(body.now, start, end);
  } catch {
    // Keep the previous offset; local time is the fallback.
  }
  return offsetMs;
}
