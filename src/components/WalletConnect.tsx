'use client';

import { useEffect, useRef, useState } from 'react';

import {
  safeConnectWallet,
  safeGetPublicKey,
  truncateAddress,
} from '@/lib/freighter';
import { formatError } from '@/lib/errors';

// TODO(#4): Replace this Freighter-only connect flow with a wallet-selection
// UI once @sorowill/sdk ships adapters for other wallets (Albedo, xBull,
// etc.) — today the SDK only exports Freighter-specific wallet functions
// (connectWallet/getPublicKey/isFreighterInstalled), no adapter abstraction.

// Freighter exposes no API for revoking a site's access: once the user has
// approved this origin, the extension keeps it approved until they remove it
// manually from Freighter's own settings. So this button can only clear the
// session on our side, hence "Clear session" rather than "Disconnect". The
// flag below stops safeGetPublicKey() from silently reconnecting on the next
// mount within the same tab session.
const DISCONNECTED_KEY = 'sorowill:wallet-cleared';
const BROADCAST_CHANNEL_NAME = 'wallet_state';

// There is no auth token here: the "session" is the connected public key we
// hold in state. It goes stale when Freighter locks, switches account or
// revokes access, so it is re-validated periodically and capped at a max age,
// after which the user must reconnect explicitly.
const CONNECTED_AT_KEY = 'sorowill:wallet-connected-at';
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const SESSION_CHECK_INTERVAL_MS = 30_000;
export const SESSION_CHECK_MAX_BACKOFF_MS = 5 * 60 * 1000;
// Random spread added to each scheduled check so tabs opened together drift
// apart; the first tab to fire then broadcasts its result and the rest defer.
const SESSION_CHECK_JITTER_RATIO = 0.1;
export const SESSION_EXPIRED_MESSAGE = 'Session expired. Please reconnect your wallet.';

type ErrorType = 'not_installed' | 'user_declined' | 'session_expired' | 'generic';

interface ErrorInfo {
  type: ErrorType;
  message: string;
}

export function classifyError(err: unknown): ErrorInfo {
  const rawMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
  const message = formatError(err);

  // Declined is checked first: a rejection message can also mention Freighter.
  if (
    rawMessage.includes('declined') ||
    rawMessage.includes('denied') ||
    rawMessage.includes('rejected')
  ) {
    return { type: 'user_declined', message };
  }
  // Only an explicit "not installed" means the extension is missing; broad
  // matches such as 'not found' misreport RPC errors like 'Account not found'.
  if (rawMessage.includes('not installed')) {
    return { type: 'not_installed', message };
  }
  return { type: 'generic', message };
}

/**
 * Returns a channel for cross-tab wallet sync, or `null` where BroadcastChannel
 * is unavailable (SSR, Safari < 15.4, some webviews). Callers then fall back
 * to single-tab behaviour instead of throwing.
 */
function openWalletChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  return new BroadcastChannel(BROADCAST_CHANNEL_NAME);
}

/**
 * Delay before the next wallet check. Doubles per consecutive failure, capped
 * at SESSION_CHECK_MAX_BACKOFF_MS, so a wedged extension is not hammered.
 */
export function getSessionCheckDelay(failures: number, random: number = Math.random()): number {
  const base = Math.min(
    SESSION_CHECK_INTERVAL_MS * 2 ** Math.max(0, failures),
    SESSION_CHECK_MAX_BACKOFF_MS,
  );
  return Math.round(base * (1 + SESSION_CHECK_JITTER_RATIO * random));
}

function isSessionCleared(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.sessionStorage.getItem(DISCONNECTED_KEY) === 'true';
}

function setSessionCleared(cleared: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (cleared) {
    window.sessionStorage.setItem(DISCONNECTED_KEY, 'true');
  } else {
    window.sessionStorage.removeItem(DISCONNECTED_KEY);
  }
}

export function isSessionExpired(connectedAt: number | null, now: number = Date.now()): boolean {
  return connectedAt !== null && now - connectedAt >= SESSION_MAX_AGE_MS;
}

