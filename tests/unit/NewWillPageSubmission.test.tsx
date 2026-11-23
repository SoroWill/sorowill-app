import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWill, routerPush } = vi.hoisted(() => ({
  createWill: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn().mockResolvedValue(null),
  truncateAddress: (value: string) => value,
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({ createWill }),
}));

vi.mock('@/lib/balance', () => ({
  getUserBalance: vi.fn(),
}));

vi.mock('@/lib/federated', () => ({
  isFederatedAddress: (address: string) => address.includes('*'),
  resolveFederatedAddress: vi.fn(),
}));

import { ToastProvider } from '@/components/Toast';
import NewWillPage from '@/app/will/new/page';

function Harness() {
  return (
    <ToastProvider>
      <NewWillPage />
    </ToastProvider>
  );
}

describe('NewWillPage submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    createWill.mockRejectedValue(new TypeError('Failed to fetch'));
  });

  it('rejects an invalid token contract address before the SDK can be called (#706)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Token contract address'), 'not-a-contract');
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText(/doesn't look like a Stellar contract address/i)).toBeInTheDocument();
    expect(createWill).not.toHaveBeenCalled();
  });

  it('clears the submitting state after a network error', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Token contract address'), `C${'A'.repeat(55)}`);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(
      screen.getByLabelText('Beneficiary 1 Address'),
      `G${'A'.repeat(55)}`,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Create Will' }));

    await waitFor(() => expect(createWill).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Unable to reach the blockchain network/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Will' })).toBeEnabled();
    });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('clears the submitting state after a successful submission', async () => {
    const user = userEvent.setup();
    createWill.mockResolvedValue({ willId: 'will-123' });
    render(<Harness />);

    await user.type(screen.getByLabelText('Token contract address'), `C${'A'.repeat(55)}`);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(
      screen.getByLabelText('Beneficiary 1 Address'),
      `G${'A'.repeat(55)}`,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Create Will' }));

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/will/will-123'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Will' })).toBeEnabled();
    });
  });

  async function fillFormUpToCheckin(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Token contract address'), `C${'A'.repeat(55)}`);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.type(
      screen.getByLabelText('Beneficiary 1 Address'),
      `G${'A'.repeat(55)}`,
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
  }

  async function setCheckinPeriod(user: ReturnType<typeof userEvent.setup>, days: string) {
    const input = screen.getByLabelText(/check-?in period/i);
    await user.clear(input);
    await user.type(input, days);
  }

  it('blocks submission when the check-in period exceeds 60 days', async () => {
    const user = userEvent.setup();
    createWill.mockResolvedValue({ willId: 'will-123' });
    render(<Harness />);

    await fillFormUpToCheckin(user);
    await setCheckinPeriod(user, '61');

    const createButton = screen.getByRole('button', { name: 'Create Will' });
    expect(createButton).toBeDisabled();

    await user.click(createButton);
    expect(createWill).not.toHaveBeenCalled();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('shows the storage-archival warning for unsafe check-in periods', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillFormUpToCheckin(user);
    await setCheckinPeriod(user, '61');

    expect(
      await screen.findByText(/archiv|storage|60 days/i),
    ).toBeInTheDocument();
  });

  it('does not show the warning for a safe check-in period', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await fillFormUpToCheckin(user);
    await setCheckinPeriod(user, '30');

    expect(screen.queryByText(/archiv|storage|60 days/i)).not.toBeInTheDocument();
  });

  it('submits successfully with a check-in period of exactly 60 days', async () => {
    const user = userEvent.setup();
    createWill.mockResolvedValue({ willId: 'will-123' });
    render(<Harness />);

    await fillFormUpToCheckin(user);
    await setCheckinPeriod(user, '60');

    const createButton = screen.getByRole('button', { name: 'Create Will' });
    expect(createButton).toBeEnabled();
    expect(screen.queryByText(/archiv|storage|60 days/i)).not.toBeInTheDocument();

    await user.click(createButton);

    await waitFor(() => expect(createWill).toHaveBeenCalledOnce());
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/will/will-123'));
  });
});
