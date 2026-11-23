import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { NetworkBadge } from './NetworkBadge';

/** The badge asks the RPC for its health when it mounts; each story replaces `fetch` to show one outcome. */
function withRpc(respond: () => Promise<Response>): Decorator {
  return (Story) => {
    globalThis.fetch = (() => respond()) as typeof fetch;
    return <Story />;
  };
}

const json = (body: unknown, init?: ResponseInit) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200, ...init }));

const meta: Meta<typeof NetworkBadge> = {
  title: 'Components/NetworkBadge',
  component: NetworkBadge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof NetworkBadge>;

/** Happy path: the RPC answers quickly. */
export const Connected: Story = {
  decorators: [withRpc(() => json({ result: {} }))],
};

/** Loading state: the RPC never answers, so the badge stays on "checking". */
export const Checking: Story = {
  decorators: [withRpc(() => new Promise<Response>(() => {}))],
};

/** Error state: the RPC is unreachable. */
export const Offline: Story = {
  decorators: [withRpc(() => Promise.reject(new Error('Failed to fetch')))],
};

/** Error state: the RPC answers with HTTP 503. */
export const ServerError: Story = {
  decorators: [withRpc(() => json({}, { status: 503 }))],
};

/** The RPC is rate limiting. */
export const RateLimited: Story = {
  decorators: [withRpc(() => json({}, { status: 429 }))],
};
