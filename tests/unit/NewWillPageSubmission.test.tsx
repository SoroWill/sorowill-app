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

  it('clears the submitting state after a network error', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Token contract address'), `C${'A'.repeat(55)}`);
    await user.type(screen.getByLabelText('Amount (USDC)'), '1');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(
      screen.getByLabelText('Beneficiary 1 address'),
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
      screen.getByLabelText('Beneficiary 1 address'),
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
});
