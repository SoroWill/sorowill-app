import Link from 'next/link';

import { formatTimeSince, type SignatureExpiryStatus } from '@/lib/signatureExpiry';

export interface SignatureExpiryNoticeProps {
  status: SignatureExpiryStatus;
  willId: string;
}

/**
 * Banner for a verification link that carries a signature (#817). An expired signature gets a
 * clear message, how long ago it was signed and a link to a fresh verification link; a valid one
 * shows when it was signed and when it expires.
 */
export function SignatureExpiryNotice({ status, willId }: SignatureExpiryNoticeProps) {
  const since = formatTimeSince(status.sinceSignedMs);

  if (status.expired) {
    return (
      <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
        <p className="font-semibold">This signature has expired</p>
        <p className="mt-1 text-amber-200/80">
          It was signed {since} ago and expired on{' '}
          <time dateTime={new Date(status.expiresAt * 1000).toISOString()}>
            {new Date(status.expiresAt * 1000).toUTCString()}
          </time>
          . The will details below still come straight from the contract.
        </p>
        <Link
          href={`/verify/${willId}`}
          className="mt-3 inline-block rounded-full border border-amber-300/40 px-4 py-1.5 text-xs font-medium text-amber-100 transition hover:border-amber-300/70"
        >
          Create a new verification link
        </Link>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-will-light/70">
      Signed {since} ago. Valid until{' '}
      <time dateTime={new Date(status.expiresAt * 1000).toISOString()}>
        {new Date(status.expiresAt * 1000).toUTCString()}
      </time>
      .
    </div>
  );
}
