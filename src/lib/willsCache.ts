import type { Will } from '@sorowill/sdk';

/** How long cached dashboard data is treated as fresh and served without a refetch. */
export const WILLS_CACHE_TTL_MS = 60_000;

export interface CachedWills {
  owned: Will[];
  inheriting: Will[];
  guardian: Will[];
  /** True when the guardian scan hit errors, so the list may be incomplete. */
  guardianHasErrors: boolean;
  /** `Date.now()` when the data was fetched. */
  fetchedAt: number;
}

// In-memory only: the cache lives for the page session and is never persisted,
// so a reload always starts from the chain.
const cache = new Map<string, CachedWills>();

/** Returns the cached entry for `owner` (fresh or stale), if any. */
export function getCachedWills(owner: string): CachedWills | undefined {
  return cache.get(owner);
}

/** True while `entry` is younger than `WILLS_CACHE_TTL_MS`. */
export function isWillsCacheFresh(entry: CachedWills, now: number = Date.now()): boolean {
  return now - entry.fetchedAt < WILLS_CACHE_TTL_MS;
}

export function setCachedWills(owner: string, entry: Omit<CachedWills, 'fetchedAt'>): CachedWills {
  const stored: CachedWills = { ...entry, fetchedAt: Date.now() };
  cache.set(owner, stored);
  return stored;
}

/** Drops the entry for `owner`, or every entry when no owner is given (e.g. a network switch). */
export function invalidateWillsCache(owner?: string): void {
  if (owner === undefined) {
    cache.clear();
  } else {
    cache.delete(owner);
  }
}
