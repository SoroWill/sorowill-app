import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Beneficiary } from '@sorowill/sdk';
import { BeneficiaryForm } from '@/components/BeneficiaryForm';

function Harness({ initial }: { initial: Beneficiary[] }) {
  const [value, setValue] = useState<Beneficiary[]>(initial);
  return <BeneficiaryForm value={value} onChange={setValue} />;
}

describe('BeneficiaryForm non-integer percentage (#325)', () => {
  it('keeps 33.5 and shows the whole-numbers message instead of truncating to 33', () => {
    render(<Harness initial={[{ address: 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890AB', percentage: 100 }]} />);

    const input = screen.getByLabelText('Beneficiary 1 Percentage') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '33.5' } });

    expect(input.value).toBe('33.5');
    expect(screen.getByText(/Percentages must be whole numbers/)).toBeInTheDocument();
  });
});
