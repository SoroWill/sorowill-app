import type { Meta, StoryObj } from '@storybook/react';
import { CopyAddress } from './CopyAddress';

const meta: Meta<typeof CopyAddress> = {
  title: 'Components/CopyAddress',
  component: CopyAddress,
  tags: ['autodocs'],
  args: {
    address: 'GDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  },
};

export default meta;
type Story = StoryObj<typeof CopyAddress>;

/** Happy path: a truncated address with a copy button. */
export const Default: Story = {};

export const TransactionHash: Story = {
  args: { address: '3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889' },
};

export const CustomLabel: Story = {
  args: { label: 'Owner wallet' },
};

/** Icon-only: no visible label. */
export const IconOnly: Story = {
  args: { label: null },
};

/** Edge case: an empty address (nothing to copy). */
export const EmptyAddress: Story = {
  args: { address: '' },
};
