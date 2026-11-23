import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Beneficiary } from '@sorowill/sdk';

import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { resolveFederatedAddress } from '@/lib/federated';

vi.mock('@/lib/federated', () => ({
  isFederatedAddress: (address: string) => address.includes('*'),
  resolveFederatedAddress: vi.fn(),
}));

const RESOLVED = 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4';

function Harness({ initial }: { initial: Beneficiary[] }) {
  const [value, setValue] = useState<Beneficiary[]>(initial);
  return <BeneficiaryForm value={value} onChange={setValue} />;
}

describe('BeneficiaryForm resolution uses the latest value (#327)', () => {
  it('keeps edits made to another row while an address is resolving', async () => {
    let finish: (address: string) => void = () => {};
    vi.mocked(resolveFederatedAddress).mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <Harness
        initial={[
          { address: 'alice*example.com', percentage: 50 },
          { address: RESOLVED, percentage: 50 },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    fireEvent.change(screen.getByLabelText('Beneficiary 2 Percentage'), { target: { value: '40' } });

    await act(async () => {
      finish(RESOLVED);
    });

    expect(screen.getByLabelText('Beneficiary 1 Address')).toHaveValue(RESOLVED);
    expect(screen.getByLabelText('Beneficiary 2 Percentage')).toHaveValue(40);
  });
});
