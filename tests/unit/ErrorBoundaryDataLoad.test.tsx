/**
 * Tests for issue #440: Data-load failures in WillDetailPage, InheritPageClient,
 * and DashboardPage must show a friendly error message — never a raw error object
 * or "[object Object]".
 *
 * Each suite mounts the client component with a mocked SDK that throws on getWill
 * (or the relevant data-load call), then asserts:
 *   1. The spec-required heading is rendered.
 *   2. No raw "[object Object]" text reaches the DOM.
 *   3. A retry/try-again button is present.
 *   4. The full error is logged for debugging (not suppressed).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── next/navigation stub ─────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ id: '42' }),
}));

// ─── next-intl stub ───────────────────────────────────────────────────────────
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return { ...actual, useLocale: () => 'en' };
});

// ─── Toast stub ───────────────────────────────────────────────────────────────
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

// ─── Freighter stub ───────────────────────────────────────────────────────────
vi.mock('@/lib/freighter', () => ({
  safeGetPublicKey: vi.fn(),
  truncateAddress: (v: string) => `${v.slice(0, 4)}…${v.slice(-4)}`,
}));

// ─── SDK mock — getWill always throws ────────────────────────────────────────
const rpcError = new Error('Failed to fetch: RPC endpoint unreachable');

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({
    getWill: vi.fn().mockRejectedValue(rpcError),
    getWillsByOwner: vi.fn().mockRejectedValue(rpcError),
    getWillsByBeneficiary: vi.fn().mockRejectedValue(rpcError),
  }),
  stellarExpertUrl: (_kind: string, id: string) => `https://stellar.expert/tx/${id}`,
  resetSoroWillClient: vi.fn(),
  getWillsByGuardian: vi.fn().mockResolvedValue({ wills: [], hasErrors: true }),
}));

// ─── Deadlines stub ───────────────────────────────────────────────────────────
vi.mock('@/lib/deadlines', () => ({
  nextCheckinDeadline: () => new Date(Date.now() + 86_400_000),
  graceDeadline: () => null,
}));

// ─── BroadcastChannel polyfill ────────────────────────────────────────────────
class MockBroadcastChannel {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  close() {}
}

// Imports are resolved after all vi.mock() calls have been hoisted.
import WillDetailPage from '@/app/will/[id]/page';
import InheritPageClient from '@/app/inherit/[id]/InheritPageClient';
import DashboardPage from '@/app/dashboard/page';
import { safeGetPublicKey } from '@/lib/freighter';

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup
// ─────────────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
  vi.mocked(safeGetPublicKey).mockResolvedValue(
    'GPUBKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234',
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  console.error.mockClear?.();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// WillDetailPage
// ─────────────────────────────────────────────────────────────────────────────
describe('WillDetailPage — SDK throws on getWill', () => {
  it('shows the "Could not load will" heading instead of a raw error', async () => {
    render(<WillDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Could not load will/i }),
      ).toBeInTheDocument();
    });
  });

  it('never renders "[object Object]" in the DOM', async () => {
    const { container } = render(<WillDetailPage />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Could not load will/i }),
      ).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('renders a "Try again" retry button', async () => {
    render(<WillDetailPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('logs the full error for debugging', async () => {
    render(<WillDetailPage />);
    await waitFor(() => {
      const calls = (console.error as any).mock.calls;
      expect(calls.some((call: any[]) =>
        call[0]?.includes?.('[WillDetail]') || call[0]?.includes?.('Failed to load')
      )).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// InheritPageClient
// ─────────────────────────────────────────────────────────────────────────────
describe('InheritPageClient — SDK throws on getWill', () => {
  it('shows the "Could not load will" heading instead of a raw error', async () => {
    render(<InheritPageClient id="42" />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Could not load will/i }),
      ).toBeInTheDocument();
    });
  });

  it('never renders "[object Object]" in the DOM', async () => {
    const { container } = render(<InheritPageClient id="42" />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Could not load will/i }),
      ).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('renders a "Try again" retry button', async () => {
    render(<InheritPageClient id="42" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('logs the full error for debugging', async () => {
    render(<InheritPageClient id="42" />);
    await waitFor(() => {
      const calls = (console.error as any).mock.calls;
      expect(calls.some((call: any[]) =>
        call[0]?.includes?.('[InheritPage]') || call[0]?.includes?.('Failed to load')
      )).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DashboardPage
// ─────────────────────────────────────────────────────────────────────────────
describe('DashboardPage — SDK throws on data load', () => {
  it('shows the "Could not load your dashboard" heading', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Could not load your dashboard — check your connection/i),
      ).toBeInTheDocument();
    });
  });

  it('never renders "[object Object]" in the DOM', async () => {
    const { container } = render(<DashboardPage />);
    await waitFor(() => {
      expect(
        screen.getByText(/Could not load your dashboard — check your connection/i),
      ).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('[object Object]');
  });

  it('renders a "Try again" button after a load failure', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    });
  });

  it('logs the full error for debugging', async () => {
    render(<DashboardPage />);
    await waitFor(() => {
      const calls = (console.error as any).mock.calls;
      expect(calls.length > 0).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-Error throw — formatError must sanitise plain objects
// ─────────────────────────────────────────────────────────────────────────────
describe('formatError — never exposes raw error objects in the UI', () => {
  it('returns a string for a plain object throw (no "[object Object]" in output)', async () => {
    const { formatError } = await import('@/lib/errors');
    const plainObjectError = { message: 'xdr_invalid: something', code: 503 };
    const result = formatError(plainObjectError);
    expect(typeof result).toBe('string');
    expect(result).not.toContain('[object Object]');
  });

  it('returns a network message for an XHR/fetch-style error object', async () => {
    const { formatError } = await import('@/lib/errors');
    const result = formatError({ message: 'network error during fetch', code: 503 });
    expect(result).toMatch(/network|connection/i);
  });
});
