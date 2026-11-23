/**
 * Expiry handling for signed verification links (#817).
 *
 * A verification link may carry the time it was signed (`signedAt`, Unix seconds) and,
 * optionally, the time it stops being valid (`expires`, Unix seconds). Without `expires`, a
 * signature is valid for `DEFAULT_SIGNATURE_TTL_SECONDS` after it was signed.
 */

/** How long a signature stays valid when the link has no explicit expiry: 7 days. */
export const DEFAULT_SIGNATURE_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SignatureInfo {
  /** Unix seconds when the signature was made. */
  signedAt: number;
  /** Unix seconds when it stops being valid. */
  expiresAt: number;
}

export interface SignatureExpiryStatus extends SignatureInfo {
  expired: boolean;
  /** Milliseconds since signing (never negative). */
  sinceSignedMs: number;
}

function parseUnixSeconds(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Reads the signature fields from a link's query parameters. Returns null when the link carries
 * no valid `signedAt`, which means it is not a signed link and nothing needs to be checked.
 */
export function parseSignatureInfo(params: {
  signedAt?: string | string[];
  expires?: string | string[];
}): SignatureInfo | null {
  const signedAt = parseUnixSeconds(params.signedAt);
  if (signedAt === null) return null;
  const expires = parseUnixSeconds(params.expires);
  return { signedAt, expiresAt: expires ?? signedAt + DEFAULT_SIGNATURE_TTL_SECONDS };
}

export function getSignatureExpiryStatus(info: SignatureInfo, nowMs: number = Date.now()): SignatureExpiryStatus {
  return {
    ...info,
    expired: nowMs >= info.expiresAt * 1000,
    sinceSignedMs: Math.max(0, nowMs - info.signedAt * 1000),
  };
}

/** "5 minutes", "3 hours" or "2 days": the largest whole unit, for text like "signed 3 hours ago". */
export function formatTimeSince(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
