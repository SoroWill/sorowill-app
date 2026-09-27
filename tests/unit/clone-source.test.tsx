import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WillStatus, type Will } from '@sorowill/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import NewWillPage from '@/app/will/new/page';
import {
  CLONE_SOURCE_MESSAGES,
  classifyCloneSourceError,
  hasCloneAccess,
  loadCloneSource,
} from '@/lib/cloneSource';

/**
 * Issue #441: `?cloneFrom=<id>` used to fill the new-will form from whatever
 * `getWill()` returned, and any failure collapsed into a generic error while the
 * form still opened. These tests cover the validation module and drive the real
 * page with a mocked SDK to prove the clone is blocked with the right message.
 */

const { getWillMock, safeGetPublicKeyMock, routerReplaceMock } = vi.hoisted(() => ({
  getWillMock: vi.fn(),
  safeGetPublicKeyMock: vi.fn(),
  routerReplaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('cloneFrom=42'),
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({ getWill: getWillMock }),
}));

vi.mock('@/lib/freighter', () => ({
  truncateAddress: (value: string) => value,
  safeGetPublicKey: safeGetPublicKeyMock,
}));

vi.mock('@/lib/balance', () => ({
  getUserBalance: vi.fn(async () => null),
}));

const OWNER = 'GOWNERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const VIEWER = 'GVIEWERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const BENEFICIARY = 'GBENEFICIARYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const GUARDIAN = 'GGUARDIANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '42',
    owner: OWNER,
    sender: OWNER,
    recipient: BENEFICIARY,
    token: TOKEN,
    deposit: 1_000_000_000n,
    flowRate: 1_000n,
    startTime: 1_700_000_000,
    endTime: 1_800_000_000,
    lastWithdrawTime: 0,
    status: WillStatus.Active,
    autoRenew: false,
    beneficiaries: [{ address: BENEFICIARY, percentage: 100 }],
    guardians: [GUARDIAN],
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    ...overrides,
  } as Will;
}

describe('classifyCloneSourceError', () => {
  it('treats a missing will as not found', () => {
    expect(classifyCloneSourceError(new Error('WillNotFound'))).toBe('not-found');
    expect(classifyCloneSourceError(new Error('error(contract, #1)'))).toBe('not-found');
    expect(classifyCloneSourceError(new Error('no such will'))).toBe('not-found');
  });

  it('treats permission failures as access problems', () => {
    expect(classifyCloneSourceError(new Error('Unauthorized'))).toBe('access');
    expect(classifyCloneSourceError(new Error('you are not the owner of this will'))).toBe('access');
    expect(classifyCloneSourceError(new Error('access denied'))).toBe('access');
  });

  it('treats everything else, including non-errors, as a fetch problem', () => {
    expect(classifyCloneSourceError(new Error('fetch failed'))).toBe('network');
    expect(classifyCloneSourceError(new Error('ECONNREFUSED'))).toBe('network');
    expect(classifyCloneSourceError('boom')).toBe('network');
    expect(classifyCloneSourceError(undefined)).toBe('network');
  });
});

describe('hasCloneAccess', () => {
  const will = makeWill();

  it('accepts the owner, a beneficiary and a guardian', () => {
    expect(hasCloneAccess(will, OWNER)).toBe(true);
    expect(hasCloneAccess(will, BENEFICIARY)).toBe(true);
    expect(hasCloneAccess(will, GUARDIAN)).toBe(true);
  });

  it('rejects a wallet that is no longer part of the will', () => {
    expect(hasCloneAccess(will, VIEWER)).toBe(false);
  });

  it('does not block when no wallet is connected', () => {
    expect(hasCloneAccess(will, null)).toBe(true);
    expect(hasCloneAccess(will, '')).toBe(true);
  });
});

describe('loadCloneSource', () => {
  it('returns the will when the fetch succeeds and the viewer has access', async () => {
    const result = await loadCloneSource(vi.fn(async () => makeWill()), '42', OWNER);

    expect(result).toEqual({ ok: true, will: expect.objectContaining({ token: TOKEN }) });
  });

  it('reports each failure mode with the message the page shows', async () => {
    await expect(
      loadCloneSource(
        vi.fn(async () => {
          throw new Error('Unauthorized');
        }),
        '42',
        OWNER,
      ),
    ).resolves.toEqual({
      ok: false,
      kind: 'access',
      message: CLONE_SOURCE_MESSAGES.access,
    });

    await expect(
      loadCloneSource(
        vi.fn(async () => {
          throw new Error('WillNotFound');
        }),
        '42',
        OWNER,
      ),
    ).resolves.toEqual({
      ok: false,
      kind: 'not-found',
      message: CLONE_SOURCE_MESSAGES['not-found'],
    });

    await expect(
      loadCloneSource(
        vi.fn(async () => {
          throw new Error('fetch failed');
        }),
        '42',
        OWNER,
      ),
    ).resolves.toEqual({
      ok: false,
      kind: 'network',
      message: CLONE_SOURCE_MESSAGES.network,
    });
  });

  it('refuses a will the viewer is not part of, even when the fetch worked', async () => {
    const result = await loadCloneSource(vi.fn(async () => makeWill()), '42', VIEWER);

    expect(result).toEqual({ ok: false, kind: 'access', message: CLONE_SOURCE_MESSAGES.access });
  });

  it('never throws and does not call the fetcher without an id', async () => {
    const fetchWill = vi.fn(async () => makeWill());
    const result = await loadCloneSource(fetchWill, '   ', OWNER);

    expect(result.ok).toBe(false);
    expect(fetchWill).not.toHaveBeenCalled();
  });
});

describe('cloneFrom on the new-will page', () => {
  beforeEach(() => {
    getWillMock.mockReset();
    routerReplaceMock.mockReset();
    safeGetPublicKeyMock.mockReset();
    safeGetPublicKeyMock.mockResolvedValue(OWNER);
    window.localStorage.clear();
  });

  it('blocks the clone and says so when the source will is gone', async () => {
    getWillMock.mockRejectedValue(new Error('WillNotFound'));
    render(<NewWillPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Will has been deleted');
    expect(alert).toHaveTextContent('Nothing was copied from the original will.');
    // Nothing was pre-filled from the source will.
    expect(screen.getByLabelText(/token contract address/i)).toHaveValue('');
  });

  it('blocks the clone and names the permission problem', async () => {
    getWillMock.mockRejectedValue(new Error('Unauthorized: not the owner'));
    render(<NewWillPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You no longer have access to this will',
    );
  });

  it('blocks the clone when access was revoked after the link was made', async () => {
    getWillMock.mockResolvedValue(makeWill());
    safeGetPublicKeyMock.mockResolvedValue(VIEWER);
    render(<NewWillPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You no longer have access to this will',
    );
    expect(screen.getByLabelText(/token contract address/i)).toHaveValue('');
  });

  it('blocks the clone and asks the user to try again on a fetch failure', async () => {
    getWillMock.mockRejectedValue(new Error('fetch failed'));
    render(<NewWillPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to fetch will — try again');
  });

  it('copies the settings when the source will is valid and owned by the viewer', async () => {
    getWillMock.mockResolvedValue(makeWill());
    render(<NewWillPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/token contract address/i)).toHaveValue(TOKEN);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('drops ?cloneFrom and clears the alert when the user starts a new will', async () => {
    getWillMock.mockRejectedValue(new Error('WillNotFound'));
    const user = userEvent.setup();
    render(<NewWillPage />);

    const alert = await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Start a new will' }));

    expect(routerReplaceMock).toHaveBeenCalledWith('/will/new');
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(alert).not.toBeInTheDocument();
  });
});
