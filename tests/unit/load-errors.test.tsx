import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WillStatus, type Will } from '@sorowill/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardPage from '@/app/dashboard/page';
import InheritPageClient from '@/app/inherit/[id]/InheritPageClient';
import WillDetailPage from '@/app/will/[id]/page';
import { loadFailureMessage, reportLoadError } from '@/lib/loadErrors';

/**
 * Issue #440: the three pages that load their data on mount caught the failure and
 * rendered whatever `formatError()` produced — for anything it did not recognise
 * that is "Something went wrong. Please try again later.", with nothing in the
 * console. These tests drive the real pages with a mocked SDK that throws and
 * assert both the message the user sees and that the error was logged.
 */

const { getWillMock, getWillsByOwnerMock, getWillsByBeneficiaryMock, safeGetPublicKeyMock } =
  vi.hoisted(() => ({
    getWillMock: vi.fn(),
    getWillsByOwnerMock: vi.fn(),
    getWillsByBeneficiaryMock: vi.fn(),
    safeGetPublicKeyMock: vi.fn(),
  }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: getWillMock,
    getWillsByOwner: getWillsByOwnerMock,
    getWillsByBeneficiary: getWillsByBeneficiaryMock,
  }),
  getWillsByGuardian: vi.fn(async () => ({ wills: [], hasErrors: false })),
  stellarExpertUrl: () => 'https://stellar.expert',
}));

vi.mock('@/lib/freighter', () => ({
  truncateAddress: (value: string) => value,
  safeGetPublicKey: safeGetPublicKeyMock,
}));

vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/useKeyboardShortcuts', () => ({ useKeyboardShortcuts: vi.fn() }));

// Not part of this test: it renders translated copy and would need an intl provider.
vi.mock('@/components/CopyAddress', () => ({
  CopyAddress: ({ address }: { address: string }) => <span>{address}</span>,
}));

const OWNER = 'GOWNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '42',
    owner: OWNER,
    sender: OWNER,
    recipient: 'GBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    deposit: 1_000_000_000n,
    flowRate: 1_000n,
    balance: '1000000000',
    startTime: 1_700_000_000,
    endTime: 1_800_000_000,
    lastWithdrawTime: 0,
    lastCheckin: new Date('2026-08-01T00:00:00.000Z'),
    status: WillStatus.Active,
    autoRenew: false,
    beneficiaries: [
      { address: 'GBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 100 },
    ],
    guardians: [],
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    ...overrides,
  } as Will;
}

const CONNECTION_COPY = {
  will: 'Could not load will — check your connection',
  inheritance: 'Could not load inheritance — check your connection',
  dashboard: 'Could not load your dashboard — check your connection',
} as const;

describe('loadFailureMessage', () => {
  it('gives the load copy for network failures, unknown failures and non-errors', () => {
    expect(loadFailureMessage(new Error('fetch failed'), 'will')).toBe(CONNECTION_COPY.will);
    expect(loadFailureMessage(new Error('ECONNREFUSED 127.0.0.1:8000'), 'will')).toBe(
      CONNECTION_COPY.will,
    );
    expect(loadFailureMessage(new Error('boom'), 'will')).toBe(CONNECTION_COPY.will);
    expect(loadFailureMessage('boom', 'will')).toBe(CONNECTION_COPY.will);
    expect(loadFailureMessage(undefined, 'will')).toBe(CONNECTION_COPY.will);
  });

  it('names the page the load failed on', () => {
    expect(loadFailureMessage(new Error('boom'), 'inheritance')).toBe(CONNECTION_COPY.inheritance);
    expect(loadFailureMessage(new Error('boom'), 'dashboard')).toBe(CONNECTION_COPY.dashboard);
  });

  it('keeps the specific wording for failures that say something actionable', () => {
    expect(loadFailureMessage(new Error('WillNotFound'))).toBe(
      'This will was not found on the blockchain.',
    );
    expect(loadFailureMessage(new Error('Unauthorized'))).toBe(
      'You do not have permission to perform this action.',
    );
  });
});

describe('reportLoadError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the raw error, stack included, and returns the message', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    const message = reportLoadError(error, 'will');

    expect(message).toBe(CONNECTION_COPY.will);
    expect(consoleError).toHaveBeenCalledTimes(1);
    // The error object is passed through, so its stack reaches the console.
    expect(consoleError.mock.calls[0]?.[1]).toBe(error);
    expect(String(consoleError.mock.calls[0]?.[0])).toContain('could not load will');
  });
});

describe('will detail page load failure', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getWillMock.mockReset();
    safeGetPublicKeyMock.mockReset();
    safeGetPublicKeyMock.mockResolvedValue(null);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the load copy with a retry, and logs the error', async () => {
    getWillMock.mockRejectedValue(new Error('boom'));
    render(<WillDetailPage />);

    expect(await screen.findByText(CONNECTION_COPY.will)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    // A raw error object never reaches the DOM.
    expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it('recovers when the retry succeeds', async () => {
    getWillMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(makeWill());
    const user = userEvent.setup();
    render(<WillDetailPage />);

    await screen.findByText(CONNECTION_COPY.will);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByText(CONNECTION_COPY.will)).not.toBeInTheDocument();
    });
    expect(getWillMock).toHaveBeenCalledTimes(2);
  });
});

describe('inherit page load failure', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getWillMock.mockReset();
    safeGetPublicKeyMock.mockReset();
    safeGetPublicKeyMock.mockResolvedValue(null);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the load copy with a retry', async () => {
    getWillMock.mockRejectedValue(new Error('boom'));
    render(<InheritPageClient id="42" />);

    expect(await screen.findByText(CONNECTION_COPY.inheritance)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('recovers when the retry succeeds', async () => {
    getWillMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(makeWill());
    const user = userEvent.setup();
    render(<InheritPageClient id="42" />);

    await screen.findByText(CONNECTION_COPY.inheritance);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByText(CONNECTION_COPY.inheritance)).not.toBeInTheDocument();
    });
    expect(getWillMock).toHaveBeenCalledTimes(2);
  });
});

describe('dashboard load failure', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getWillsByOwnerMock.mockReset();
    getWillsByBeneficiaryMock.mockReset();
    safeGetPublicKeyMock.mockReset();
    safeGetPublicKeyMock.mockResolvedValue(OWNER);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows the load copy with a retry and logs the error', async () => {
    getWillsByOwnerMock.mockRejectedValue(new Error('boom'));
    getWillsByBeneficiaryMock.mockResolvedValue([]);
    render(<DashboardPage />);

    const message = await screen.findByText(CONNECTION_COPY.dashboard);
    expect(message).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it('recovers when the retry succeeds', async () => {
    getWillsByOwnerMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    getWillsByBeneficiaryMock.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<DashboardPage />);

    await screen.findByText(CONNECTION_COPY.dashboard);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.queryByText(CONNECTION_COPY.dashboard)).not.toBeInTheDocument();
    });
    expect(getWillsByOwnerMock).toHaveBeenCalledTimes(2);
  });
});
