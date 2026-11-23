import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { ShareVerification } from './ShareVerification';

/** Replaces `navigator.share` for one story: present means a "Share Link" button, absent means "Copy Link". */
function withShare(available: boolean): Decorator {
  return (Story) => {
    Object.defineProperty(navigator, 'share', {
      value: available ? async () => {} : undefined,
      configurable: true,
      writable: true,
    });
    return <Story />;
  };
}

const meta: Meta<typeof ShareVerification> = {
  title: 'Components/ShareVerification',
  component: ShareVerification,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ShareVerification>;

/** Happy path on a desktop browser: the QR code, the link and a Copy Link button. */
export const CopyLink: Story = {
  decorators: [withShare(false)],
};

/** On a phone with a share sheet the main button is Share Link. */
export const ShareSheet: Story = {
  decorators: [withShare(true)],
};
