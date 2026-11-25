import { useCallback, useMemo, useRef, useState } from 'react';

import { toStroops } from '@sorowill/sdk';

import { getInvalidBatchAmounts, isValidAmount } from '@/lib/amount';
import type { BatchOperationStatus } from '@/lib/batchProgress';
import { formatError } from '@/lib/errors';
import { getSoroWillClient } from '@/lib/sorowill';
import { invalidateWillsCache } from '@/lib/willsCache';

export type BatchTopUpResult = {
  /** Per-operation status (#883): pending and running while the batch is in flight. */
  status: BatchOperationStatus;
  message: string;
  txHash?: string;
};

/** Keeps batch-top-up selection, validation, and submission isolated from the dashboard. */
export function useBatchTopUp(walletBalance: string | null) {
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedWillIds, setSelectedWillIds] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, BatchTopUpResult>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const cancelRequested = useRef(false);

  const invalidWillIds = useMemo(
    () => getInvalidBatchAmounts(selectedWillIds, amounts),
    [amounts, selectedWillIds],
  );
  const total = useMemo(
    () => selectedWillIds.reduce((sum, id) => {
      const amount = amounts[id];
      return amount && isValidAmount(amount) ? sum + toStroops(amount) : sum;
    }, 0n),
    [amounts, selectedWillIds],
  );
  const exceedsBalance = useMemo(() => {
    if (walletBalance === null) return false;
    try {
      return total > toStroops(walletBalance);
    } catch {
      return false;
    }
  }, [total, walletBalance]);

  const reset = useCallback(() => {
    setIsMultiSelectMode(false);
    setSelectedWillIds([]);
    setAmounts({});
    setResults({});
  }, []);

  const toggleMode = useCallback(() => {
    setIsMultiSelectMode((current) => !current);
    setSelectedWillIds([]);
    setAmounts({});
    setResults({});
  }, []);

  const select = useCallback((willId: string) => {
    setSelectedWillIds((current) => {
      if (!current.includes(willId)) return [...current, willId];
      setAmounts((currentAmounts) => {
        const next = { ...currentAmounts };
        delete next[willId];
        return next;
      });
      return current.filter((id) => id !== willId);
    });
  }, []);

  const setAmount = useCallback((willId: string, amount: string) => {
    setAmounts((current) => ({ ...current, [willId]: amount }));
  }, []);

  const submit = useCallback(async (onComplete: () => Promise<void>) => {
    if (selectedWillIds.length === 0 || exceedsBalance) return;

    setIsSubmitting(true);
    cancelRequested.current = false;
    setStartedAt(Date.now());
    // #883: every operation starts pending and is published as it progresses.
    const nextResults: Record<string, BatchTopUpResult> = Object.fromEntries(
      selectedWillIds.map((id) => [id, { status: 'pending' as const, message: 'Waiting' }]),
    );
    setResults({ ...nextResults });
    const client = getSoroWillClient();

    for (const willId of selectedWillIds) {
      if (cancelRequested.current) {
        nextResults[willId] = { status: 'cancelled', message: 'Cancelled' };
        setResults({ ...nextResults });
        continue;
      }
      const amount = amounts[willId];
      if (!amount || !isValidAmount(amount)) {
        nextResults[willId] = { status: 'error', message: 'Invalid or missing amount' };
        setResults({ ...nextResults });
        continue;
      }

      nextResults[willId] = { status: 'running', message: 'Submitting' };
      setResults({ ...nextResults });
      try {
        const response = await client.topUp(willId, toStroops(amount).toString());
        nextResults[willId] = { status: 'success', message: 'Top-up successful', txHash: response.txHash };
      } catch (error) {
        nextResults[willId] = { status: 'error', message: formatError(error) };
      }
      setResults({ ...nextResults });
    }

    invalidateWillsCache();
    setResults({ ...nextResults });
    setIsSubmitting(false);
    await onComplete();
  }, [amounts, exceedsBalance, selectedWillIds]);

  /** Stops the batch before its next operation (one already submitted cannot be recalled). */
  const cancel = useCallback(() => {
    cancelRequested.current = true;
  }, []);

  return {
    amounts,
    cancel,
    exceedsBalance,
    invalidWillIds,
    isMultiSelectMode,
    isSubmitting,
    reset,
    results,
    select,
    selectedWillIds,
    setAmount,
    startedAt,
    submit,
    toggleMode,
    total,
  };
}
