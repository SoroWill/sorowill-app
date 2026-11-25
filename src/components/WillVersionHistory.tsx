'use client';

import { useEffect, useState } from 'react';
import type { Beneficiary, Will } from '@sorowill/sdk';
import { diffWillVersions, recordWillVersion, type WillVersion } from '@/lib/willVersions';

function short(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function when(ms: number) {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/**
 * Compare two versions of a will (#885): before/after values with the
 * differences highlighted and their timestamps. An owner can load an earlier
 * beneficiary list back into the edit form; nothing is sent on-chain until
 * they submit it.
 */
export function WillVersionHistory({
  will,
  onRevert,
  canRevert,
}: {
  will: Will;
  onRevert: (beneficiaries: Beneficiary[]) => void;
  canRevert: boolean;
}) {
  const [versions, setVersions] = useState<WillVersion[]>([]);
  const [beforeIndex, setBeforeIndex] = useState(0);
  const [afterIndex, setAfterIndex] = useState(0);

  useEffect(() => {
    const history = recordWillVersion(will);
    setVersions(history);
    setAfterIndex(history.length - 1);
    setBeforeIndex(Math.max(0, history.length - 2));
  }, [will]);

  if (versions.length < 2) {
    return (
      <section aria-label="Version history" className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-sm font-semibold text-will-light">Version history</h2>
        <p className="mt-1 text-xs text-will-light/60">
          No earlier versions seen on this device yet. Changes are recorded each time you open this will.
        </p>
      </section>
    );
  }

  const before = versions[beforeIndex];
  const after = versions[afterIndex];
  const diff = diffWillVersions(before, after);
  const unchanged = diff.fields.length === 0 && diff.beneficiaries.length === 0;

  const picker = (value: number, onChange: (v: number) => void, id: string, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-will-light/70" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border border-white/10 bg-will-dark px-2 py-1 text-xs text-will-light"
      >
        {versions.map((version, index) => (
          <option key={version.capturedAt} value={index}>
            {when(version.capturedAt)}
            {index === versions.length - 1 ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-label="Version history" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-will-light">Compare versions</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {picker(beforeIndex, setBeforeIndex, 'version-before', 'Before')}
        {picker(afterIndex, setAfterIndex, 'version-after', 'After')}
      </div>

      {unchanged ? (
        <p className="text-xs text-will-light/60">No differences between these versions.</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-will-light/50">
              <th scope="col" className="py-1 font-medium">Field</th>
              <th scope="col" className="py-1 font-medium">Before ({when(before.capturedAt)})</th>
              <th scope="col" className="py-1 font-medium">After ({when(after.capturedAt)})</th>
            </tr>
          </thead>
          <tbody>
            {diff.fields.map((change) => (
              <tr key={change.field} data-change="changed">
                <th scope="row" className="py-1 font-normal text-will-light/70">{change.label}</th>
                <td className="py-1 text-red-300 line-through">{change.before}</td>
                <td className="py-1 text-emerald-300">{change.after}</td>
              </tr>
            ))}
            {diff.beneficiaries.map((change) => (
              <tr key={`${change.kind}-${change.address}`} data-change={change.kind}>
                <th scope="row" className="py-1 font-mono font-normal text-will-light/70" title={change.address}>
                  {short(change.address)}
                </th>
                <td className={`py-1 ${change.kind === 'added' ? 'text-will-light/40' : 'text-red-300 line-through'}`}>
                  {change.kind === 'added' ? '—' : `${change.before}%`}
                </td>
                <td className={`py-1 ${change.kind === 'removed' ? 'text-will-light/40' : 'text-emerald-300'}`}>
                  {change.kind === 'removed' ? 'removed' : `${change.after}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canRevert && beforeIndex !== versions.length - 1 ? (
        <button
          type="button"
          onClick={() => onRevert(before.beneficiaries)}
          className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-will-light/80 transition hover:border-white/40"
        >
          Revert beneficiaries to the &ldquo;before&rdquo; version
        </button>
      ) : null}
      {canRevert ? (
        <p className="text-xs text-will-light/50">Reverting fills the edit form below; review and submit it to apply.</p>
      ) : null}
    </section>
  );
}
