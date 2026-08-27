'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';

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
import { formatError } from '@/lib/errors';
import { useToast } from '@/components/Toast';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { CountdownTimer } from '@/components/CountdownTimer';
import { GuardianPanel } from '@/components/GuardianPanel';
import { StatusBanner } from '@/components/StatusBanner';
import { CopyAddress } from '@/components/CopyAddress';
import { isTopUpAmountValid } from '@/lib/amount';

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

function guardianVoteKey(willId: string, guardian: string): string {
  return `sorowill:guardian-voted:${willId}:${guardian}`;
}

function hasGuardianVoted(willId: string, guardian: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(guardianVoteKey(willId, guardian)) === 'true';
}

function markGuardianVoted(willId: string, guardian: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(guardianVoteKey(willId, guardian), 'true');
}

function getGuardianVoteErrorMessage(err: unknown): string {
  const message = formatError(err);
  const normalized = message.toLowerCase();

  if (normalized.includes('already voted')) {
    return 'This guardian has already cast a vote for this will.';
  }

  if (normalized.includes('not a guardian') || normalized.includes('not guardian')) {
    return 'Only listed guardians can cast a vote for this will.';
  }

  return formatError(err);
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isValidWillId(id: string): boolean {
  return /^\d+$/.test(id);
}

export default function WillDetailPage() {
  const toast = useToast();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const willId = params.id;

  // All hooks must be called before any conditional returns
  const [will, setWill] = useState<Will | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [castingVoteId, setCastingVoteId] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [exportingCertificate, setExportingCertificate] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [showEditBeneficiaries, setShowEditBeneficiaries] = useState(false);
  const [draftBeneficiaries, setDraftBeneficiaries] = useState<Beneficiary[]>([]);
  const showEditBeneficiariesRef = useRef(false);
  useEffect(() => {
    if (!showEditBeneficiaries && will) {
      setDraftBeneficiaries(will.beneficiaries);
    }
  }, [showEditBeneficiaries, will]);

  const [showEarlyRelease, setShowEarlyRelease] = useState(false);
  const [earlyReleaseAmount, setEarlyReleaseAmount] = useState('');
  const [earlyReleaseRecipient, setEarlyReleaseRecipient] = useState('');
  const [reminderEmail, setReminderEmail] = useState('');
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);
  const [reminderPending, setReminderPending] = useState(false);

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
      setDraftBeneficiaries(fetched.beneficiaries);
      setLastFetchTime(new Date());
      // Only reset draft beneficiaries when the edit panel is not open,
      // otherwise in-progress edits would be silently overwritten.
      if (!showEditBeneficiariesRef.current) {
        setDraftBeneficiaries(fetched.beneficiaries);
      }
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

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fetched = await getSoroWillClient().getWill(willId);
      setWill(fetched);
      setDraftBeneficiaries(fetched.beneficiaries);
      setLastFetchTime(new Date());
      setError(null);
      toast.success('Data refreshed');
    } catch (err) {
      const message = formatError(err);
      setError(message);
      toast.error(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [willId, toast]);

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

  function recordActivity(action: string, txHash: string) {
    setActivity((prev) => [{ action, txHash, at: new Date() }, ...prev]);
  }

  async function handleExportCertificate() {
    if (!will) {
      return;
    }
    setExportingCertificate(true);
    setError(null);
    try {
      const { downloadWillCertificate } = await import('@/lib/certificate');
      const verifyUrl = `${window.location.origin}/verify/${will.id}`;
      await downloadWillCertificate(will, verifyUrl);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setExportingCertificate(false);
    }
  }

  async function runAction(
    name: string,
    fn: () => Promise<{ txHash: string }>,
    errorMessage?: (err: unknown) => string,
    onSuccess?: () => void,
  ) {
    setBusyAction(name);
    setError(null);
    try {
      const { txHash } = await fn();
      recordActivity(name, txHash);
      await refetch();
      const actionLabel = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      toast.success(`${actionLabel} successful`);
      onSuccess?.();
    } catch (err) {
      const message = errorMessage ? errorMessage(err) : formatError(err);
      setError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReminderSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!will) {
      setReminderStatus('The will details are still loading.');
      return;
    }

    setReminderPending(true);
    setReminderStatus(null);

    try {
      const response = await fetch('/api/reminders/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          willId: will.id,
          email: reminderEmail,
          owner: will.owner,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to register reminder');
      }
      setReminderStatus(`Reminder enabled for ${payload.subscription.email}.`);
      setReminderEmail('');
    } catch (err) {
      const message = formatError(err);
      setReminderStatus(message);
    } finally {
      setReminderPending(false);
    }
  }

  // Quick client-side validation before hitting the RPC layer
  if (!willId || !isValidWillId(willId)) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">Invalid will ID</h1>
        <p className="mt-2 text-sm text-red-300/70">
          &ldquo;{willId}&rdquo; is not a valid will identifier. Will IDs must be non-negative integers.
        </p>
      </div>
    );
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

  const isOwner = publicKey === will.owner;
  const isGuardian = !!publicKey && will.guardians.includes(publicKey);
  const guardianHasVoted = isGuardian && (hasVoted || hasGuardianVoted(will.id, publicKey as string));
  const isBeneficiary = !!publicKey && will.beneficiaries.some((b) => b.address === publicKey);
  const role = isOwner ? 'Owner' : isGuardian ? 'Guardian' : isBeneficiary ? 'Beneficiary' : 'Viewing as guest';
  const client = getSoroWillClient();

  const isTopUpValid = isTopUpAmountValid(topUpAmount);

  const checkinDeadline = nextCheckinDeadline(will);
  const checkinOverdue = will.status === WillStatus.Active && Date.now() >= checkinDeadline.getTime();

  const grace = graceDeadline(will);
  const graceExpired = will.status === WillStatus.Triggered && grace !== null && Date.now() >= grace.getTime();

  const shares = calculateShares(will.balance, will.beneficiaries);
  const beneficiaryMap = new Map(will.beneficiaries.map((b) => [b.address, b.percentage]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print-section">
        <div>
          <h1 className="text-2xl font-bold text-will-light print-title">Will #{will.id}</h1>
          <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${isOwner ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : isGuardian ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : isBeneficiary ? 'bg-will-purple/20 text-indigo-200 border-will-purple/40' : 'bg-white/10 text-will-light/60 border-white/20'}`}>
            {role}
          </span>
          <p className="text-sm text-will-light/50 print-text">
            Owner:{' '}
            <a
              href={stellarExpertUrl('account', will.owner)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-will-purple hover:underline"
            >
              {truncateAddress(will.owner)}
            </a>
            <CopyAddress address={will.owner} label={null} className="ml-1" />
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="print-hide rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:cursor-not-allowed disabled:opacity-60"
            title="Refresh on-chain data"
          >
            {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button
            type="button"
            onClick={handleExportCertificate}
            disabled={exportingCertificate}
            className="print-hide rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 hover:text-will-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exportingCertificate ? 'Generating…' : 'Export Certificate (PDF)'}
          </button>
        </div>
      </div>

      <div className="print-hide flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-will-light/60">
        <span>Last updated {formatTimeAgo(lastFetchTime)}</span>
      </div>

      <StatusBanner status={will.status} />

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-red-500/30 bg-red-500/10 p-4 print-hide">
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

      <div className="print-section grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <span className="text-xs uppercase tracking-wide text-will-light/60 print-text">Locked balance</span>
          <p className="mt-1 text-2xl font-semibold text-will-light print-text">{formatUSDC(BigInt(will.balance))} USDC</p>
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

      <div className="print-hide flex flex-col gap-2 sm:flex-wrap sm:flex-row">
        {isOwner && will.status === WillStatus.Active ? (
          <button
            type="button"
            onClick={() => runAction('check_in', () => client.checkIn(will.id))}
            disabled={busyAction !== null}
            className="w-full rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === 'check_in' ? 'Checking in…' : 'Check In'}
          </button>
        ) : null}

        {isOwner && will.status === WillStatus.Triggered && !graceExpired ? (
          <button
            type="button"
            onClick={() => runAction('emergency_checkin', () => client.emergencyCheckIn(will.id))}
            disabled={busyAction !== null}
            className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500/90 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === 'emergency_checkin' ? 'Submitting…' : 'Emergency Check In'}
          </button>
        ) : null}

        {!isOwner && checkinOverdue ? (
            <button
              type="button"
              onClick={() => runAction('trigger_will', () => client.triggerWill(will.id))}
              disabled={busyAction !== null || !publicKey}
              title={!publicKey ? 'Connect your wallet first' : undefined}
              className="w-full rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500/90 disabled:opacity-60 sm:w-auto"
            >
              {busyAction === 'trigger_will' ? 'Triggering…' : 'Trigger Will'}
            </button>
          ) : null}

        {graceExpired ? (
          <button
            type="button"
            onClick={() => runAction('release_inheritance', () => client.releaseInheritance(will.id))}
            disabled={busyAction !== null || !publicKey}
            title={!publicKey ? 'Connect your wallet first' : undefined}
            className="w-full rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === 'release_inheritance' ? 'Releasing…' : 'Release Inheritance'}
          </button>
        ) : null}

        {isOwner && will.status === WillStatus.Active ? (
          <>
            <button
              type="button"
              onClick={() => { setError(null); setShowTopUp((s) => !s); }}
              className="w-full rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 sm:w-auto"
            >
              Top Up
            </button>
            <button
              type="button"
              onClick={() => setShowEarlyRelease((s) => !s)}
              className="w-full rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 sm:w-auto"
              title="Coming soon: requires SDK support"
            >
              Release Early
            </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setShowEditBeneficiaries((s) => {
                    const next = !s;
                    showEditBeneficiariesRef.current = next;
                    return next;
                  });
                }}
                className="w-full rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 sm:w-auto"
              >
                Update Beneficiaries
              </button>
            <button
              type="button"
              onClick={() => router.push(`/will/new?cloneFrom=${will.id}`)}
              className="w-full rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 sm:w-auto"
              title="Coming soon: requires SDK support"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => runAction('cancel_will', () => client.cancelWill(will.id))}
              disabled={busyAction !== null}
              className="w-full rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70 disabled:opacity-60 sm:w-auto"
            >
              {busyAction === 'cancel_will' ? 'Cancelling…' : 'Cancel Will'}
            </button>
          </>
        ) : null}
      </div>

      {isOwner && will.status === WillStatus.Active ? (
        <div className="print-hide rounded-xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-sm font-semibold text-will-light">Check-in reminders</h2>
          <p className="mt-1 text-sm text-will-light/60">
            Receive an email 2+ weeks before the deadline and again when it&apos;s imminent.
          </p>
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={handleReminderSubscribe}>
            <input
              type="email"
              value={reminderEmail}
              onChange={(event) => setReminderEmail(event.target.value)}
              placeholder="you@example.com"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={reminderPending}
              className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-will-purple/90 disabled:opacity-60"
            >
              {reminderPending ? 'Saving…' : 'Enable reminders'}
            </button>
          </form>
          {reminderStatus ? <p className="mt-2 text-sm text-will-light/70">{reminderStatus}</p> : null}
        </div>
      ) : null}

      {showTopUp ? (
        <form
          className="print-hide rounded-xl border border-white/10 bg-white/5 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isTopUpValid) return;
            await runAction('top_up', () => client.topUp(will.id, toStroops(topUpAmount).toString()));
            setTopUpAmount('');
            setShowTopUp(false);
          }}
        >
          <label htmlFor="topup-amount" className="text-sm font-medium text-will-light">
            Top up amount (USDC)
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="topup-amount"
              type="number"
              min={0}
              step="0.01"
              value={topUpAmount}
              onChange={(event) => {
                const val = event.target.value;
                if (val !== '' && Number(val) < 0) {
                  setTopUpAmount('0');
                } else {
                  setTopUpAmount(val);
                }
              }}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              aria-label="Top up amount in USDC"
            />
            <button
              type="submit"
              disabled={busyAction !== null || !isTopUpValid}
              className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
            >
              Confirm
            </button>
          </div>
        </form>
      ) : null}

      {showEarlyRelease ? (
        <div className="print-hide rounded-xl border border-will-purple/40 bg-will-purple/10 p-4">
          <h3 className="text-sm font-semibold text-will-light">Release early to beneficiary</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor="early-release-amount" className="text-xs text-will-light/70">
                Amount (USDC)
              </label>
              <input
                id="early-release-amount"
                type="number"
                min={0}
                step="0.01"
                value={earlyReleaseAmount}
                onChange={(event) => {
                  const val = event.target.value;
                  if (val !== '' && Number(val) < 0) {
                    setEarlyReleaseAmount('0');
                  } else {
                    setEarlyReleaseAmount(val);
                  }
                }}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg border border-will-purple/30 bg-will-purple/5 px-3 py-2 text-sm text-will-light focus:border-will-purple focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="early-release-recipient" className="text-xs text-will-light/70">
                Recipient address
              </label>
              <input
                id="early-release-recipient"
                type="text"
                value={earlyReleaseRecipient}
                onChange={(event) => setEarlyReleaseRecipient(event.target.value)}
                placeholder="Stellar address (G...)"
                className="mt-1 w-full rounded-lg border border-will-purple/30 bg-will-purple/5 px-3 py-2 font-mono text-sm text-will-light placeholder:text-will-light/40 focus:border-will-purple focus:outline-none"
              />
            </div>
            <p className="text-xs text-will-light/50">
              Note: Partial early release requires SDK support (coming soon)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setShowEarlyRelease(false);
                  setEarlyReleaseAmount('');
                  setEarlyReleaseRecipient('');
                }}
                className="w-full rounded-full border border-white/20 px-4 py-2 text-sm text-will-light/80 transition hover:border-white/40 sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditBeneficiaries ? (
        <div className="print-hide space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <BeneficiaryForm value={draftBeneficiaries} onChange={setDraftBeneficiaries} />
          <button
            type="button"
            onClick={async () => {
              await runAction('update_beneficiaries', () =>
                client.updateBeneficiaries({ willId: will.id, beneficiaries: draftBeneficiaries }),
              );
              setShowEditBeneficiaries(false);
            }}
            disabled={busyAction !== null || !validateBeneficiaries(draftBeneficiaries) || !draftBeneficiaries.every((b) => b.address.trim() !== '')}
            className="rounded-full bg-will-purple px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Save Beneficiaries
          </button>
        </div>
      ) : null}

      <div className="print-section rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light print-heading">Beneficiaries</h2>
        <table className="mt-3 w-full text-sm print-table">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-will-light/50">
              <th className="pb-2 font-medium">Address</th>
              <th className="pb-2 font-medium">Percentage</th>
              <th className="pb-2 font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((row) => (
              <tr key={row.address} className="border-t border-white/5">
                <td className="py-2 font-mono text-will-light">
                  <a
                    href={stellarExpertUrl('account', row.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-will-purple hover:underline"
                  >
                    {truncateAddress(row.address)}
                  </a>
                  <CopyAddress address={row.address} label={null} className="ml-1" />
                </td>
                <td className="py-2 text-will-light/70">{beneficiaryMap.get(row.address)}%</td>
                <td className="py-2 text-will-light">{formatUSDC(BigInt(row.share))} USDC</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="print-hide">
        <GuardianPanel
          guardians={will.guardians}
          guardianVotes={will.guardianVotes}
          isGuardian={isGuardian}
          isActive={will.status === WillStatus.Active}
          isCastingVote={castingVoteId === will.id}
          hasVoted={guardianHasVoted}
          onCastVote={() => {
            setCastingVoteId(will.id);
            void runAction(
              'cast_guardian_vote',
              () => client.guardianTrigger(will.id),
              getGuardianVoteErrorMessage,
              () => {
                if (publicKey) {
                  markGuardianVoted(will.id, publicKey);
                  setHasVoted(true);
                }
              },
            ).finally(() => setCastingVoteId(null));
          }}
          error={error}
        />
      </div>

      <div className="print-hide rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Recent activity (this session)</h2>
        {activity.length === 0 ? (
          <div className="mt-2 flex items-center gap-2 text-sm text-will-light/60">
            <span>📋</span>
            <p>No actions recorded yet in this session. Activity is only tracked during the current browser session and does not persist across page reloads.</p>
          </div>
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
                <CopyAddress address={entry.txHash} label={null} className="ml-1" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
