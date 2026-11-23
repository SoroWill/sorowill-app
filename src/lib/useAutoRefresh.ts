import { useEffect, useRef } from 'react';

/** Default interval between automatic refreshes of on-chain data. */
export const AUTO_REFRESH_INTERVAL_MS = 60_000;

/**
 * Calls `refresh` every `intervalMs` while the tab is visible and `enabled` is true.
 *
 * Ticks that fall while the tab is hidden are skipped; returning to the tab is
 * handled by `useRefreshOnVisible`. The latest `refresh` is always used, so the
 * interval is not reset when the callback's identity changes.
 */
export function useAutoRefresh(
  refresh: () => void,
  enabled = true,
  intervalMs: number = AUTO_REFRESH_INTERVAL_MS,
): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
}
