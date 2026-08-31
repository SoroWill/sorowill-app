import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import GuardianOnboardingPage from '@/app/guardian/onboard/page';
import { safeGetPublicKey } from '@/lib/freighter';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('willId=abc123'),
}));

vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn(),
  truncateAddress: (value: string) =>
    value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`,
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: vi.fn().mockResolvedValue({
      id: 'abc123',
      owner: 'GOWNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      balance: '100000000',
      checkinPeriodDays: 30,
      guardians: ['GCONNECTEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    }),
  }),
}));

describe('Guardian onboarding wallet reactivity', () => {
  beforeEach(() => {
    class MockBroadcastChannel {
      static channels = new Map<string, Set<(event: MessageEvent) => void>>();

      public listeners: Set<(event: MessageEvent) => void>;

      constructor(public name: string) {
        const existing = MockBroadcastChannel.channels.get(name) ?? new Set();
        MockBroadcastChannel.channels.set(name, existing);
        this.listeners = existing;
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') {
          this.listeners.add(listener);
        }
      }

      removeEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (type === 'message') {
          this.listeners.delete(listener);
        }
      }

      postMessage(message: unknown) {
        this.listeners.forEach((listener) => {
          listener(new MessageEvent('message', { data: message }));
        });
      }

      close() {}
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    vi.mocked(safeGetPublicKey).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('updates the guardian status when the wallet connects after page load', async () => {
    render(<GuardianOnboardingPage />);

    const channel = new BroadcastChannel('wallet_state');
    channel.postMessage({ type: 'wallet_connected', publicKey: 'GCONNECTEDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' });

    await waitFor(() => {
      expect(screen.getByText(/Your connected wallet/i)).toBeInTheDocument();
    });
  });
});
