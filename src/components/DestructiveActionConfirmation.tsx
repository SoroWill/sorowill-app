'use client';

import { useEffect, useState } from 'react';

export interface GuardianVoteDetails {
  guardian: string;
  proposal: string;
  vote: 'approve' | 'reject';
}

export interface DestructiveActionConfirmationProps {
  isOpen: boolean;
  action: string;
  willId: string;
  confirmationType?: 'CONFIRM' | 'willId';
  details?: GuardianVoteDetails;
  consequences?: string;
  onConfirm: (willId: string) => void;
  onCancel: () => void;
}

export function DestructiveActionConfirmation({
  isOpen,
  action,
  willId,
  confirmationType = 'CONFIRM',
  details,
  consequences,
  onConfirm,
  onCancel,
}: DestructiveActionConfirmationProps) {
  const [inputText, setInputText] = useState('');

  // Clear input when modal closes
  useEffect(() => {
    if (!isOpen) {
      setInputText('');
    }
  }, [isOpen]);

  // Escape cancels, so keyboard users can dismiss without the mouse
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const expectedText = confirmationType === 'willId' ? willId : 'CONFIRM';
  const isConfirmed = inputText === expectedText;

  const isGuardianVote = action === 'guardian_vote';

  const derivedConsequences = isGuardianVote
    ? details?.vote === 'reject'
      ? 'Your rejection vote will be recorded on-chain and cannot be changed once submitted. If enough guardians reject, the proposal will fail.'
      : 'Your approval vote will be recorded on-chain and cannot be changed once submitted. If enough guardians approve, the proposal will be executed.'
    : undefined;

  const consequenceText = consequences ?? derivedConsequences;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="destructive-action-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-will-dark p-6 space-y-4">
        <h2 id="destructive-action-title" className="text-lg font-bold text-will-light">
          {action === 'cancel_will' && 'Cancel this will'}
          {action === 'switch_network' && 'Switch network'}
          {isGuardianVote && 'Confirm guardian vote'}
          {action !== 'cancel_will' && action !== 'switch_network' && !isGuardianVote && 'Destructive Action'}
        </h2>

        {isGuardianVote && details && (
          <dl className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-will-light/60">Guardian</dt>
              <dd className="font-mono text-will-light break-all text-right">{details.guardian}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-will-light/60">Proposal</dt>
              <dd className="font-mono text-will-light break-all text-right">{details.proposal}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-will-light/60">Vote</dt>
              <dd
                className={
                  details.vote === 'approve'
                    ? 'font-semibold text-emerald-400'
                    : 'font-semibold text-red-400'
                }
              >
                {details.vote === 'approve' ? 'Approve' : 'Reject'}
              </dd>
            </div>
          </dl>
        )}

        <div className="text-sm text-will-light/70 space-y-2">
          {action === 'switch_network' ? (
            <p>You may need to reconnect your wallet and switch the network inside your Freighter extension.</p>
          ) : isGuardianVote ? (
            consequenceText && <p className="font-semibold text-amber-400">{consequenceText}</p>
          ) : (
            <p className="font-semibold text-amber-400">This action cannot be undone.</p>
          )}
          {action === 'cancel_will' && (
            <p>Funds will not be released to beneficiaries once cancelled.</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-input" className="block text-xs text-will-light/60">
            {confirmationType === 'willId'
              ? `Type the will id "${willId}" to confirm:`
              : 'Type "CONFIRM" to proceed:'}
          </label>
          <input
            id="confirm-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={confirmationType === 'willId' ? 'type the will id' : 'type "CONFIRM"'}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-will-light focus:border-will-purple focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-will-light hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(willId)}
            disabled={!isConfirmed}
            className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}