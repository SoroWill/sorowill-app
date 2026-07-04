import { truncateAddress } from '@/lib/freighter';

const GUARDIAN_THRESHOLD = 2;

export interface GuardianPanelProps {
  guardians: string[];
  guardianVotes: number;
}

export function GuardianPanel({ guardians, guardianVotes }: GuardianPanelProps) {
  if (guardians.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-will-light">Guardians</h3>
        <p className="mt-1 text-sm text-will-light/60">No guardians configured for this will.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-will-light">Guardians</h3>
        <span className="font-mono text-sm text-will-light/70">
          {Math.min(guardianVotes, GUARDIAN_THRESHOLD)}/{GUARDIAN_THRESHOLD} votes
        </span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: GUARDIAN_THRESHOLD }).map((_, index) => (
          <span
            key={index}
            className={`h-1.5 flex-1 rounded-full ${
              index < guardianVotes ? 'bg-will-purple' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {guardians.map((guardian) => (
          <li key={guardian} className="font-mono text-sm text-will-light/80">
            {truncateAddress(guardian)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-will-light/50">
        Any {GUARDIAN_THRESHOLD} of {guardians.length} guardians can force an early release.
      </p>
    </div>
  );
}
