import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toStroops } from '@sorowill/sdk';

import { useBatchTopUp } from '@/hooks/useBatchTopUp';

const { topUp } = vi.hoisted(() => ({ topUp: vi.fn() }));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({ topUp }),
}));

vi.mock('@/lib/errors', () => ({
  formatError: (error: unknown) => `formatted: ${error instanceof Error ? error.message : String(error)}`,
}));

beforeEach(() => {
  topUp.mockReset();
});

/** Selects the given wills and fills in their amounts. */
function setup(walletBalance: string | null, picks: Record<string, string>) {
  const hook = renderHook(() => useBatchTopUp(walletBalance));
  act(() => hook.result.current.toggleMode());
  for (const [willId, amount] of Object.entries(picks)) {
    act(() => hook.result.current.select(willId));
    act(() => hook.result.current.setAmount(willId, amount));
  }
  return hook;
}

describe('useBatchTopUp — selection', () => {
  it('starts with nothing selected and multi-select off', () => {
    const { result } = renderHook(() => useBatchTopUp('100'));
    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedWillIds).toEqual([]);
    expect(result.current.total).toBe(0n);
    expect(result.current.isSubmitting).toBe(false);
  });

  it('turns multi-select on and off, clearing the selection each time', () => {
    const { result } = renderHook(() => useBatchTopUp('100'));
    act(() => result.current.toggleMode());
    act(() => result.current.select('1'));
    expect(result.current.isMultiSelectMode).toBe(true);
    expect(result.current.selectedWillIds).toEqual(['1']);

    act(() => result.current.toggleMode());
    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedWillIds).toEqual([]);
  });

  it('selects a will once and unselects it on the second call, dropping its amount', () => {
    const { result } = renderHook(() => useBatchTopUp('100'));
    act(() => result.current.select('7'));
    act(() => result.current.setAmount('7', '5'));
    expect(result.current.selectedWillIds).toEqual(['7']);
    expect(result.current.amounts).toEqual({ 7: '5' });

    act(() => result.current.select('7'));
    expect(result.current.selectedWillIds).toEqual([]);
    expect(result.current.amounts).toEqual({});
  });

  it('keeps the order in which wills were selected', () => {
    const { result } = renderHook(() => useBatchTopUp('100'));
    act(() => result.current.select('3'));
    act(() => result.current.select('1'));
    act(() => result.current.select('2'));
    expect(result.current.selectedWillIds).toEqual(['3', '1', '2']);
  });

  it('reset leaves multi-select and clears selection, amounts and results', () => {
    const { result } = setup('100', { '1': '5' });
    act(() => result.current.reset());
    expect(result.current.isMultiSelectMode).toBe(false);
    expect(result.current.selectedWillIds).toEqual([]);
    expect(result.current.amounts).toEqual({});
    expect(result.current.results).toEqual({});
  });
});

describe('useBatchTopUp — validation', () => {
  it('lists selected wills whose amount is missing, zero, negative or in scientific notation', () => {
    const { result } = setup('1000', { '1': '5', '2': '', '3': '0', '4': '-3', '5': '1e5' });
    act(() => result.current.select('6')); // selected, no amount at all
    expect(result.current.invalidWillIds).toEqual(['2', '3', '4', '5', '6']);
  });

  it('adds up only the valid amounts, in stroops', () => {
    const { result } = setup('1000', { '1': '1.5', '2': '2', '3': 'abc' });
    expect(result.current.total).toBe(toStroops('1.5') + toStroops('2'));
  });

  it('flags a total above the wallet balance', () => {
    const { result } = setup('10', { '1': '6', '2': '5' });
    expect(result.current.exceedsBalance).toBe(true);
  });

  it('allows a total equal to the wallet balance', () => {
    const { result } = setup('10', { '1': '6', '2': '4' });
    expect(result.current.exceedsBalance).toBe(false);
  });

  it('does not flag anything while the wallet balance is unknown', () => {
    const { result } = setup(null, { '1': '999999' });
    expect(result.current.exceedsBalance).toBe(false);
  });

  it('does not flag anything when the wallet balance cannot be parsed', () => {
    const { result } = setup('not a number', { '1': '5' });
    expect(result.current.exceedsBalance).toBe(false);
  });
});

describe('useBatchTopUp — submit', () => {
  it('tops up every selected will, records each result and then calls onComplete', async () => {
    topUp.mockResolvedValueOnce({ txHash: 'hash-1' }).mockResolvedValueOnce({ txHash: 'hash-2' });
    const { result } = setup('100', { '1': '1.5', '2': '2' });
    const onComplete = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.submit(onComplete);
    });

    expect(topUp).toHaveBeenNthCalledWith(1, '1', toStroops('1.5').toString());
    expect(topUp).toHaveBeenNthCalledWith(2, '2', toStroops('2').toString());
    expect(result.current.results).toEqual({
      1: { status: 'success', message: 'Top-up successful', txHash: 'hash-1' },
      2: { status: 'success', message: 'Top-up successful', txHash: 'hash-2' },
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps going after one top-up fails and reports the failure for that will', async () => {
    topUp.mockRejectedValueOnce(new Error('insufficient funds')).mockResolvedValueOnce({ txHash: 'hash-2' });
    const { result } = setup('100', { '1': '1', '2': '2' });

    await act(async () => {
      await result.current.submit(vi.fn().mockResolvedValue(undefined));
    });

    expect(result.current.results['1']).toEqual({ status: 'error', message: 'formatted: insufficient funds' });
    expect(result.current.results['2']).toMatchObject({ status: 'success', txHash: 'hash-2' });
  });

  it('skips a will with an invalid amount without calling the contract for it', async () => {
    topUp.mockResolvedValue({ txHash: 'hash' });
    const { result } = setup('100', { '1': '1', '2': '' });

    await act(async () => {
      await result.current.submit(vi.fn().mockResolvedValue(undefined));
    });

    expect(topUp).toHaveBeenCalledTimes(1);
    expect(result.current.results['2']).toEqual({ status: 'error', message: 'Invalid or missing amount' });
  });

  it('does nothing when no will is selected', async () => {
    const { result } = renderHook(() => useBatchTopUp('100'));
    const onComplete = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.submit(onComplete);
    });

    expect(topUp).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does nothing when the total is above the wallet balance', async () => {
    const { result } = setup('1', { '1': '5' });
    const onComplete = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.submit(onComplete);
    });

    expect(topUp).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
