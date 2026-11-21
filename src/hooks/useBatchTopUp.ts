import { useCallback, useMemo, useState } from 'react';

import { toStroops } from '@sorowill/sdk';

import { getInvalidBatchAmounts, isValidAmount } from '@/lib/amount';
import { formatError } from '@/lib/errors';
import { getSoroWillClient } from '@/lib/sorowill';

export type BatchTopUpResult = {
  status: 'success' | 'error';
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
    setResults({});
    const nextResults: Record<string, BatchTopUpResult> = {};
    const client = getSoroWillClient();

    for (const willId of selectedWillIds) {
      const amount = amounts[willId];
      if (!amount || !isValidAmount(amount)) {
        nextResults[willId] = { status: 'error', message: 'Invalid or missing amount' };
        continue;
      }

      try {
        const response = await client.topUp(willId, toStroops(amount).toString());
        nextResults[willId] = { status: 'success', message: 'Top-up successful', txHash: response.txHash };
      } catch (error) {
        nextResults[willId] = { status: 'error', message: formatError(error) };
      }
    }

    setResults(nextResults);
    setIsSubmitting(false);
    await onComplete();
  }, [amounts, exceedsBalance, selectedWillIds]);

  return {
    amounts,
    exceedsBalance,
    invalidWillIds,
    isMultiSelectMode,
    isSubmitting,
    reset,
    results,
    select,
    selectedWillIds,
    setAmount,
    submit,
    toggleMode,
    total,
  };
}
