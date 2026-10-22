import { useEffect, useRef } from 'react';

/**
 * Calls `refresh` when the page becomes visible again (tab switch via the
 * Page Visibility API) or is restored from the back/forward cache (`pageshow`
 * with `persisted`), so state cached before navigating away is not left stale.
 */
export function useRefreshOnVisible(refresh: () => void, enabled = true): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled]);
}
