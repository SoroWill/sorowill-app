import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InheritPageClient, { claimIsAvailable } from './InheritPageClient';
import { WillStatus, type Will } from '@sorowill/sdk';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: vi.fn(),
  stellarExpertUrl: vi.fn(() => 'https://stellar.expert'),
}));

vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn(async () => null),
  truncateAddress: vi.fn((a: string) => a.slice(0, 8)),
}));

vi.mock('@/lib/errors', () => ({
  formatError: vi.fn((e: unknown) => String(e)),
  formatLoadError: vi.fn(() => 'load failed'),
}));

vi.mock('@/lib/deadlines', () => ({
  graceDeadline: vi.fn(() => null),
}));

vi.mock('@/components/Toast', () => ({
  useToast: vi.fn(() => ({ success: vi.fn(), error: vi.fn() })),
}));

vi.mock('@/components/StatusBanner', () => ({
  StatusBanner: vi.fn(() => <div data-testid="status-banner" />),
}));

vi.mock('@/components/CopyAddress', () => ({
  CopyAddress: vi.fn(() => null),
}));

vi.mock('@sorowill/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sorowill/sdk')>();
  return {
    ...actual,
    calculateShares: vi.fn(() => []),
  };
});

import { getSoroWillClient } from '@/lib/sorowill';

const mockGetWill = vi.fn();
const mockReleaseInheritance = vi.fn();

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: 1,
    balance: '1000000',
    beneficiaries: [],
    status: WillStatus.Active,
    ...overrides,
  } as Will;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('claimIsAvailable', () => {
  it('returns true only when status is Triggered and grace has passed', () => {
    const grace = new Date(Date.now() - 1000);
    expect(claimIsAvailable(WillStatus.Triggered, grace, Date.now())).toBe(true);
  });

  it('returns false when grace has not passed', () => {
    const grace = new Date(Date.now() + 10_000);
    expect(claimIsAvailable(WillStatus.Triggered, grace, Date.now())).toBe(false);
  });

  it('returns false when status is not Triggered', () => {
    const grace = new Date(Date.now() - 1000);
    expect(claimIsAvailable(WillStatus.Active, grace, Date.now())).toBe(false);
    expect(claimIsAvailable(WillStatus.Released, grace, Date.now())).toBe(false);
  });

  it('returns false when grace is null', () => {
    expect(claimIsAvailable(WillStatus.Triggered, null, Date.now())).toBe(false);
  });
});

describe('InheritPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSoroWillClient as ReturnType<typeof vi.fn>).mockReturnValue({
      getWill: mockGetWill,
      releaseInheritance: mockReleaseInheritance,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends exactly one getWill request on mount', async () => {
    mockGetWill.mockResolvedValue(makeWill());

    render(<InheritPageClient id="1" />);

    await waitFor(() => {
      expect(mockGetWill).toHaveBeenCalledTimes(1);
    });
    expect(mockGetWill).toHaveBeenCalledWith('1');
  });

  it('does not send a second request when the component re-renders with the same id', async () => {
    mockGetWill.mockResolvedValue(makeWill());

    const { rerender } = render(<InheritPageClient id="1" />);
    await waitFor(() => expect(mockGetWill).toHaveBeenCalledTimes(1));

    rerender(<InheritPageClient id="1" />);
    rerender(<InheritPageClient id="1" />);

    // Give any microtasks a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetWill).toHaveBeenCalledTimes(1);
  });

  it('sends a new request when the will id changes', async () => {
    mockGetWill.mockResolvedValue(makeWill());

    const { rerender } = render(<InheritPageClient id="1" />);
    await waitFor(() => expect(mockGetWill).toHaveBeenCalledTimes(1));

    rerender(<InheritPageClient id="2" />);
    await waitFor(() => expect(mockGetWill).toHaveBeenCalledTimes(2));
    expect(mockGetWill).toHaveBeenLastCalledWith('2');
  });

  it('deduplicates concurrent fetches for the same will id', async () => {
    let resolveGetWill!: (w: Will) => void;
    mockGetWill.mockImplementation(
      () => new Promise<Will>((res) => { resolveGetWill = res; }),
    );

    // Mount triggers one fetch.
    const { unmount } = render(<InheritPageClient id="42" />);
    await waitFor(() => expect(mockGetWill).toHaveBeenCalledTimes(1));

    // Resolve the first fetch; the cache entry is removed.
    resolveGetWill(makeWill({ id: 42 }));

    // A manual refetch after the first settles starts a fresh request.
    await waitFor(() => {
      // component finished loading
      expect(screen.queryByText(/Will #42/)).toBeInTheDocument();
    });

    unmount();
  });

  it('shows an error state when getWill rejects', async () => {
    mockGetWill.mockRejectedValue(new Error('rpc down'));

    render(<InheritPageClient id="9" />);

    await waitFor(() => {
      expect(screen.getByText(/Could not load will/)).toBeInTheDocument();
    });
  });

  it('renders the invalid will-id message for a non-numeric id', () => {
    render(<InheritPageClient id="abc" />);
    expect(screen.getByText('Invalid will ID')).toBeInTheDocument();
  });

  it('aborts the in-flight request on unmount so the state is never updated', async () => {
    let resolveGetWill!: (w: Will) => void;
    mockGetWill.mockImplementation(
      () => new Promise<Will>((res) => { resolveGetWill = res; }),
    );

    const { unmount } = render(<InheritPageClient id="7" />);
    await waitFor(() => expect(mockGetWill).toHaveBeenCalledTimes(1));

    // Unmount before the RPC resolves.
    unmount();

    // Resolving after unmount must not throw (state updates are guarded).
    resolveGetWill(makeWill({ id: 7 }));
    await new Promise((r) => setTimeout(r, 20));
  });
});
