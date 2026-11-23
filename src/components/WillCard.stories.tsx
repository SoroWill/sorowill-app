import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { WillStatus, type Will } from '@sorowill/sdk';
import { WillCard } from './WillCard';

function makeWill(overrides: Partial<Will> = {}): Will {
  return {
    id: '42',
    owner: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    token: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    balance: '1000000000', // 1000 USDC (7 decimals)
    beneficiaries: [
      { address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 60 },
      { address: 'GBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', percentage: 40 },
    ],
    guardians: ['GCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    guardianVotes: 0,
    status: WillStatus.Active,
    checkinPeriodDays: 90,
    gracePeriodDays: 7,
    lastCheckin: new Date(Date.now() - 30 * 86_400_000), // 30 days ago
    triggerTime: null,
    ...overrides,
  };
}

const meta: Meta<typeof WillCard> = {
  title: 'Components/WillCard',
  component: WillCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof WillCard>;

export const ActiveWithCheckIn: Story = {
  args: {
    will: makeWill(),
    onCheckIn: fn(),
    checkingIn: false,
  },
};

export const ActiveNearDeadline: Story = {
  args: {
    will: makeWill({ lastCheckin: new Date(Date.now() - 88 * 86_400_000) }),
    onCheckIn: fn(),
  },
};

export const ActiveOverdue: Story = {
  args: {
    will: makeWill({ lastCheckin: new Date(Date.now() - 95 * 86_400_000) }),
    onCheckIn: fn(),
  },
};

export const CheckingIn: Story = {
  args: {
    will: makeWill(),
    onCheckIn: fn(),
    checkingIn: true,
  },
};

export const Triggered: Story = {
  args: {
    will: makeWill({
      status: WillStatus.Triggered,
      triggerTime: new Date(Date.now() - 2 * 86_400_000),
    }),
  },
};

export const Released: Story = {
  args: {
    will: makeWill({ status: WillStatus.Released }),
  },
};

export const Cancelled: Story = {
  args: {
    will: makeWill({ status: WillStatus.Cancelled }),
  },
};

export const WithoutCheckInButton: Story = {
  args: {
    will: makeWill(),
  },
};

/** Empty state: a will with no beneficiaries listed. */
export const NoBeneficiaries: Story = {
  args: {
    will: makeWill({ beneficiaries: [] }),
    onCheckIn: fn(),
  },
};

/** Edge case: a long beneficiary list. */
export const ManyBeneficiaries: Story = {
  args: {
    will: makeWill({
      beneficiaries: Array.from({ length: 8 }, (_, index) => ({
        address: `G${String.fromCharCode(65 + index)}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
        percentage: index < 4 ? 15 : 10,
      })),
    }),
    onCheckIn: fn(),
  },
};

/** Edge case: a zero balance. */
export const ZeroBalance: Story = {
  args: {
    will: makeWill({ balance: '0' }),
    onCheckIn: fn(),
  },
};

/** The dashboard search matches the will ID and a beneficiary address. */
export const SearchHighlight: Story = {
  args: {
    will: makeWill(),
    searchQuery: '42',
  },
};

/** Inheriting tab: the connected wallet is a beneficiary and sees its share. */
export const WithEntitledShare: Story = {
  args: {
    will: makeWill({ status: WillStatus.Triggered, triggerTime: new Date(Date.now() - 2 * 86_400_000) }),
    connectedAddress: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    showEntitledShare: true,
  },
};
