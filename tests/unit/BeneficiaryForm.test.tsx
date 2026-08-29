import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import type { Beneficiary } from '@sorowill/sdk';
import { resolveFederatedAddress } from '@/lib/federated';

vi.mock('@/lib/federated', () => ({
  isFederatedAddress: (address: string) => address.includes('*'),
  resolveFederatedAddress: vi.fn(),
}));

describe('BeneficiaryForm', () => {
  it('renders with empty state', () => {
    render(<BeneficiaryForm value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Add at least one beneficiary');
  });

  it('renders a beneficiary row', () => {
    const beneficiaries: Beneficiary[] = [{ address: 'GABC123', percentage: 50 }];
    render(<BeneficiaryForm value={beneficiaries} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('GABC123')).toBeInTheDocument();
    expect(screen.getByDisplayValue(50)).toBeInTheDocument();
  });

  it('calls onChange when adding a beneficiary', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BeneficiaryForm value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /add beneficiary/i }));
    expect(onChange).toHaveBeenCalledWith([{ address: '', percentage: 0 }]);
  });

  it('calls onChange when removing a beneficiary', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GABC123', percentage: 50 },
      { address: 'GXYZ456', percentage: 50 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', { name: /remove beneficiary/i });
    await user.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ address: 'GXYZ456', percentage: 50 }]);
  });

  it('calls onChange when updating address', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: '', percentage: 100 }];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.type(screen.getByPlaceholderText(/stellar address/i), 'GNEW');
    expect(onChange).toHaveBeenCalled();
  });

  it('reports the resolved address through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: 'alice*domain.com', percentage: 100 }];
    vi.mocked(resolveFederatedAddress).mockResolvedValue('GRESOLVED123');

    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([{ address: 'GRESOLVED123', percentage: 100 }]);
    });
  });

  it('shows valid state when total is 100%', () => {
    const beneficiaries: Beneficiary[] = [{ address: 'GABC', percentage: 100 }];
    render(<BeneficiaryForm value={beneficiaries} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Total: 100% ✓');
  });

  // ── Issue #65: distinct messages for the two failure modes ──────────────

  it('shows "must be whole numbers" message when any percentage is non-integer', () => {
    // 33.5 + 33.5 + 33 = 100, but the fractional values make it invalid.
    const beneficiaries: Beneficiary[] = [
      { address: 'GAAA', percentage: 33.5 },
      { address: 'GBBB', percentage: 33.5 },
      { address: 'GCCC', percentage: 33 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Percentages must be whole numbers');
    // Must NOT show the "must equal 100%" message for this case.
    expect(screen.getByRole('status')).not.toHaveTextContent('must equal 100%');
  });

  it('shows "must equal 100%" message when percentages are integers but sum is wrong', () => {
    const beneficiaries: Beneficiary[] = [
      { address: 'GAAA', percentage: 60 },
      { address: 'GBBB', percentage: 30 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Total must equal 100%');
    // Must NOT show the non-integer message for this case.
    expect(screen.getByRole('status')).not.toHaveTextContent('whole numbers');
  });

  // ────────────────────────────────────────────────────────────────────────

  it('applies equal split when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GA', percentage: 0 },
      { address: 'GB', percentage: 0 },
      { address: 'GC', percentage: 0 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /distribute percentages equally/i }));
    expect(onChange).toHaveBeenCalledWith([
      { address: 'GA', percentage: 33 },
      { address: 'GB', percentage: 33 },
      { address: 'GC', percentage: 34 },
    ]);
  });

  it('equal split with 2 beneficiaries gives 50/50', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GA', percentage: 0 },
      { address: 'GB', percentage: 0 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /distribute percentages equally/i }));
    expect(onChange).toHaveBeenCalledWith([
      { address: 'GA', percentage: 50 },
      { address: 'GB', percentage: 50 },
    ]);
  });

  it('equal split with 6 beneficiaries distributes remainder to last rows', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = Array.from({ length: 6 }, (_, i) => ({
      address: `G${i}`,
      percentage: 0,
    }));
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /distribute percentages equally/i }));
    // 100 / 6 = 16 remainder 4 → last 4 get 17, first 2 get 16
    const called = onChange.mock.calls[0][0];
    expect(called).toHaveLength(6);
    expect(called[0].percentage).toBe(16);
    expect(called[1].percentage).toBe(16);
    expect(called[2].percentage).toBe(17);
    expect(called[3].percentage).toBe(17);
    expect(called[4].percentage).toBe(17);
    expect(called[5].percentage).toBe(17);
    const sum = called.reduce((s: number, b: Beneficiary) => s + b.percentage, 0);
    expect(sum).toBe(100);
  });

  it('disables split equally when no beneficiaries', () => {
    render(<BeneficiaryForm value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /distribute percentages equally/i })).toBeDisabled();
  });
});
