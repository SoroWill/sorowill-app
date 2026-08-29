import { useState } from 'react';
import { GUARDIAN_THRESHOLD } from '@/lib/constants';
import { CopyAddress } from './CopyAddress';
import { useToast } from './Toast';

export interface GuardianPanelProps {
  guardians: string[];
  guardianVotes: number;
  willId?: string;
  isOwner?: boolean;
  isGuardian?: boolean;
  isActive?: boolean;
  isCastingVote?: boolean;
  hasVoted?: boolean;
  onCastVote?: () => void;
  error?: string | null;
}

export function GuardianPanel({
  guardians,
  guardianVotes,
  willId,
  isOwner = false,
  isGuardian = false,
  isActive = false,
  isCastingVote = false,
  hasVoted = false,
  onCastVote,
  error,
}: GuardianPanelProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const toast = useToast();

  if (guardians.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-white/5 p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg">👨‍⚖️</span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-will-light">No guardians</h3>
            <p className="mt-1 text-sm text-will-light/60">No guardians configured for this will. Guardians can force an early release if you&apos;re incapacitated.</p>
          </div>
        </div>
      </div>
    );
  }

  const handleCopy = async (index: number) => {
    if (typeof window === 'undefined' || !willId) return;
    const inviteUrl = `${window.location.origin}/guardian/onboard?willId=${willId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy invite link', err);
      toast.error('Failed to copy invite link. Please copy it manually.');
    }
  };

  const hasEnoughGuardians = guardians.length >= GUARDIAN_THRESHOLD;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4" aria-labelledby="guardians-heading">
      <div className="flex items-center justify-between">
        <h3 id="guardians-heading" className="text-sm font-semibold text-will-light">
          Guardians
        </h3>
        <span className="font-mono text-sm text-will-light/70" role="status" aria-label={`${Math.min(guardianVotes, GUARDIAN_THRESHOLD)} of ${GUARDIAN_THRESHOLD} guardian votes`}>
          {Math.min(guardianVotes, GUARDIAN_THRESHOLD)}/{GUARDIAN_THRESHOLD} votes
        </span>
      </div>
      <div
        className="mt-2 flex gap-1.5"
        role="progressbar"
        aria-valuenow={Math.min(guardianVotes, GUARDIAN_THRESHOLD)}
        aria-valuemin={0}
        aria-valuemax={GUARDIAN_THRESHOLD}
        aria-label="Guardian votes progress"
      >
        {Array.from({ length: GUARDIAN_THRESHOLD }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index < guardianVotes ? 'bg-will-purple' : 'bg-white/10'
            }`}
            aria-hidden="true"
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5" aria-label="Guardian addresses">
        {guardians.map((guardian, index) => (
          <li key={guardian} className="flex items-center justify-between font-mono text-sm text-will-light/80">
            <CopyAddress address={guardian} />
            {isOwner && willId ? (
              <button
                type="button"
                onClick={() => handleCopy(index)}
                className="text-xs text-will-purple hover:underline"
                aria-label={`Copy invite link for guardian ${index + 1}`}
              >
                {copiedIndex === index ? 'Copied!' : 'Copy invite link'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {isGuardian && isActive ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={onCastVote}
            disabled={isCastingVote || hasVoted}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500/90 disabled:opacity-60"
          >
            {hasVoted ? "You've already voted" : isCastingVote ? 'Casting vote…' : 'Cast guardian vote'}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <p className="mt-2 text-xs text-will-light/50" role={hasEnoughGuardians ? undefined : 'alert'}>
        {hasEnoughGuardians ? (
          <>Any {GUARDIAN_THRESHOLD} of {guardians.length} guardians can force an early release.</>
        ) : (
          <>
            <span className="font-medium text-amber-400">Guardian quorum can never be reached</span> with the current guardian count.{' '}
            {guardians.length} guardian{guardians.length === 1 ? '' : 's'} configured; this will needs at least {GUARDIAN_THRESHOLD} guardians to enable early release.
          </>
        )}
      </p>
    </section>
  );
}
