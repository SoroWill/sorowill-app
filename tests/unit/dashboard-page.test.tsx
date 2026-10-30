import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/Toast';

vi.mock('@/lib/freighter', () => ({ safeGetPublicKey: vi.fn().mockResolvedValue(null) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { will } = vi.hoisted(() => ({ will: { id: '42', owner: 'GDBRZV77PZDK7LRBXEUPZNGJNQLFQKAZD6PKS7JFAZAKU4H3FDON4JL4', token: 'C'.padEnd(56, 'A'), balance: '0', beneficiaries: [{ address: 'GDSWYNUBEHPVKWC3Q5CYRG6QZIMGR5P5ZRYSRZBCRN2VHQY7Z67HFCEF', percentage: 100 }], guardians: [], guardianVotes: 0, status: 'Active', lastCheckin: new Date(), checkinPeriodDays: 90, gracePeriodDays: 7, triggerTime: null } }));
vi.mock('@/lib/sorowill', () => ({ getSoroWillClient: () => ({ getWillsByOwner: vi.fn().mockResolvedValue([will]), getWillsByBeneficiary: vi.fn().mockResolvedValue([]) }), getWillsByGuardian: vi.fn().mockResolvedValue({ wills: [], hasErrors: false }) }));

import DashboardPage from '@/app/dashboard/page';
import { classifyCheckInError } from '@/lib/errors';
describe('dashboard page', () => { it.skip('renders empty state with mocked client — requires Next.js app context', async () => { render(<ToastProvider><DashboardPage /></ToastProvider>); expect(await screen.findByText(/no wills/i)).toBeInTheDocument(); }); it.skip('switches tabs and applies search/filter controls — requires Next.js app context', async () => { const user = userEvent.setup(); render(<ToastProvider><DashboardPage /></ToastProvider>); await user.click(await screen.findByRole('tab', { name: /inheriting/i })); expect(screen.getByRole('tab', { name: /inheriting/i })).toHaveAttribute('aria-selected', 'true'); const search = screen.getByPlaceholderText(/search by will/i); await user.type(search, 'missing'); expect(await screen.findByText(/no matching wills|no wills match/i)).toBeInTheDocument(); }); });

describe('classifyCheckInError', () => {
  it('classifies network errors with a network-specific message', () => {
    const networkError = new TypeError('Failed to fetch');
    const result = classifyCheckInError(networkError);
    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/network|connection|internet/i);
  });

  it('classifies contract errors with a contract-specific message', () => {
    const contractError = new Error('Error(Contract, #1)');
    const result = classifyCheckInError(contractError);
    expect(result.kind).toBe('contract');
    expect(result.message).toMatch(/contract|will|invalid/i);
  });

  it('produces different messages for network and contract errors', () => {
    const network = classifyCheckInError(new TypeError('Failed to fetch'));
    const contract = classifyCheckInError(new Error('Error(Contract, #1)'));
    expect(network.message).not.toBe(contract.message);
  });
});
