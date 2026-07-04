'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import {
  calculateShares,
  formatUSDC,
  toStroops,
  validateBeneficiaries,
  WillStatus,
  type Beneficiary,
  type Will,
} from '@sorowill/sdk';

import { safeGetPublicKey, truncateAddress } from '@/lib/freighter';
import { getSoroWillClient, stellarExpertUrl } from '@/lib/sorowill';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { CountdownTimer } from '@/components/CountdownTimer';
import { GuardianPanel } from '@/components/GuardianPanel';
import { StatusBanner } from '@/components/StatusBanner';

interface ActivityEntry {
  action: string;
  txHash: string;
  at: Date;
}

function nextCheckinDeadline(will: Will): Date {
  return new Date(will.lastCheckin.getTime() + will.checkinPeriodDays * 86_400 * 1000);
}

function graceDeadline(will: Will): Date | null {
  if (!will.triggerTime) {
    return null;
  }
  return new Date(will.triggerTime.getTime() + will.gracePeriodDays * 86_400 * 1000);
}

export default function WillDetailPage() {
  const params = useParams<{ id: string }>();
  const willId = params.id;

  const [will, setWill] = useState<Will | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [showEditBeneficiaries, setShowEditBeneficiaries] = useState(false);
  const [draftBeneficiaries, setDraftBeneficiaries] = useState<Beneficiary[]>([]);

  const refetch = useCallback(async () => {
    try {
      const fetched = await getSoroWillClient().getWill(willId);
      setWill(fetched);
      setDraftBeneficiaries(fetched.beneficiaries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load will');
    } finally {
      setLoading(false);
    }
  }, [willId]);

  useEffect(() => {
    safeGetPublicKey().then(setPublicKey);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function recordActivity(action: string, txHash: string) {
    setActivity((prev) => [{ action, txHash, at: new Date() }, ...prev]);
  }

  async function runAction(name: string, fn: () => Promise<{ txHash: string }>) {
    setBusyAction(name);
    setError(null);
    try {
      const { txHash } = await fn();
      recordActivity(name, txHash);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${name} failed`);
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !will) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">Couldn&apos;t load this will</h1>
        <p className="mt-2 text-sm text-red-300/70">{error}</p>
      </div>
    );
  }

  if (!will) {
    return null;
  }

  const isOwner = publicKey === will.owner;
  const client = getSoroWillClient();

  const checkinDeadline = nextCheckinDeadline(will);
  const checkinOverdue = will.status === WillStatus.Active && Date.now() >= checkinDeadline.getTime();

  const grace = graceDeadline(will);
  const graceExpired = will.status === WillStatus.Triggered && grace !== null && Date.now() >= grace.getTime();

  const shares = calculateShares(will.balance, will.beneficiaries);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-will-light">Will #{will.id}</h1>
        <p className="text-sm text-will-light/50">Owner: {truncateAddress(will.owner)}</p>
      </div>

      <StatusBanner status={will.status} />

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <span className="text-xs uppercase tracking-wide text-will-light/60">Locked balance</span>
          <p className="mt-1 text-2xl font-semibold text-will-light">{formatUSDC(BigInt(will.balance))} USDC</p>
        </div>

        {will.status === WillStatus.Active ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <CountdownTimer deadline={checkinDeadline} label="Next check-in due" />
          </div>
        ) : will.status === WillStatus.Triggered && grace ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <CountdownTimer deadline={grace} label="Grace period ends" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {isOwner && will.status === WillStatus.Active ? (
          <button
            type="button"
            onClick={() => runAction('check_in', () => client.checkIn(will.id))}
            disabled={busyAction !== null}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
          >
            {busyAction === 'check_in' ? 'Checking in…' : 'Check In'}
          </button>
        ) : null}

        {isOwner && will.status === WillStatus.Triggered && !graceExpired ? (
          <button
            type="button"
            onClick={() => runAction('emergency_checkin', () => client.emergencyCheckIn(will.id))}
            disabled={busyAction !== null}
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500/90 disabled:opacity-60"
          >
            {busyAction === 'emergency_checkin' ? 'Submitting…' : 'Emergency Check In'}
          </button>
        ) : null}

        {!isOwner || will.status === WillStatus.Active ? (
          checkinOverdue ? (
            <button
              type="button"
              onClick={() => runAction('trigger_will', () => client.triggerWill(will.id))}
              disabled={busyAction !== null}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500/90 disabled:opacity-60"
            >
              {busyAction === 'trigger_will' ? 'Triggering…' : 'Trigger Will'}
            </button>
          ) : null
        ) : null}

        {graceExpired ? (
          <button
            type="button"
            onClick={() => runAction('release_inheritance', () => client.releaseInheritance(will.id))}
            disabled={busyAction !== null}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
          >
            {busyAction === 'release_inheritance' ? 'Releasing…' : 'Release Inheritance'}
          </button>
        ) : null}

        {isOwner && will.status === WillStatus.Active ? (
          <>
            <button
              type="button"
              onClick={() => setShowTopUp((s) => !s)}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40"
            >
              Top Up
            </button>
            <button
              type="button"
              onClick={() => setShowEditBeneficiaries((s) => !s)}
              className="rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40"
            >
              Update Beneficiaries
            </button>
            <button
              type="button"
              onClick={() => runAction('cancel_will', () => client.cancelWill(will.id))}
              disabled={busyAction !== null}
              className="rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70 disabled:opacity-60"
            >
              {busyAction === 'cancel_will' ? 'Cancelling…' : 'Cancel Will'}
            </button>
          </>
        ) : null}
      </div>

      {showTopUp ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="text-sm font-medium text-will-light">Top up amount (USDC)</label>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={0}
              step="0.01"
              value={topUpAmount}
              onChange={(event) => setTopUpAmount(event.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                await runAction('top_up', () => client.topUp(will.id, toStroops(topUpAmount).toString()));
                setTopUpAmount('');
                setShowTopUp(false);
              }}
              disabled={busyAction !== null || !topUpAmount}
              className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Confirm
            </button>
          </div>
        </div>
      ) : null}

      {showEditBeneficiaries ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <BeneficiaryForm value={draftBeneficiaries} onChange={setDraftBeneficiaries} />
          <button
            type="button"
            onClick={async () => {
              await runAction('update_beneficiaries', () =>
                client.updateBeneficiaries({ willId: will.id, beneficiaries: draftBeneficiaries }),
              );
              setShowEditBeneficiaries(false);
            }}
            disabled={busyAction !== null || !validateBeneficiaries(draftBeneficiaries)}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save Beneficiaries
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Beneficiaries</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-will-light/50">
              <th className="pb-2 font-medium">Address</th>
              <th className="pb-2 font-medium">Percentage</th>
              <th className="pb-2 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((row, index) => (
              <tr key={row.address} className="border-t border-white/5">
                <td className="py-2 font-mono text-will-light">{truncateAddress(row.address)}</td>
                <td className="py-2 text-will-light/70">{will.beneficiaries[index]?.percentage}%</td>
                <td className="py-2 text-will-light">{formatUSDC(BigInt(row.share))} USDC</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GuardianPanel guardians={will.guardians} guardianVotes={will.guardianVotes} />

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-will-light/50">No actions taken yet this session.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {activity.map((entry) => (
              <li key={entry.txHash} className="flex items-center justify-between text-sm">
                <span className="text-will-light/80">{entry.action.replace(/_/g, ' ')}</span>
                <a
                  href={stellarExpertUrl('tx', entry.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-will-purple hover:underline"
                >
                  {truncateAddress(entry.txHash)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
