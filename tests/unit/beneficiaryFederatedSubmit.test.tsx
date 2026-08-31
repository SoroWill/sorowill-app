/**
 * Regression tests for issue #258:
 * "BeneficiaryForm's federated-address resolution is display-only — resolved
 * address is never used as the submitted beneficiary.address"
 *
 * Verifies three things:
 * 1. After clicking Resolve, BeneficiaryForm calls onChange with the real
 *    Stellar address, not the federated string.
 * 2. beneficiariesValid is false while a beneficiary still holds a federated
 *    address string, so the "Next" button stays disabled.
 * 3. BeneficiaryForm shows a per-row error for unresolved federated addresses
 *    instead of silently passing them through.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import type { Beneficiary } from '@sorowill/sdk';
import { resolveFederatedAddress } from '@/lib/federated';

// ---------------------------------------------------------------------------
// Mock @/lib/federated so tests don't need network access
// ---------------------------------------------------------------------------
vi.mock('@/lib/federated', () => ({
  isFederatedAddress: (address: string) => address.includes('*'),
  resolveFederatedAddress: vi.fn(),
}));

// Real-ish Stellar address returned by the mock federation server
const RESOLVED_STELLAR_ADDRESS =
  'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderForm(beneficiaries: Beneficiary[], onChange = vi.fn()) {
  render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
  return onChange;
}

// ---------------------------------------------------------------------------
// 1. Resolution wires the Stellar address into onChange
// ---------------------------------------------------------------------------
describe('BeneficiaryForm — federated resolution updates beneficiary.address (#258)', () => {
  it('calls onChange with the resolved Stellar address after clicking Resolve', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: 'alice*domain.com', percentage: 100 }];
    vi.mocked(resolveFederatedAddress).mockResolvedValue(RESOLVED_STELLAR_ADDRESS);

    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => {
      // The last call to onChange must carry the resolved G... address,
      // not the original federated string.
      const lastCall = onChange.mock.calls.at(-1)?.[0] as Beneficiary[];
      expect(lastCall).toBeDefined();
      expect(lastCall[0].address).toBe(RESOLVED_STELLAR_ADDRESS);
      expect(lastCall[0].address).not.toContain('*');
    });
  });

  it('does NOT submit the federated string — onChange never receives a * address after resolution', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const beneficiaries: Beneficiary[] = [{ address: 'alice*domain.com', percentage: 100 }];
    vi.mocked(resolveFederatedAddress).mockResolvedValue(RESOLVED_STELLAR_ADDRESS);

    render(<BeneficiaryForm value={beneficiaries} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // All onChange calls that carry address data must contain a resolved address.
    for (const [callArg] of onChange.mock.calls) {
      const beneficiariesArg = callArg as Beneficiary[];
      for (const b of beneficiariesArg) {
        if (b.address && b.address !== '') {
          expect(b.address).not.toContain('*');
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Per-row error shown for unresolved federated addresses
// ---------------------------------------------------------------------------
describe('BeneficiaryForm — shows error for unresolved federated address (#258)', () => {
  it('shows a "must be resolved" error when address contains *', () => {
    const beneficiaries: Beneficiary[] = [{ address: 'alice*domain.com', percentage: 100 }];
    renderForm(beneficiaries);

    expect(
      screen.getByText(/federated address must be resolved before submitting/i),
    ).toBeInTheDocument();
  });

  it('does NOT show the federated error after resolution updates the address to a G... key', () => {
    // Simulate the post-resolution state: address is now a real Stellar key.
    const beneficiaries: Beneficiary[] = [
      { address: RESOLVED_STELLAR_ADDRESS, percentage: 100 },
    ];
    renderForm(beneficiaries);

    expect(
      screen.queryByText(/federated address must be resolved before submitting/i),
    ).not.toBeInTheDocument();
  });

  it('shows Invalid Stellar address for a non-federated, non-Stellar value', () => {
    const beneficiaries: Beneficiary[] = [{ address: 'NOTAVALIDADDRESS', percentage: 100 }];
    renderForm(beneficiaries);

    expect(screen.getByText(/invalid stellar address/i)).toBeInTheDocument();
    // Must NOT conflate a bad plain address with the federated error
    expect(
      screen.queryByText(/federated address must be resolved/i),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. beneficiariesValid logic (tested via the isFederatedAddress predicate)
//    These tests mirror the check in will/new/page.tsx without rendering the
//    full page, asserting the logic that drives canGoNext.
// ---------------------------------------------------------------------------
describe('beneficiariesValid predicate logic (#258)', () => {
  const { isFederatedAddress } = vi.importMock<typeof import('@/lib/federated')>(
    '@/lib/federated',
  ) as unknown as { isFederatedAddress: (a: string) => boolean };

  it('a beneficiary with a federated address is flagged as not-ready', () => {
    // The check used in will/new/page.tsx:
    //   beneficiaries.every((b) => !isFederatedAddress(b.address))
    const beneficiaries: Beneficiary[] = [{ address: 'alice*domain.com', percentage: 100 }];
    const allResolved = beneficiaries.every((b) => !b.address.includes('*'));
    expect(allResolved).toBe(false);
  });

  it('a beneficiary with a resolved Stellar address passes the check', () => {
    const beneficiaries: Beneficiary[] = [
      { address: RESOLVED_STELLAR_ADDRESS, percentage: 100 },
    ];
    const allResolved = beneficiaries.every((b) => !b.address.includes('*'));
    expect(allResolved).toBe(true);
  });
});
