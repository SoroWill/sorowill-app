import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Issue #207: the stats page claimed Total Value Locked was "Displayed in
 * millions for readability", but the code divides by 10^6 to convert USDC base
 * units into whole USDC. These tests pin the actual behavior to the copy so the
 * two cannot drift apart again.
 */

const getProtocolStats = vi.fn();

vi.mock('@/lib/sorowill', () => ({
  getSoroWillClient: () => ({ getProtocolStats }),
}));

import { StatsContent } from '@/app/stats/content';

describe('StatsContent — Total Value Locked (#207)', () => {
  beforeEach(() => {
    getProtocolStats.mockReset();
  });

  function mockTvl(totalValueLocked: string) {
    getProtocolStats.mockResolvedValue({
      totalWills: 3,
      totalValueLocked,
      activeWills: 2,
      completedInheritances: 1,
    });
  }

  it('renders 42 base-unit-scaled USDC as "42 USDC", not a millions figure', async () => {
    // 42_000_000 base units = 42 USDC.
    mockTvl('42000000');
    render(<StatsContent />);

    expect(await screen.findByText('42 USDC')).toBeInTheDocument();
    // The old copy would have implied "0.000042 million".
    expect(screen.queryByText(/0\.000042/)).not.toBeInTheDocument();
  });

  it('rounds down to whole USDC, matching the copy', async () => {
    // 42_750_000 base units = 42.75 USDC; BigInt division truncates to 42.
    mockTvl('42750000');
    render(<StatsContent />);

    expect(await screen.findByText('42 USDC')).toBeInTheDocument();
  });

  it('no longer claims the value is displayed in millions', async () => {
    mockTvl('42000000');
    const { container } = render(<StatsContent />);

    await screen.findByText('42 USDC');
    expect(container.textContent).not.toMatch(/million/i);
  });

  it('describes the base-unit conversion actually performed', async () => {
    mockTvl('42000000');
    const { container } = render(<StatsContent />);

    await waitFor(() => {
      expect(container.textContent).toMatch(/1 USDC = 1,000,000 base units/);
    });
    expect(container.textContent).toMatch(/rounded down to the nearest whole USDC/);
  });
});