function getConnectedAt(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.sessionStorage.getItem(CONNECTED_AT_KEY);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function setConnectedAt(value: number | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (value === null) {
    window.sessionStorage.removeItem(CONNECTED_AT_KEY);
  } else {
    window.sessionStorage.setItem(CONNECTED_AT_KEY, String(value));
  }
}

export function WalletConnect() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  function expireSession() {
    setSessionCleared(true);
    setConnectedAt(null);
    setPublicKey(null);
    setError({ type: 'session_expired', message: SESSION_EXPIRED_MESSAGE });
  }

  useEffect(() => {
    if (isSessionCleared()) {
      return;
    }
    if (isSessionExpired(getConnectedAt())) {
      expireSession();
      return;
    }
    void safeGetPublicKey().then((key) => {
      if (!isMounted.current) return;
      if (!key) {
        // No valid key from the wallet: treat as disconnected rather than
        // rendering an empty/invalid address.
        setConnectedAt(null);
        setPublicKey(null);
        return;
      }
      if (getConnectedAt() === null) {
        setConnectedAt(Date.now());
      }
      setPublicKey(key);
    });
  }, []);

  // Re-validate the session while connected: expire it once it outlives
  // SESSION_MAX_AGE_MS or the wallet no longer reports the same account.
  // Tabs share one Freighter wallet, so whichever tab checks first broadcasts
  // the result and the others reuse it and push their own check back, rather
  // than every tab polling on its own. Failed checks back off exponentially.
  useEffect(() => {
    if (!publicKey) return;

    const channel = openWalletChannel();
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), getSessionCheckDelay(failures));
    };

    const applyResult = (current: string | null) => {
      failures = 0;
      if (current !== publicKey) {
        expireSession();
        return;
      }
      schedule();
    };

    const check = async () => {
      if (isSessionExpired(getConnectedAt())) {
        expireSession();
        return;
      }
      const current = await safeGetPublicKey();
      if (!cancelled && isMounted.current && (!current || current !== publicKey)) {
        expireSession();
      }
      if (cancelled || !isMounted.current) return;
      channel?.postMessage({ type: 'session_checked', publicKey: current });
      applyResult(current);
    };

    const handleMessage = (event: MessageEvent) => {
      if (cancelled || event.data?.type !== 'session_checked') return;
      applyResult(event.data.publicKey ?? null);
    };

    channel?.addEventListener('message', handleMessage);
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) {
        channel.removeEventListener('message', handleMessage);
        channel.close();
      }
    };
  }, [publicKey]);

  useEffect(() => {
    const channel = openWalletChannel();
    if (!channel) return;

    const handleMessage = (event: MessageEvent) => {
      const { type, publicKey: incomingKey } = event.data;

      if (type === 'wallet_connected' && incomingKey) {
        setSessionCleared(false);
        setConnectedAt(Date.now());
        setError(null);
        setPublicKey(incomingKey);
      } else if (type === 'wallet_disconnected') {
        setConnectedAt(null);
        setPublicKey(null);
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    setSessionCleared(false);
    try {
      const connection = await safeConnectWallet();
      if (!connection.publicKey) {
        throw new Error('Wallet did not return a public key');
      }
      setConnectedAt(Date.now());
      setPublicKey(connection.publicKey);

      const channel = openWalletChannel();
      if (channel) {
        channel.postMessage({
          type: 'wallet_connected',
          publicKey: connection.publicKey,
        });
        channel.close();
      }
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setConnecting(false);
    }
  }

  function handleClearSession() {
    setSessionCleared(true);
    setConnectedAt(null);
    setPublicKey(null);
    setError(null);

    const channel = openWalletChannel();
    if (channel) {
      channel.postMessage({
        type: 'wallet_disconnected',
      });
      channel.close();
    }
  }

  if (publicKey) {
    return (
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-sm text-will-light">
          {truncateAddress(publicKey)}
        </span>
        <button
          type="button"
          onClick={handleClearSession}
          className="rounded-full border border-white/20 px-3 py-1.5 text-sm text-will-light/70 transition hover:border-white/40 hover:text-will-light"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting}
        className="rounded-full bg-will-purple px-4 py-1.5 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {connecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {error ? (
        <div className="max-w-xs text-right text-xs text-red-400">
          {error.type === 'not_installed' ? (
            <>
              <p className="mb-1">Freighter wallet not installed. Install it to continue.</p>
              <a
                href="https://www.freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-300 underline hover:text-red-200"
              >
                Install Freighter
              </a>
            </>
          ) : (
            <p>{error.message}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
