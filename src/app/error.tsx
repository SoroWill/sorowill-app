'use client';

import Link from 'next/link';
import { formatError } from '@/lib/errors';

// Route-segment boundary: rendered inside RootLayout's <body>, so it must not
// emit its own <html>/<body>.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 text-will-light">
      <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">SoroWill hit an unexpected error</h1>
        <p className="mt-2 text-sm text-red-300/70">{formatError(error)}</p>
        {error.digest && (
          <p className="mt-2 text-xs text-red-300/50">
            Error code: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400/70"
        >
          Try again
        </button>
        <div className="mt-6 text-left text-sm text-red-300/70">
          <p className="font-medium text-red-300">How to recover</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Click &ldquo;Try again&rdquo; to retry the last action.</li>
            <li>Refresh the page if the error persists.</li>
            <li>Check your internet connection and wallet network.</li>
          </ul>
        </div>
        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link href="/faq" className="text-red-300 underline transition hover:text-red-200">
            Read the documentation
          </Link>
          <Link href="/contact" className="text-red-300 underline transition hover:text-red-200">
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
