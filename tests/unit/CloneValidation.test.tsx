/**
 * Tests for issue #441: Clone source validation in NewWillPage.
 *
 * When ?cloneFrom=<id> is present and the SDK throws while fetching
 * the source will, the page must:
 *   1. Show a targeted error message (not a generic one).
 *   2. NOT render the multi-step form.
 *   3. NOT render the Back/Next navigation buttons.
 *   4. Offer a "Go back" affordance.
 *   5. Offer a "Try again" button only for network errors.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── next/navigation stubs ───────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('cloneFrom=42'),
}));

// ─── next-intl stub ───────────────────────────────────────────────────────────
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return { ...actual, useLocale: () => 'en' };
});

// ─── Toast stub ───────────────────────────────────────────────────────────────
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Freighter stub ───────────────────────────────────────────────────────────
vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn(),
  truncateAddress: (v: string) => `${v.slice(0, 4)}…${v.slice(-4)}`,
}));

// ─── balance stub ─────────────────────────────────────────────────────────────
vi.mock('@/lib/balance', () => ({
  getUserBalance: vi.fn().mockResolvedValue('100.00'),
}));

// ─── federated stub ───────────────────────────────────────────────────────────
vi.mock('@/lib/federated', () => ({
  isFederatedAddress: () => false,
  resolveFederatedAddress: vi.fn(),
}));

// ─── BroadcastChannel polyfill ───────────────────────────────────────────────
class MockBroadcastChannel {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  close() {}
}

// Resolve imports after vi.mock() calls have been hoisted.
import NewWillPage from '@/app/will/new/page';
import * as sorowill from '@/lib/sorowill';
import { safeGetPublicKey } from '@/lib/freighter';

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  vi.mocked(safeGetPublicKey).mockResolvedValue(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — mount the page with a given getWill rejection
// ─────────────────────────────────────────────────────────────────────────────
function renderWithCloneError(error: unknown) {
  vi.spyOn(sorowill, 'getSoroWillClient').mockReturnValue({
    getWill: vi.fn().mockRejectedValue(error),
  } as unknown as ReturnType<typeof sorowill.getSoroWillClient>);
  return render(<NewWillPage />);
}

// ─────────────────────────────────────────────────────────────────────────────
// not_found — Will has been deleted
// ─────────────────────────────────────────────────────────────────────────────
describe('NewWillPage clone — not_found error', () => {
  it('shows "Will has been deleted" heading', async () => {
    renderWithCloneError(new Error('WillNotFound: id 42'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /will has been deleted/i })).toBeInTheDocument(),
    );
  });

  it('shows the spec-required "no longer exists on chain" detail', async () => {
    renderWithCloneError(new Error('error(contract, #1)'));
    await waitFor(() =>
      expect(screen.getByText(/no longer exists on chain/i)).toBeInTheDocument(),
    );
  });

  it('does NOT render the multi-step form inputs', async () => {
    renderWithCloneError(new Error('will not found'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /will has been deleted/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/token contract address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/amount \(usdc\)/i)).not.toBeInTheDocument();
  });

  it('does NOT render the Back/Next navigation buttons', async () => {
    renderWithCloneError(new Error('will not found'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /will has been deleted/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^back$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^next$/i })).not.toBeInTheDocument();
  });

  it('renders a "Go back" button', async () => {
    renderWithCloneError(new Error('will not found'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument(),
    );
  });

  it('does NOT render a "Try again" button (not retriable)', async () => {
    renderWithCloneError(new Error('will not found'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /will has been deleted/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// permission — You no longer have access
// ─────────────────────────────────────────────────────────────────────────────
describe('NewWillPage clone — permission error', () => {
  it('shows "Access denied" heading', async () => {
    renderWithCloneError(new Error('unauthorized'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument(),
    );
  });

  it('shows the spec-required "no longer have access" detail', async () => {
    renderWithCloneError(new Error('permission denied'));
    await waitFor(() =>
      expect(screen.getByText(/no longer have access/i)).toBeInTheDocument(),
    );
  });

  it('does NOT render the form inputs', async () => {
    renderWithCloneError(new Error('access denied'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/amount \(usdc\)/i)).not.toBeInTheDocument();
  });

  it('does NOT render a "Try again" button (not retriable)', async () => {
    renderWithCloneError(new Error('unauthorized'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /access denied/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// network — Unable to fetch will
// ─────────────────────────────────────────────────────────────────────────────
describe('NewWillPage clone — network error', () => {
  it('shows "Connection error" heading', async () => {
    renderWithCloneError(new Error('Failed to fetch'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /connection error/i })).toBeInTheDocument(),
    );
  });

  it('shows the spec-required "Unable to fetch will" detail', async () => {
    renderWithCloneError(new Error('network error'));
    await waitFor(() =>
      expect(screen.getByText(/unable to fetch will/i)).toBeInTheDocument(),
    );
  });

  it('renders a "Try again" retry button for network errors', async () => {
    renderWithCloneError(new Error('Failed to fetch'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument(),
    );
  });

  it('renders a "Go back" button', async () => {
    renderWithCloneError(new Error('Failed to fetch'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument(),
    );
  });

  it('does NOT render the form inputs', async () => {
    renderWithCloneError(new Error('network error'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /connection error/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/amount \(usdc\)/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// plain-object SDK throw (non-Error)
// ─────────────────────────────────────────────────────────────────────────────
describe('NewWillPage clone — plain-object SDK throw', () => {
  it('shows an error card when the SDK throws a plain not-found object', async () => {
    renderWithCloneError({ message: 'WillNotFound: id 42', code: 1 });
    await waitFor(() =>
      expect(screen.getByTestId('clone-error')).toBeInTheDocument(),
    );
  });

  it('does NOT render the form when the SDK throws a plain permission-error object', async () => {
    renderWithCloneError({ message: 'unauthorized', code: 403 });
    await waitFor(() =>
      expect(screen.getByTestId('clone-error')).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/amount \(usdc\)/i)).not.toBeInTheDocument();
  });
});
