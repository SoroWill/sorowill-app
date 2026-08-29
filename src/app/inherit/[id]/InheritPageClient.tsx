'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { calculateShares, formatUSDC, WillStatus, type Will } from '@sorowill/sdk';

import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import { getSoroWillClient, stellarExpertUrl } from '@/lib/sorowill';
import { formatError } from '@/lib/errors';
import { graceDeadline } from '@/lib/deadlines';
import { useToast } from '@/components/Toast';
import { StatusBanner } from '@/components/StatusBanner';
import { CopyAddress } from '@/components/CopyAddress';

function isValidWillId(id: string): boolean {
  return /^\d+$/.test(id);
}

export default function InheritPageClient({ id }: { id: string }) {
  const toast = useToast();
  const willId = id;

  const [will, setWill] = useState<Will | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    try {
      const fetched = await getSoroWillClient().getWill(willId);
      if (!isMounted.current) {
        return;
      }
      setWill(fetched);
      setError(null);
    } catch (err) {
      if (!isMounted.current) {
        return;
      }
      setError(formatError(err));
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, [willId]);

  useEffect(() => {
    void safeGetPublicKey().then((key) => {
      if (isMounted.current) {
        setPublicKey(key);
      }
    });
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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
        <h1 className="text-lg font-semibold text-red-300">Couldn&apos;t load this will</h1>
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
  const canClaim = will.status === WillStatus.Triggered && grace !== null && Date.now() >= grace.getTime();

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
