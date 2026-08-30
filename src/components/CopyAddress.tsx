'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { truncateAddress } from '@/lib/freighter';
import { useToast } from '@/components/Toast';

export interface CopyAddressProps {
  /** The full address or transaction hash to copy. */
  address: string;
  /**
   * Custom display label. Defaults to `truncateAddress(address)`.
   * Pass `null` to render no visible label (icon-only button).
   */
  label?: string | null;
  /** Additional className applied to the wrapper element. */
  className?: string;
}

/**
 * Renders a truncated address with a small copy-to-clipboard button.
 * Shows a brief 'Copied!' confirmation for 2 seconds after a successful copy.
 */
export function CopyAddress({ address, label, className = '' }: CopyAddressProps) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const t = useTranslations('common');

  const displayLabel = label !== undefined ? label : truncateAddress(address);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context or permission denied).
      toast.error(t('clipboardError'));
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {displayLabel !== null && (
        <span className="font-mono">{displayLabel}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : `Copy ${address}`}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        className="text-will-light/40 transition hover:text-will-light/80 focus:outline-none focus-visible:ring-1 focus-visible:ring-will-purple rounded"
      >
        {copied ? (
          // Checkmark icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-emerald-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          // Copy icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      {copied && (
        <span className="text-xs text-emerald-400" aria-live="polite">
          Copied!
        </span>
      )}
    </span>
  );
}
