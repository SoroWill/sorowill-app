import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';

vi.mock('@/lib/sorowill', () => ({
  getNetwork: vi.fn(() => 'testnet'),
  resetSoroWillClient: vi.fn(),
}));

// Stub out the confirmation UI so the test can drive its cancel/confirm
// callbacks without depending on its internal markup.
vi.mock('@/components/DestructiveActionConfirmation', () => ({
  DestructiveActionConfirmation: ({
    isOpen,
    onCancel,
    onConfirm,
  }: {
    isOpen: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }) =>
    isOpen ? (
      <div role="dialog">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    ) : null,
}));

describe('NetworkSwitcher', () => {
  it('reverts the dropdown to the original network via React state when the confirm dialog is cancelled', async () => {
    render(<NetworkSwitcher />);

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    expect(select.value).toBe('testnet');

    // User selects a different network, which should open the confirmation.
    fireEvent.change(select, { target: { value: 'mainnet' } });
    expect(await screen.findByRole('dialog')).toBeTruthy();

    // User cancels the confirmation dialog.
    fireEvent.click(screen.getByText('Cancel'));

    // Dialog closes and the controlled <select> value remains the original
    // network because the `network` state was never updated -- no direct
    // DOM mutation is involved.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(
      (screen.getByRole('combobox') as HTMLSelectElement).value,
    ).toBe('testnet');
  });
});
