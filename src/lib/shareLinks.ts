/**
 * Time-limited, encrypted share links for the read-only verify page (#875).
 *
 * A share token is AES-256-GCM encrypted JSON `{ w: willId, e: expiresAtMs, n: linkId }`,
 * so the will id and expiry cannot be read or altered without the server secret
 * (`SHARE_LINK_SECRET`). The link is `/verify/<willId>?share=<token>`; the verify page
 * opens the token and refuses expired or tampered links.
 *
 * Server-only: uses Node's crypto and the server secret.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/** Expiry choices offered in the UI, in hours. */
export const SHARE_LINK_TTL_HOURS = [1, 24, 24 * 7, 24 * 30] as const;
/** Longest allowed lifetime: 30 days. */
export const MAX_SHARE_LINK_TTL_HOURS = 24 * 30;

const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface ShareLinkPayload {
  willId: string;
  /** Epoch milliseconds after which the link is refused. */
  expiresAt: number;
  /** Random id used to track accesses to this link. */
  linkId: string;
}

export type OpenShareResult =
  | ({ ok: true } & ShareLinkPayload)
  | { ok: false; reason: 'invalid' | 'expired' | 'wrong-will'; expiresAt?: number };

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** The server secret; a dev-only fallback keeps local development working. */
export function shareLinkSecret(): string {
  const secret = process.env.SHARE_LINK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SHARE_LINK_SECRET must be set in production');
  }
  return 'sorowill-dev-share-link-secret';
}

export function createShareToken(
  willId: string,
  expiresAt: number,
  secret: string = shareLinkSecret(),
): { token: string; linkId: string } {
  const linkId = randomBytes(9).toString('base64url');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const plaintext = JSON.stringify({ w: willId, e: expiresAt, n: linkId });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const token = Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64url');
  return { token, linkId };
}

export function openShareToken(
  token: string,
  willId: string,
  now: number = Date.now(),
  secret: string = shareLinkSecret(),
): OpenShareResult {
  let payload: { w?: unknown; e?: unknown; n?: unknown };
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= IV_BYTES + TAG_BYTES) return { ok: false, reason: 'invalid' };
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(raw.length - TAG_BYTES);
    const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    payload = JSON.parse(plaintext);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (typeof payload.w !== 'string' || typeof payload.e !== 'number' || typeof payload.n !== 'string') {
    return { ok: false, reason: 'invalid' };
  }
  if (payload.w !== willId) return { ok: false, reason: 'wrong-will' };
  if (now >= payload.e) return { ok: false, reason: 'expired', expiresAt: payload.e };
  return { ok: true, willId: payload.w, expiresAt: payload.e, linkId: payload.n };
}

/** Validates a requested lifetime and returns the expiry instant. */
export function shareExpiryFromHours(hours: unknown, now: number = Date.now()): number | null {
  if (typeof hours !== 'number' || !Number.isInteger(hours)) return null;
  if (hours < 1 || hours > MAX_SHARE_LINK_TTL_HOURS) return null;
  return now + hours * 60 * 60 * 1000;
}

// Access tracking. In-memory per server instance, like the rate limiter:
// counts reset on restart and are not shared across instances.
const accessLog = new Map<string, { count: number; lastAccessAt: number }>();

export function recordShareAccess(linkId: string, now: number = Date.now()): number {
  const entry = accessLog.get(linkId) ?? { count: 0, lastAccessAt: now };
  entry.count += 1;
  entry.lastAccessAt = now;
  accessLog.set(linkId, entry);
  return entry.count;
}

export function getShareAccess(linkId: string): { count: number; lastAccessAt: number | null } {
  const entry = accessLog.get(linkId);
  return { count: entry?.count ?? 0, lastAccessAt: entry?.lastAccessAt ?? null };
}

/** Test helper. */
export function resetShareAccessLog(): void {
  accessLog.clear();
}
