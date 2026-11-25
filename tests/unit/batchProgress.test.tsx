import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { batchProgress, formatEta } from '../../src/lib/batchProgress';
import { BatchTopUpPanel } from '../../src/components/BatchTopUpPanel';

describe('batch progress (#883)', () => {
  it('counts finished operations and estimates time left from the average', () => {
    const progress = batchProgress(['success', 'error', 'running', 'pending'], 0, 10_000);
    expect(progress).toEqual({ completed: 2, total: 4, percent: 50, etaMs: 10_000 });
  });

  it('has no estimate before the first operation finishes, and none left at the end', () => {
    expect(batchProgress(['running', 'pending'], 0, 5_000).etaMs).toBeNull();
    expect(batchProgress(['success', 'cancelled'], 0, 5_000)).toMatchObject({ percent: 100, etaMs: 0 });
  });

  it('formats the estimate', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(12_300)).toBe('about 13s');
    expect(formatEta(125_000)).toBe('about 2m 5s');
  });

  function renderPanel(props: Partial<Parameters<typeof BatchTopUpPanel>[0]> = {}) {
    return render(
      <BatchTopUpPanel
        amounts={{ '1': '1', '2': '2', '3': '3' }}
        exceedsBalance={false}
        invalidWillIds={[]}
        isSubmitting
        onAmountChange={() => {}}
        onSubmit={() => {}}
        results={{
          '1': { status: 'success', message: 'Top-up successful' },
          '2': { status: 'running', message: 'Submitting' },
          '3': { status: 'pending', message: 'Waiting' },
        }}
        selectedWillIds={['1', '2', '3']}
        total={0n}
        walletBalance={null}
        wills={[]}
        startedAt={0}
        now={4_000}
        {...props}
      />,
    );
  }

  it('shows a progress bar, each operation\'s status and the time remaining', () => {
    renderPanel();
    const bar = screen.getByRole('progressbar', { name: 'Batch top-up progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(screen.getByText(/1 of 3 done \(33%\)/)).toHaveTextContent('about 8s remaining');
    expect(screen.getByText('✓ Success')).toBeInTheDocument();
    expect(screen.getByText('Submitting…')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('offers a cancel button while submitting', () => {
    const onCancel = vi.fn();
    renderPanel({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel remaining' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows no progress or cancel before a batch runs', () => {
    renderPanel({ results: {}, isSubmitting: false, onCancel: () => {} });
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel remaining' })).toBeNull();
  });
});
