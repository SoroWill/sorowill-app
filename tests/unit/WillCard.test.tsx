import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WillCard, willCardPropsAreEqual } from '@/components/WillCard';
import { WillStatus, type Will } from '@sorowill/sdk';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@sorowill/sdk', () => ({
  WillStatus: { Active: 'Active', Triggered: 'Triggered', Released: 'Released', Cancelled: 'Cancelled' },
  formatUSDC: (amount: bigint | string) => (Number(amount) / 1_000_000).toFixed(2),
  getTimeUntilCheckin: () => 86_400 * 5,
}));

vi.mock('@/components/StatusBanner', () => ({
  StatusBanner: ({ status, compact }: { status: string; compact?: boolean }) => (
    <span data-testid="status-banner" data-status={status} data-compact={compact}>
      {status}
    </span>
  ),
}));

function makeWill(overrides: Record<string, unknown> = {}): Will {
  return {
    id: '1',
    owner: 'GABC...XYZ',
    status: WillStatus.Active,
    balance: '1000000000',
    token: 'CUSDC...',
    checkinPeriodDays: 90,
    lastCheckin: new Date(Date.now() - 86_400_000 * 30),
    gracePeriodDays: 7,
    triggerTime: null,
    beneficiaries: [],
    guardians: [],
    guardianVotes: 0,
    ...overrides,
  } as Will;
}

describe('WillCard', () => {
  it('shows the creation time as relative time', () => {
    render(<WillCard will={makeWill({ createdAt: new Date(Date.now() - 62 * 86_400_000) })} />);
    expect(screen.getByText('Created 2 months ago')).toBeInTheDocument();
  });

  it('renders will ID and balance', () => {
    render(<WillCard will={makeWill({ id: '42', balance: '500000000' })} />);
    expect(screen.getByText('Will #42')).toBeInTheDocument();
    expect(screen.getByText('500.00 USDC locked')).toBeInTheDocument();
  });

  it('shows check-in button when onCheckIn is provided and will is active', () => {
    render(<WillCard will={makeWill()} onCheckIn={vi.fn()} />);
    // The button uses aria-label="Check in for will {id}"
    expect(screen.getByRole('button', { name: /check in for will/i })).toBeInTheDocument();
  });

  it('hides check-in button when onCheckIn is not provided', () => {
    render(<WillCard will={makeWill()} />);
    expect(screen.queryByRole('button', { name: /check in for will/i })).not.toBeInTheDocument();
  });

  it('hides check-in button when will is not active', () => {
    render(<WillCard will={makeWill({ status: WillStatus.Released })} onCheckIn={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /check in for will/i })).not.toBeInTheDocument();
  });

  it('calls onCheckIn with will id when clicked', () => {
    const onCheckIn = vi.fn();
    render(<WillCard will={makeWill({ id: '7' })} onCheckIn={onCheckIn} />);
    screen.getByRole('button', { name: /check in for will 7/i }).click();
    expect(onCheckIn).toHaveBeenCalledWith('7');
  });

  it('shows checking in state when checkingIn is true', () => {
    render(<WillCard will={makeWill()} onCheckIn={vi.fn()} checkingIn />);
    // When checking in, the button is disabled
    expect(screen.getByRole('button', { name: /check in for will/i })).toBeDisabled();
  });

  it('always shows details link', () => {
    render(<WillCard will={makeWill({ id: '5' })} />);
    // The link uses aria-label="View details for will {id}"
    expect(screen.getByRole('link', { name: /view details for will 5/i })).toHaveAttribute('href', '/will/5');
  });

  it('shows overdue text when check-in is overdue', () => {
    render(<WillCard will={makeWill()} />);
    expect(screen.getByText('Check-in due in 5 days')).toBeInTheDocument();
  });

  it('exposes beneficiaries as a semantic list with correct length', () => {
    render(
      <WillCard
        will={makeWill({
          beneficiaries: [
            { address: 'GBENEF1', percentage: 50 },
            { address: 'GBENEF2', percentage: 30 },
            { address: 'GBENEF3', percentage: 20 },
          ],
        })}
      />,
    );
    const list = screen.getByRole('list', { name: /beneficiaries/i });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('does not re-render when an unrelated parent update passes an equivalent will', () => {
    const beneficiaries = [{ address: 'GBENEF1', percentage: 100 }];
    const will = makeWill({ beneficiaries });
    const refetched = makeWill({ beneficiaries: [{ address: 'GBENEF1', percentage: 100 }], lastCheckin: will.lastCheckin });
    expect(willCardPropsAreEqual({ will }, { will: refetched })).toBe(true);
    expect(
      willCardPropsAreEqual(
        { will },
        { will: makeWill({ beneficiaries: [{ address: 'GOTHER', percentage: 100 }], lastCheckin: will.lastCheckin }) },
      ),
    ).toBe(false);
  });
});
