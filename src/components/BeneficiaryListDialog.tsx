'use client';

import { useEffect, useRef } from 'react';

import type { Will } from '@sorowill/sdk';

export interface BeneficiaryListDialogProps {
  willId: string;
  beneficiaries: Will['beneficiaries'];
  onClose: () => void;
}

/** Modal with every beneficiary of a will, for cards that only show the first few (#821). */
export function BeneficiaryListDialog({ willId, beneficiaries, onClose }: BeneficiaryListDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const titleId = `beneficiaries-title-${willId}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-will-dark p-6 text-will-light"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold">
            Beneficiaries of will #{willId} ({beneficiaries.length})
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close beneficiary list"
            className="rounded-full border border-white/20 px-3 py-1 text-sm text-will-light/80 hover:border-white/40"
          >
            Close
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {beneficiaries.map((beneficiary) => (
            <li
              key={beneficiary.address}
              className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <span className="break-all font-mono text-xs text-will-light/80">{beneficiary.address}</span>
              <span className="shrink-0 font-medium">{beneficiary.percentage}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
