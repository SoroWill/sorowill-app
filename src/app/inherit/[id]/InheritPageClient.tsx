'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { calculateShares, formatUSDC, WillStatus, type Will } from '@sorowill/sdk';

import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import { getSoroWillClient, stellarExpertUrl } from '@/lib/sorowill';
import { formatError, formatLoadError } from '@/lib/errors';
import { graceDeadline } from '@/lib/deadlines';
import { useToast } from '@/components/Toast';
import { StatusBanner } from '@/components/StatusBanner';
import { CopyAddress } from '@/components/CopyAddress';

function isValidWillId(id: string): boolean {
  return /^\d+$/.test(id);
}

export function claimIsAvailable(status: WillStatus, grace: Date | null, now: number): boolean {
  return status === WillStatus.Triggered && grace !== null && now >= grace.getTime();
}

/**
 * Deduplicated will-fetch cache.
 *
 * Maps a willId to its in-flight promise so that concurrent calls for the
 * same id share a single RPC request. The entry is removed once the promise
 * settles so subsequent calls after an error or a data change start fresh.
 */
const inflightWillCache = new Map<string, Promise<Will>>();

export default function InheritPageClient({ id }: { id: string }) {
  const toast = useToast();
  const willId = id;

  const [will, setWill] = useState<Will | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isMounted = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Abort any in-flight request on unmount.
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Fetch the will, deduplicating concurrent calls for the same id.
   *
   * When an AbortSignal is provided and the request is aborted before it
   * resolves, the rejection is swallowed so it never reaches error state.
   */
  const fetchWill = useCallback(
    (signal?: AbortSignal): Promise<Will> => {
      const cached = inflightWillCache.get(willId);
      if (cached) {
        return cached;
      }

      const promise = getSoroWillClient()
        .getWill(willId)
        .then((fetched) => {
          inflightWillCache.delete(willId);
          return fetched;
        })
        .catch((err) => {
          inflightWillCache.delete(willId);
          throw err;
        });

      inflightWillCache.set(willId, promise);

      // If the caller provides a signal, race the promise against abort so
      // the caller can stop waiting without cancelling the underlying RPC
      // (the SDK does not accept an AbortSignal today).
      if (signal) {
        return new Promise<Will>((resolve, reject) => {
          const onAbort = () => {
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (signal.aborted) {
            onAbort();
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
          promise.then(
            (value) => {
              signal.removeEventListener('abort', onAbort);
              resolve(value);
            },
            (err) => {
              signal.removeEventListener('abort', onAbort);
              reject(err);
            },
          );
        });
      }

      return promise;
    },
    [willId],
  );

  const refetch = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const fetched = await fetchWill(signal);
        if (!isMounted.current || signal?.aborted) {
          return;
        }
        setWill(fetched);
        setError(null);
      } catch (err) {
        if (!isMounted.current || signal?.aborted) {
          return;
        }
        // Swallow AbortError — it is an expected cancellation, not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        console.error('Failed to load inheritance will', err);
        setError(formatLoadError(err));
      } finally {
        if (isMounted.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [fetchWill],
  );

  useEffect(() => {
    void safeGetPublicKey().then((key) => {
      if (isMounted.current) {
        setPublicKey(key);
      }
    });
  }, []);

  useEffect(() => {
    if (!isValidWillId(willId)) {
      return;
    }
    // Cancel (ignore) the in-flight request when willId changes or on unmount
    // so stale responses never land in state.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    void refetch(controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is derived solely from willId
  }, [willId]);

  useEffect(() => {
    if (!will || will.status !== WillStatus.Triggered) return;
    const deadline = graceDeadline(will);
    if (!deadline) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [will]);

  // Quick client-side validation before hitting the RPC layer
  if (!isValidWillId(willId)) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">Invalid will ID</h1>
        <p className="mt-2 text-sm text-red-300/70">
          &ldquo;{willId}&rdquo; is not a valid will identifier. Will IDs must be non-negative integers.
        </p>
      </div>
    );
  }

  async function handleClaim() {
    setClaiming(true);
    setError(null);
    try {
      const { txHash } = await getSoroWillClient().releaseInheritance(willId);
      setClaimTxHash(txHash);
      await refetch();
      toast.success('Inheritance claimed successfully');
    } catch (err) {
      console.error('[InheritPage] Failed to claim inheritance:', err);
      const message = formatError(err);
      setError(message);
      toast.error(message);
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !will) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">
          Could not load will — check your connection
        </h1>
        <p className="mt-2 text-sm text-red-300/70">{error}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-4 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!will) {
    return null;
  }

  const shares = calculateShares(will.balance, will.beneficiaries);
  const myShare = publicKey
    ? shares
        .filter((s) => s.address === publicKey)
        .reduce(
          (acc, s) => ({ ...acc, share: (BigInt(acc.share) + BigInt(s.share)).toString() }),
          { address: publicKey, share: '0' },
        )
    : undefined;

  const grace = graceDeadline(will);
  const canClaim = claimIsAvailable(will.status, grace, now);
  const secondsUntilClaim = grace ? Math.max(0, Math.ceil((grace.getTime() - now) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Inheritance — Will #{will.id}</h1>
        <p className="mt-1 text-sm text-will-light/60">
          If a SoroWill owner passes away or becomes unreachable, this page lets a named beneficiary see —
          and, once the grace period has elapsed, trigger — the on-chain distribution of the will&apos;s
          balance.
        </p>
      </div>

      <StatusBanner status={will.status} />

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-300/80">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-full border border-red-400/40 px-3 py-1.5 text-xs text-red-300 transition hover:border-red-400/70"
          >
            Retry
          </button>
        </div>
      ) : null}

      {myShare ? (
        <div className="rounded-xl border border-will-purple/40 bg-will-purple/10 p-4">
          <span className="text-xs uppercase tracking-wide text-indigo-300">Your entitled share</span>
          <p className="mt-1 text-2xl font-semibold text-will-light">{formatUSDC(BigInt(myShare.share))} USDC</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-will-light/60">
            {publicKey
              ? 'The connected wallet is not one of this will\'s beneficiaries.'
              : 'Connect a wallet to see your entitled share.'}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">All beneficiaries</h2>
        <ul className="mt-2 space-y-1.5">
          {shares.map((row) => (
            <li key={row.address} className="flex justify-between text-sm">
              <CopyAddress address={row.address} className="text-will-light/80" />
              <span className="text-will-light">{formatUSDC(BigInt(row.share))} USDC</span>
            </li>
          ))}
        </ul>
      </div>

      {will.status === WillStatus.Released ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-will-light/70">
          This will has already been distributed to all beneficiaries in a single transaction.
        </div>
      ) : canClaim ? (
        <button
          type="button"
          onClick={handleClaim}
          disabled={claiming}
          className="w-full rounded-full bg-will-purple px-4 py-3 text-sm font-semibold text-white transition hover:bg-will-purple/90 disabled:opacity-60 active:scale-95"
        >
          {claiming ? 'Claiming…' : 'Claim Inheritance'}
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-will-light/60">
          This will isn&apos;t ready to release yet. Distribution only becomes available once the owner
          misses a check-in and the grace period has fully elapsed.
          {grace && secondsUntilClaim > 0 ? <time dateTime={grace.toISOString()} className="mt-2 block font-mono text-xs">Available in {Math.floor(secondsUntilClaim / 86400)}d {Math.floor((secondsUntilClaim % 86400) / 3600)}h {Math.floor((secondsUntilClaim % 3600) / 60)}m</time> : null}
        </div>
      )}

      {claimTxHash ? (
        <p className="text-center text-xs text-will-light/50">
          Submitted in{' '}
          <a
            href={stellarExpertUrl('tx', claimTxHash)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-will-purple hover:underline"
          >
            {truncateAddress(claimTxHash)}
          </a>
          <CopyAddress address={claimTxHash} label={null} className="ml-1" />
        </p>
      ) : null}
    </div>
  );
}
