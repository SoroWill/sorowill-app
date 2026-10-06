import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { CopyAddress } from '@/components/CopyAddress';
import { ToastProvider } from '@/components/Toast';
import messages from '@/messages/en.json';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe('CopyAddress clipboard error handling (#220)', () => {
  it('surfaces a toast on clipboard failure', async () => {
    const originalClipboard = navigator.clipboard;
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Clipboard failure')),
      },
    });

    renderWithProviders(<CopyAddress address="GA1234567890ABCDEF1234567890ABCDEF1234567890AB" />);

    const copyBtn = screen.getByRole('button', { name: /copy/i });
    copyBtn.click();

    expect(await screen.findByRole('alert')).toBeInTheDocument();

    Object.assign(navigator, { clipboard: originalClipboard });
  });
});
