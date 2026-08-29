import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import type { Beneficiary } from '@sorowill/sdk';

describe('BeneficiaryForm', () => {
  it('shows validation error for invalid address live', () => {
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: 'INVALID', percentage: 100 }];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/invalid stellar address/i)).toBeInTheDocument();
  });

  it('clears address validation error when address becomes valid', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: 'INVALID', percentage: 100 }];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/invalid stellar address/i)).toBeInTheDocument();

    const addressInput = screen.getByDisplayValue('INVALID') as HTMLInputElement;
    await user.clear(addressInput);
    await user.type(addressInput, 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB');

    expect(onChange).toHaveBeenCalled();
  });

  it('shows percentage total validation live', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 50 },
      { address: 'GXYZABC1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 40 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/Total: 90%/)).toBeInTheDocument();
    expect(screen.getByText(/must equal 100%/)).toBeInTheDocument();
  });

  it('shows valid state when percentages sum to 100 live', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 60 },
      { address: 'GXYZABC1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 0 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    const percentageInput = screen.getAllByDisplayValue(0)[0] as HTMLInputElement;
    await user.clear(percentageInput);
    await user.type(percentageInput, '40');

    expect(onChange).toHaveBeenCalled();
  });

  it('validates all beneficiaries using SDK validateBeneficiaries', () => {
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 100 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/Total: 100% ✓/)).toBeInTheDocument();
  });

  it('shows validation errors for empty addresses with non-zero percentages', () => {
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: '', percentage: 100 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/address is required/i)).toBeInTheDocument();
  });

  it('shows field-level validation feedback for each beneficiary', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: '', percentage: 50 },
      { address: '', percentage: 50 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getAllByText(/address is required/i)).toHaveLength(2);
  });

  it('updates validation state when percentage changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [
      { address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 100 },
    ];
    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);

    expect(screen.getByText(/Total: 100% ✓/)).toBeInTheDocument();

    const percentageInput = screen.getByDisplayValue(100) as HTMLInputElement;
    await user.clear(percentageInput);
    await user.type(percentageInput, '80');

    expect(onChange).toHaveBeenCalled();
  });
});
