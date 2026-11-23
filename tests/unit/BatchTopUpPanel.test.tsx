import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WillStatus, type Will } from '@sorowill/sdk';

import { BatchTopUpPanel } from '@/components/BatchTopUpPanel';

function makeWill(id: string, balance: string): Will {
  return {
    id,
    owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    token: 'CCV4OUCZ5TTB3ZLWHJQQZDXHMPNGR65EQ3GLBJ7KX6HLRHOFCJZ4Q4XU',
    balance,
    beneficiaries: [],
    checkinPeriodDays: 30,
    gracePeriodDays: 7,
    lastCheckin: new Date(),
    triggerTime: null,
    status: WillStatus.Active,
    guardians: [],
    guardianVotes: 0,
  };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof BatchTopUpPanel>> = {}) {
  const props: React.ComponentProps<typeof BatchTopUpPanel> = {
    amounts: {},
    exceedsBalance: false,
    invalidWillIds: [],
    isSubmitting: false,
    onAmountChange: vi.fn(),
    onSubmit: vi.fn(),
    results: {},
    selectedWillIds: ['1', '2'],
    total: 0n,
    walletBalance: '100',
    wills: [makeWill('1', '50000000'), makeWill('2', '0')],
    ...overrides,
  };
  render(<BatchTopUpPanel {...props} />);
  return props;
}

describe('BatchTopUpPanel', () => {
  it('names the number of selected wills and lists each one', () => {
    renderPanel();
    expect(screen.getByText('Batch Top-up (2 wills selected)')).toBeInTheDocument();
    expect(screen.getByText('Will #1')).toBeInTheDocument();
    expect(screen.getByText('Will #2')).toBeInTheDocument();
  });

  it('uses the singular for one selected will', () => {
    renderPanel({ selectedWillIds: ['1'] });
    expect(screen.getByText('Batch Top-up (1 will selected)')).toBeInTheDocument();
  });

  it('shows each will\'s current balance, and 0.00 for a will that is not in the list', () => {
    renderPanel({ selectedWillIds: ['1', '99'] });
    const balances = screen.getAllByText(/Current balance:/);
    expect(balances).toHaveLength(2);
    expect(balances[1]).toHaveTextContent('Current balance: 0.00 USDC');
  });

  it('shows the entered amount and reports changes', () => {
    const props = renderPanel({ amounts: { '1': '12.5' } });
    const inputs = screen.getAllByPlaceholderText('Amount (USDC)');
    expect(inputs[0]).toHaveValue(12.5);
    expect(inputs[1]).toHaveValue(null);

    fireEvent.change(inputs[1], { target: { value: '3' } });
    expect(props.onAmountChange).toHaveBeenCalledWith('2', '3');
  });

  it('submits the batch from the button', () => {
    const props = renderPanel({ total: 10_000_000n });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Batch Top-up' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the total', () => {
    renderPanel({ total: 25_000_000n });
    expect(screen.getByText(/Total Amount:/)).toHaveTextContent(/Total Amount: 2\.5\d* USDC/);
  });

  it('disables the button and says so while submitting', () => {
    renderPanel({ isSubmitting: true });
    expect(screen.getByRole('button', { name: 'Submitting Batch…' })).toBeDisabled();
  });

  it('disables the button and explains when an amount is invalid', () => {
    renderPanel({ invalidWillIds: ['2'] });
    expect(screen.getByRole('button', { name: 'Submit Batch Top-up' })).toBeDisabled();
    expect(screen.getByText(/Enter a valid amount for every selected will/)).toBeInTheDocument();
  });

  it('disables the button and shows the balance when the total is too high', () => {
    renderPanel({ exceedsBalance: true, walletBalance: '42' });
    expect(screen.getByRole('button', { name: 'Submit Batch Top-up' })).toBeDisabled();
    expect(screen.getByText('Total exceeds your available balance (42 USDC).')).toBeInTheDocument();
  });

  it('shows the outcome of each top-up after a submit', () => {
    renderPanel({
      results: {
        '1': { status: 'success', message: 'Top-up successful', txHash: 'abc' },
        '2': { status: 'error', message: 'Not enough funds' },
      },
    });
    expect(screen.getByText('✓ Success')).toBeInTheDocument();
    expect(screen.getByText('✗ Not enough funds')).toBeInTheDocument();
  });
});
