import { useEffect, useRef, useState } from 'react';

/** Default interval between polls when no push connection is available. */
export const LIVE_POLL_INTERVAL_MS = 30_000;

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export type LiveConnection = 'polling' | 'live';

export interface LiveUpdatesOptions {
  intervalMs?: number;
  /**
   * Optional WebSocket endpoint. Every message it sends is treated as "something changed" and
   * triggers a refresh; the payload itself is not used. When it is missing, closed or failing,
   * polling keeps the data current.
   */
  wsUrl?: string;
}

/**
 * Keeps data fresh: polls every `intervalMs` while the tab is visible and, when `wsUrl` is set,
 * also refreshes as soon as the socket reports a change (#815). Returns whether the push
 * connection is currently open (`live`) or only polling is active.
 */
export function useLiveUpdates(
  refresh: () => void,
  { intervalMs = LIVE_POLL_INTERVAL_MS, wsUrl }: LiveUpdatesOptions = {},
): LiveConnection {
  const refreshRef = useRef(refresh);
  const [connection, setConnection] = useState<LiveConnection>('polling');

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Polling fallback: always on, so a dead or missing socket never leaves the data stale.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  useEffect(() => {
    if (!wsUrl || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      try {
        socket = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      socket.onopen = () => {
        attempts = 0;
        setConnection('live');
      };
      socket.onmessage = () => refreshRef.current();
      socket.onclose = () => {
        setConnection('polling');
        scheduleReconnect();
      };
      socket.onerror = () => socket?.close();
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempts, RECONNECT_MAX_MS);
      attempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      setConnection('polling');
    };
  }, [wsUrl]);

  return connection;
}
