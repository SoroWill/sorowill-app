import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('BeneficiaryForm row ids travel with rows (#326)', () => {
  it("does not show a removed row's resolved address on the next row", async () => {
    const user = userEvent.setup();
    vi.mocked(resolveFederatedAddress).mockResolvedValue(RESOLVED);
    render(
      <Harness
        initial={[
          { address: 'alice*example.com', percentage: 50 },
          { address: 'bob*example.com', percentage: 50 },
        ]}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Resolve' })[0]);
    await waitFor(() => expect(screen.getByText('Resolved address:')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Remove Beneficiary 1' }));

    expect(screen.getByDisplayValue('bob*example.com')).toBeInTheDocument();
    expect(screen.queryByText('Resolved address:')).not.toBeInTheDocument();
  });
});
