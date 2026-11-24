import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WillPasswordGate } from '@/components/WillPasswordGate';
import { createWillLock } from '@/lib/willPassword';

const WILL_ID = '7';
const PASSWORD = 'a long enough password';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('WillPasswordGate (#874)', () => {
  it('renders the content directly when the will is not protected', async () => {
    render(
      <WillPasswordGate willId={WILL_ID}>
        <p>private details</p>
      </WillPasswordGate>,
    );

    expect(await screen.findByText('private details')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('prompts for the password and only reveals the content when it is right', async () => {
    await createWillLock(WILL_ID, PASSWORD, 'first pet');
    // A fresh tab/session: the tab that created the lock is unlocked by design.
    sessionStorage.clear();
    const user = userEvent.setup();

    render(
      <WillPasswordGate willId={WILL_ID}>
        <p>private details</p>
      </WillPasswordGate>,
    );

    expect(await screen.findByText(/password-protected/i)).toBeInTheDocument();
    expect(screen.getByText('Hint: first pet')).toBeInTheDocument();
    expect(screen.queryByText('private details')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Password'), 'wrong password');
    await user.click(screen.getByRole('button', { name: /unlock will/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect password/i);
    expect(screen.queryByText('private details')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: /unlock will/i }));

    await waitFor(() => expect(screen.getByText('private details')).toBeInTheDocument());
  });

  it('does not re-prompt in a tab that already unlocked the will', async () => {
    await createWillLock(WILL_ID, PASSWORD);

    render(
      <WillPasswordGate willId={WILL_ID}>
        <p>private details</p>
      </WillPasswordGate>,
    );

    expect(await screen.findByText('private details')).toBeInTheDocument();
  });
});
