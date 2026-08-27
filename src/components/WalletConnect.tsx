'use client';

import { useEffect, useRef, useState } from 'react';

import { safeConnectWallet, safeGetPublicKey, truncateAddress } from '@/lib/freighter';
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

type ErrorType = 'not_installed' | 'user_declined' | 'generic';

interface ErrorInfo {
  type: ErrorType;
  message: string;
}

function classifyError(err: unknown): ErrorInfo {
  const rawMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
  const message = formatError(err);

  if (
    rawMessage.includes('Freighter') ||
    rawMessage.includes('not found') ||
    rawMessage.includes('not installed')
  ) {
    return { type: 'not_installed', message };
  }
  if (
    rawMessage.includes('declined') ||
    rawMessage.includes('denied') ||
    rawMessage.includes('rejected')
  ) {
    return { type: 'user_declined', message };
  }
  return { type: 'generic', message };
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

  useEffect(() => {
    if (isSessionCleared()) {
      return;
    }
    void safeGetPublicKey().then((key) => {
      if (isMounted.current) {
        setPublicKey(key);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);

    const handleMessage = (event: MessageEvent) => {
      const { type, publicKey: incomingKey } = event.data;

      if (type === 'wallet_connected' && incomingKey) {
        setSessionCleared(false);
        setPublicKey(incomingKey);
      } else if (type === 'wallet_disconnected') {
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
      setPublicKey(connection.publicKey);

      if (typeof window !== 'undefined') {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
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
    setPublicKey(null);
    setError(null);

    if (typeof window !== 'undefined') {
      const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
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
