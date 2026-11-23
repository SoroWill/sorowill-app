'use client';

import { useEffect, useState } from 'react';
import { suggestAddresses, suggestSplits, type SplitSuggestion } from '@/lib/formSuggestions';

const CHIP =
  'rounded-full border border-white/20 px-3 py-1 text-xs text-will-light/80 transition hover:border-will-purple hover:text-will-light';

/**
 * Suggested percentage splits for the current number of beneficiaries (#882).
 * Clicking one fills the percentages; they stay editable afterwards.
 */
export function SplitSuggestions({ count, onApply }: { count: number; onApply: (percentages: number[]) => void }) {
  // Read after mount: learned suggestions come from localStorage.
  const [suggestions, setSuggestions] = useState<SplitSuggestion[]>([]);
  useEffect(() => setSuggestions(suggestSplits(count)), [count]);
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Suggested splits" role="group">
      <span className="text-xs text-will-light/60">Suggested splits:</span>
      {suggestions.map((suggestion) => (
        <button key={suggestion.label} type="button" className={CHIP} onClick={() => onApply(suggestion.percentages)}>
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}

/** Addresses this user often uses for `kind` (#882), offered as one-click fills. */
export function AddressSuggestions({
  kind,
  exclude,
  onPick,
  label,
}: {
  kind: 'beneficiaries' | 'guardians';
  exclude: string[];
  onPick: (address: string) => void;
  label: string;
}) {
  const [addresses, setAddresses] = useState<string[]>([]);
  const excludeKey = exclude.join('|');
  useEffect(() => setAddresses(suggestAddresses(kind, exclude)), [kind, excludeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (addresses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label} role="group">
      <span className="text-xs text-will-light/60">{label}:</span>
      {addresses.map((address) => (
        <button
          key={address}
          type="button"
          className={`${CHIP} font-mono`}
          title={address}
          aria-label={`Use ${address}`}
          onClick={() => onPick(address)}
        >
          {address.slice(0, 4)}…{address.slice(-4)}
        </button>
      ))}
    </div>
  );
}
