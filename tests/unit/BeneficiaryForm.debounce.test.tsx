import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Beneficiary } from '@sorowill/sdk';

import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { resolveFederatedAddress } from '@/lib/federated';

vi.mock('@/lib/federated', () => ({
  isFederatedAddress: (address: string) => address.includes('*'),
  resolveFederatedAddress: vi.fn(),
}));

function Harness() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([{ address: '', percentage: 100 }]);
  return <BeneficiaryForm value={beneficiaries} onChange={setBeneficiaries} />;
}

describe('BeneficiaryForm federated address debounce (#725)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(resolveFederatedAddress).mockResolvedValue(`G${'A'.repeat(55)}`);
  });

  afterEach(() => vi.useRealTimers());

  it('performs one lookup after a complete address stops changing', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Beneficiary 1 address');

    fireEvent.change(input, { target: { value: 'alice*ex' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(input, { target: { value: 'alice*example.com' } });
    expect(resolveFederatedAddress).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(resolveFederatedAddress).toHaveBeenCalledTimes(1);
    expect(resolveFederatedAddress).toHaveBeenCalledWith('alice*example.com');
  });
});
