'use client';

import Link from 'next/link';

import { formatError } from '@/lib/errors';

const SUPPORT_URL = 'https://github.com/SoroWill/sorowill-app/issues';

/**
 * A short reference users can quote when asking for help: the Next.js error
 * digest when there is one, otherwise the contract error number (`Error(Contract, #N)`).
 */
function errorReference(error: Error & { digest?: string }): string | null {
  if (error.digest) return error.digest;
  const contractError = /Error\(Contract,\s*#(\d+)\)/.exec(error.message ?? '');
  return contractError ? `Contract error #${contractError[1]}` : null;
}

// Route-segment boundary: rendered inside RootLayout's <body>, so it must not
// emit its own <html>/<body>.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const reference = errorReference(error);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-will-light">
      <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">SoroWill hit an unexpected error</h1>
        <p className="mt-2 text-sm text-red-300/70">{formatError(error)}</p>
        {reference && (
          <p className="mt-2 text-xs text-red-300/60">
            Error code: <code className="font-mono">{reference}</code>
          </p>
        )}
        <div className="mt-4 text-left text-sm text-will-light/70">
          <p className="font-medium text-will-light/80">Things to try</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Select &quot;Try again&quot;, or reload the page.</li>
            <li>Check your internet connection and that your wallet is on the right network.</li>
            <li>Reconnect your wallet, then repeat the action.</li>
            <li>An error shown on this page does not by itself move or change your funds.</li>
          </ul>
        </div>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70"
        >
          Try again
        </button>
        <p className="mt-4 text-xs text-will-light/60">
          Still stuck? Read the{' '}
          <Link href="/faq" className="underline hover:text-will-light">
            FAQ
          </Link>{' '}
          or{' '}
          <a href={SUPPORT_URL} target="_blank" rel="noreferrer" className="underline hover:text-will-light">
            contact support
          </a>
          {reference ? ' and include the error code.' : '.'}
        </p>
      </div>
    </div>
  );
}
