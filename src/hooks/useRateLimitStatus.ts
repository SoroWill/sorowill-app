import { useCallback, useEffect, useRef, useState } from 'react';

export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: string;
  resetInSeconds: number;
  warning: boolean;
}

export interface UseRateLimitStatusResult {
  status: RateLimitStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches the current API rate limit status from `/api/rate-limit-status`.
 *
 * Re-polls automatically every `pollIntervalMs` milliseconds (default 30 s).
 * Pass `0` to disable auto-polling.
 */
export function useRateLimitStatus(pollIntervalMs = 30_000): UseRateLimitStatusResult {
  const [status, setStatus] = useState<RateLimitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const response = await fetch('/api/rate-limit-status', {
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = (await response.json()) as RateLimitStatus;
      setStatus(data);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch rate limit status');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchStatus();

    if (pollIntervalMs > 0) {
      const id = setInterval(() => void fetchStatus(), pollIntervalMs);
      return () => clearInterval(id);
    }

    return () => abortRef.current?.abort();
  }, [fetchStatus, pollIntervalMs]);

  return { status, loading, error, refresh: fetchStatus };
}
