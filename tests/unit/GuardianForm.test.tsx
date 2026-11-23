/**
 * Tests for GuardianForm (#257).
 *
 * The key regression guard: GuardianForm must disable the "Add guardian"
 * button at exactly MAX_GUARDIANS (from @/lib/constants), not any hardcoded
 * alternative value. If someone edits constants.ts, the test automatically
 * tracks the change.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { GuardianForm } from '@/components/GuardianForm';
import { MAX_GUARDIANS } from '@/lib/constants';

// GuardianForm imports isFederatedAddress — stub it so tests don't need
// real federated-address infrastructure.
vi.mock('@/lib/federated', () => ({
  isFederatedAddress: () => false,
  resolveFederatedAddress: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build stable guardian IDs for a list of guardians. */
function makeGuardianIds(guardians: string[]): Map<number, string> {
  return new Map(guardians.map((_, i) => [i, `id-${i}`]));
}

/** Minimal props for a GuardianForm with no validation state. */
function baseProps(guardians: string[]) {
  return {
    guardians,
    guardianIds: makeGuardianIds(guardians),
    resolvedGuardians: new Map<string, string>(),
    guardianResolutionError: new Map<string, string>(),
    resolvingGuardianId: null,
    rowErrors: guardians.map(() => ''),
    topError: null,
    blankGuardianIndices: [],
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onUpdate: vi.fn(),
    onResolve: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GuardianForm — Add guardian button', () => {
  it('is enabled when the list is empty', () => {
    render(<GuardianForm {...baseProps([])} />);
    expect(screen.getByRole('button', { name: /add guardian/i })).not.toBeDisabled();
  });

  it('is enabled when guardians.length < MAX_GUARDIANS', () => {
    const guardians = Array.from({ length: MAX_GUARDIANS - 1 }, (_, i) => `GADDR${i}`);
    render(<GuardianForm {...baseProps(guardians)} />);
    expect(screen.getByRole('button', { name: /add guardian/i })).not.toBeDisabled();
  });

  it('is disabled when guardians.length === MAX_GUARDIANS', () => {
    const guardians = Array.from({ length: MAX_GUARDIANS }, (_, i) => `GADDR${i}`);
    render(<GuardianForm {...baseProps(guardians)} />);
    expect(screen.getByRole('button', { name: /add guardian/i })).toBeDisabled();
  });

  it('calls onAdd when clicked while under the limit', async () => {
    const user = userEvent.setup();
    const props = baseProps([]);
    render(<GuardianForm {...props} />);

    await user.click(screen.getByRole('button', { name: /add guardian/i }));
    expect(props.onAdd).toHaveBeenCalledOnce();
  });

  it('does not call onAdd when at the limit (button is disabled)', async () => {
    const user = userEvent.setup();
    const guardians = Array.from({ length: MAX_GUARDIANS }, (_, i) => `GADDR${i}`);
    const props = baseProps(guardians);
    render(<GuardianForm {...props} />);

    // Clicking a disabled button should not fire the handler.
    await user.click(screen.getByRole('button', { name: /add guardian/i }));
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('aria-label reflects the current count and MAX_GUARDIANS', () => {
    const guardians = ['GADDR0'];
    render(<GuardianForm {...baseProps(guardians)} />);
    expect(
      screen.getByRole('button', {
        name: `Add Guardian (1 of ${MAX_GUARDIANS})`,
      }),
    ).toBeInTheDocument();
  });
});

describe('GuardianForm — limit is sourced from @/lib/constants', () => {
  it('MAX_GUARDIANS from constants equals the disable threshold in the component', () => {
    // Render at exactly MAX_GUARDIANS — must be disabled.
    const atLimit = Array.from({ length: MAX_GUARDIANS }, (_, i) => `GADDR${i}`);
    const { rerender } = render(<GuardianForm {...baseProps(atLimit)} />);
    expect(screen.getByRole('button', { name: /add guardian/i })).toBeDisabled();

    // Render at MAX_GUARDIANS - 1 — must be enabled.
    const belowLimit = atLimit.slice(0, MAX_GUARDIANS - 1);
    rerender(<GuardianForm {...baseProps(belowLimit)} />);
    expect(screen.getByRole('button', { name: /add guardian/i })).not.toBeDisabled();
  });
});

describe('GuardianForm — remove button', () => {
  it('renders a remove button for each guardian row', () => {
    const guardians = ['GADDR0', 'GADDR1'];
    render(<GuardianForm {...baseProps(guardians)} />);
    expect(screen.getAllByRole('button', { name: /remove guardian/i })).toHaveLength(2);
  });

  it('calls onRemove with the correct index', async () => {
    const user = userEvent.setup();
    const guardians = ['GADDR0', 'GADDR1'];
    const props = baseProps(guardians);
    render(<GuardianForm {...props} />);

    await user.click(screen.getByRole('button', { name: 'Remove Guardian 1' }));
    expect(props.onRemove).toHaveBeenCalledWith(0);
  });
});

describe('GuardianForm — validation display', () => {
  it('shows topError when provided', () => {
    const props = {
      ...baseProps(['GBADADDR']),
      topError: 'You can add at most 3 guardians.',
    };
    render(<GuardianForm {...props} />);
    expect(screen.getByRole('alert', { name: undefined })).toHaveTextContent(
      'You can add at most 3 guardians.',
    );
  });

  it('shows per-row error for the matching index', () => {
    const props = {
      ...baseProps(['GBADADDR']),
      rowErrors: ['Not a valid Stellar address'],
    };
    render(<GuardianForm {...props} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Not a valid Stellar address');
  });
});

describe('GuardianForm — label associations (#672)', () => {
  it('associates each guardian input with a <label> whose htmlFor matches the input id', () => {
    const guardians = ['GADDR0', 'GADDR1'];
    render(<GuardianForm {...baseProps(guardians)} />);

    const first = screen.getByLabelText('Guardian 1 Address');
    const second = screen.getByLabelText('Guardian 2 Address');

    expect(first.tagName).toBe('INPUT');
    expect(second.tagName).toBe('INPUT');
    expect(first).toHaveAttribute('id', 'guardian-0');
    expect(second).toHaveAttribute('id', 'guardian-1');

    // The resolved label must point back at the input via htmlFor.
    expect(document.querySelector('label[for="guardian-0"]')).toHaveTextContent(
      'Guardian 1 Address',
    );
    expect(document.querySelector('label[for="guardian-1"]')).toHaveTextContent(
      'Guardian 2 Address',
    );
  });
});

describe('GuardianForm — owner address as guardian (#386)', () => {
  const OWNER = 'GBRT6OQL3NICNKX6FFDVAZ36IABM5EB7HDNRPQ4QEMK4TJAUUMFYNFXB';
  const OTHER = 'GDMALMOLFTCHCB74BAEZLLXFXQK57JE4BTFS2C3WJGSVF4637PRHII5S';

  it('rejects a row matching the owner address', () => {
    render(<GuardianForm {...baseProps([OWNER])} ownerAddress={OWNER} />);
    expect(screen.getByRole('alert')).toHaveTextContent('You cannot be your own guardian');
    expect(screen.getByLabelText('Guardian 1 Address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('highlights only the owner row among already-added guardians', () => {
    render(<GuardianForm {...baseProps([OTHER, ` ${OWNER} `])} ownerAddress={OWNER} />);
    expect(screen.getByLabelText('Guardian 1 Address')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Guardian 2 Address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('accepts all non-owner addresses', () => {
    render(<GuardianForm {...baseProps([OTHER])} ownerAddress={OWNER} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Guardian 1 Address')).not.toHaveAttribute('aria-invalid');
  });
});

describe('GuardianForm — prevents adding owner as guardian (#659)', () => {
  const OWNER = 'GBRT6OQL3NICNKX6FFDVAZ36IABM5EB7HDNRPQ4QEMK4TJAUUMFYNFXB';
  const OTHER = 'GDMALMOLFTCHCB74BAEZLLXFXQK57JE4BTFS2C3WJGSVF4637PRHII5S';

  it('does not call onAdd when the owner address is entered', async () => {
    const user = userEvent.setup();
    const props = baseProps([]);
    render(<GuardianForm {...props} ownerAddress={OWNER} />);

    await user.type(screen.getByLabelText('Guardian 1 Address'), OWNER);
    await user.click(screen.getByRole('button', { name: /add guardian/i }));

    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it('shows the owner-as-guardian error when the owner address is entered', async () => {
    const user = userEvent.setup();
    const props = baseProps([]);
    render(<GuardianForm {...props} ownerAddress={OWNER} />);

    await user.type(screen.getByLabelText('Guardian 1 Address'), OWNER);
    await user.click(screen.getByRole('button', { name: /add guardian/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('You cannot be your own guardian');
    expect(screen.getByLabelText('Guardian 1 Address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('still calls onAdd for a non-owner address', async () => {
    const user = userEvent.setup();
    const props = baseProps([]);
    render(<GuardianForm {...props} ownerAddress={OWNER} />);

    await user.type(screen.getByLabelText('Guardian 1 Address'), OTHER);
    await user.click(screen.getByRole('button', { name: /add guardian/i }));

    expect(props.onAdd).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
