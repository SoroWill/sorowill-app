import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import type { Beneficiary } from '@sorowill/sdk';

const ACCOUNT = `G${'A'.repeat(55)}`;
const CONTRACT = `C${'A'.repeat(55)}`;

describe('BeneficiaryForm address/token mismatch', () => {
  it('flags a contract address when the token requires an account address', () => {
    const value: Beneficiary[] = [{ address: CONTRACT, percentage: 100 }];
    render(<BeneficiaryForm value={value} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/requires a Stellar account address starting with G/i);
  });

  it('flags an account address when the token requires a contract address', () => {
    const value: Beneficiary[] = [{ address: ACCOUNT, percentage: 100 }];
    render(<BeneficiaryForm value={value} onChange={vi.fn()} addressType="contract" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/requires a contract address starting with C/i);
  });

  it('accepts a matching address', () => {
    const value: Beneficiary[] = [{ address: ACCOUNT, percentage: 100 }];
    render(<BeneficiaryForm value={value} onChange={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
