'use client';

import { useEffect, useState } from 'react';
import { getNetwork, getRpcUrl } from '@/lib/sorowill';
import type { SoroWillNetwork } from '@sorowill/sdk';
import { useMounted } from '@/lib/useMounted';

export type RpcHealthStatus = 'checking' | 'connected' | 'degraded' | 'offline';

export interface RpcHealth {
  status: RpcHealthStatus;
  latencyMs?: number;
  error?: string;
}

/** How often the badge re-checks RPC health. */
export const RPC_HEALTH_INTERVAL_MS = 30_000;
/** Responses slower than this are reported as "degraded". */
export const RPC_DEGRADED_LATENCY_MS = 2_000;
const RPC_HEALTH_TIMEOUT_MS = 5_000;

/**
 * Pings the Soroban RPC with the lightweight `getNetwork` JSON-RPC method and
 * classifies the result as connected / degraded / offline.
 */
export async function checkRpcHealth(rpcUrl: string): Promise<RpcHealth> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_HEALTH_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getNetwork' }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - started;
    if (res.status === 429) {
      return { status: 'degraded', latencyMs, error: 'Rate limited (HTTP 429)' };
    }
    if (!res.ok) {
      return { status: 'offline', latencyMs, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { error?: { message?: string } };
    if (body?.error) {
      return { status: 'degraded', latencyMs, error: body.error.message ?? 'RPC error' };
    }
    return { status: latencyMs > RPC_DEGRADED_LATENCY_MS ? 'degraded' : 'connected', latencyMs };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      status: 'offline',
      error: aborted ? `Timed out after ${RPC_HEALTH_TIMEOUT_MS}ms` : err instanceof Error ? err.message : 'Network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Shown wherever the testnet is displayed, so nobody mistakes it for the real network (#818). */
export const TESTNET_WARNING = 'Test network: tokens here have no real value. Switch to Mainnet to use real funds.';

function describeHealth(health: RpcHealth): string {
  switch (health.status) {
    case 'checking':
      return 'RPC: checking connection…';
    case 'connected':
      return `RPC: connected (${health.latencyMs}ms)`;
    case 'degraded':
      return `RPC: degraded — ${health.error ?? `slow response (${health.latencyMs}ms)`}`;
    case 'offline':
      return `RPC: offline — ${health.error ?? 'unreachable'}`;
  }
}

const DOT_CLASS: Record<RpcHealthStatus, string> = {
  checking: 'bg-gray-400 animate-pulse',
  connected: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  offline: 'bg-red-500',
};

export function NetworkBadge() {
  const [network, setNetwork] = useState<SoroWillNetwork>('testnet');
  const [health, setHealth] = useState<RpcHealth>({ status: 'checking' });
  const mounted = useMounted();

  useEffect(() => {
    setNetwork(getNetwork());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let result: RpcHealth;
      try {
        result = await checkRpcHealth(getRpcUrl());
      } catch (err) {
        result = { status: 'offline', error: err instanceof Error ? err.message : 'Invalid RPC URL' };
      }
      if (!cancelled) setHealth(result);
    };
    void run();
    const id = setInterval(run, RPC_HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!mounted) {
    return <div className="h-6 w-20 rounded-full bg-white/5 animate-pulse" />;
  }

  const isMainnet = network === 'mainnet';
  const healthText = describeHealth(health);
  const networkLabel = isMainnet ? 'Mainnet' : 'Testnet';
  const accessibleLabel = `Current network: ${networkLabel}. ${isMainnet ? '' : `${TESTNET_WARNING} `}${healthText}`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
        isMainnet
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
      }`}
      role="status"
      aria-live="polite"
      aria-label={accessibleLabel}
      title={isMainnet ? healthText : `${TESTNET_WARNING} ${healthText}`}
      data-rpc-status={health.status}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[health.status]}`} aria-hidden="true" />
      <span aria-hidden="true">{isMainnet ? network : `⚠ ${network}`}</span>
    </span>
  );
}
