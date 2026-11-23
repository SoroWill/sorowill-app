import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { DestructiveActionConfirmation } from './DestructiveActionConfirmation';

const meta: Meta<typeof DestructiveActionConfirmation> = {
  title: 'Components/DestructiveActionConfirmation',
  component: DestructiveActionConfirmation,
  tags: ['autodocs'],
  args: {
    isOpen: true,
    willId: '42',
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof DestructiveActionConfirmation>;

/** Cancelling a will: the person types CONFIRM. */
export const CancelWill: Story = {
  args: { action: 'cancel_will' },
};

/** Cancelling a will with the stricter check: the person types the will ID. */
export const CancelWillTypeTheId: Story = {
  args: { action: 'cancel_will', confirmationType: 'willId' },
};

export const SwitchNetwork: Story = {
  args: { action: 'switch_network', willId: '' },
};

/** Edge case: an action the dialog has no special copy for. */
export const UnknownAction: Story = {
  args: { action: 'something_else' },
};

/** Closed: renders nothing. */
export const Closed: Story = {
  args: { action: 'cancel_will', isOpen: false },
};
