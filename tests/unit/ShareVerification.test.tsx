import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShareVerification } from '@/components/ShareVerification';
import { ToastProvider } from '@/components/Toast';

// ShareVerification uses window.location.href and navigator.clipboard
// Both need to be mocked in jsdom.

function renderWithToast() {
  return render(
    <ToastProvider>
      <ShareVerification />
    </ToastProvider>,
  );
}

describe('ShareVerification — copy failure toast (#241)', () => {
  beforeEach(() => {
    // Mock navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    // QRCode.toDataURL is not available in jsdom, silence its error
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a toast error when clipboard write fails', async () => {
    // Arrange: clipboard always rejects
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Permission denied'),
    );

    renderWithToast();

    // Wait for component to mount (useMounted hook triggers after first render)
    const copyButton = await screen.findByRole('button', { name: /copy link/i });
    fireEvent.click(copyButton);

    // Assert: an error toast appears with a user-visible message
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent(/failed to copy/i);
  });

  it('does not show an error toast on successful copy', async () => {
    // Arrange: clipboard succeeds
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    renderWithToast();

    const copyButton = await screen.findByRole('button', { name: /copy link/i });
    fireEvent.click(copyButton);

    // The button should flip to "Copied!" feedback, not an error toast
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });

    // No error toast visible
    expect(screen.queryByRole('status')).toBeNull();
  });
});
