/**
 * Time-based one-time passwords (RFC 6238) and recovery codes, used by the
 * two-factor authentication routes (issue #879).
 *
 * This module is server-only: it uses `node:crypto` to compute HMACs with the
 * shared secret, which must never reach the browser. Clients are given the
 * otpauth URI (or a QR code of it) only while enrolling.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 4648 base32, the alphabet authenticator apps expect. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_LOOKUP = new Map([...BASE32_ALPHABET].map((char, index) => [char, index]));

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Accept the previous and next step, so a slightly skew clock still verifies. */
export const TOTP_DEFAULT_WINDOW = 1;
export const TOTP_SECRET_BYTES = 20;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const digit = BASE32_LOOKUP.get(char);
    if (digit === undefined) {
      throw new Error('Invalid base32 secret.');
    }
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

/** A fresh 160-bit shared secret, base32 encoded. */
export function generateTotpSecret(bytes: number = TOTP_SECRET_BYTES): string {
  return base32Encode(randomBytes(bytes));
}

function hotp(secret: string, counter: number, digits: number, algorithm: 'sha1' | 'sha256' | 'sha512'): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(algorithm, key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export interface TotpOptions {
  digits?: number;
  period?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
  /** Time in milliseconds; defaults to now. */
  now?: number;
}

/** The code valid for the step containing `now` (used by tests and debugging). */
export function computeTotp(secret: string, options: TotpOptions = {}): string {
  const { digits = TOTP_DIGITS, period = TOTP_PERIOD_SECONDS, algorithm = 'sha1', now = Date.now() } = options;
  return hotp(secret, Math.floor(now / 1000 / period), digits, algorithm);
}

export interface VerifyTotpOptions extends TotpOptions {
  /** Number of steps either side of `now` to accept. Defaults to 1. */
  window?: number;
}

/** Stable, constant-time comparison of two short numeric strings. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Verifies a 6-digit authenticator code. Spaces and dashes are ignored so
 * "123 456" from a copy-paste works. Returns false rather than throwing for a
 * malformed code or secret, so callers can treat it as a normal failed attempt.
 */
export function verifyTotp(secret: string, token: string, options: VerifyTotpOptions = {}): boolean {
  const {
    digits = TOTP_DIGITS,
    period = TOTP_PERIOD_SECONDS,
    algorithm = 'sha1',
    now = Date.now(),
    window = TOTP_DEFAULT_WINDOW,
  } = options;

  const submitted = token.replace(/[\s-]/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(submitted)) return false;

  const step = Math.floor(now / 1000 / period);
  try {
    for (let offset = -window; offset <= window; offset += 1) {
      const candidate = hotp(secret, step + offset, digits, algorithm);
      if (safeEqual(candidate, submitted)) return true;
    }
  } catch {
    // An unparseable secret cannot verify anything.
  }
  return false;
}

export interface OtpAuthUriOptions {
  issuer: string;
  accountName: string;
  digits?: number;
  period?: number;
  algorithm?: 'sha1' | 'sha256' | 'sha512';
}

/**
 * Builds the `otpauth://` URI that authenticator apps import. The account name
 * is typically the user's wallet address, so it is shortened by callers if
 * needed.
 */
export function buildOtpAuthUri(secret: string, options: OtpAuthUriOptions): string {
  const { issuer, accountName, digits = TOTP_DIGITS, period = TOTP_PERIOD_SECONDS, algorithm = 'sha1' } = options;
  const label = `${issuer}:${accountName}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: algorithm.toUpperCase(),
    digits: String(digits),
    period: String(period),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 8;

/** A recovery code such as `K3M7-9QXA` (base32, four characters per group). */
export function generateRecoveryCode(): string {
  const code = base32Encode(randomBytes(5)).slice(0, RECOVERY_CODE_LENGTH);
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A fresh set of single-use recovery codes. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateRecoveryCode());
  return [...codes];
}

/**
 * Strips formatting so a typed or pasted code compares consistently. Only
 * separators are removed: dropping other characters could turn an invalid code
 * into a collision with a real one.
 */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/** Hashes a recovery code for storage, so the plaintext is never kept. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** A random numeric SMS code with the given number of digits. */
export function generateSmsCode(digits: number = TOTP_DIGITS): string {
  const max = 10 ** digits;
  // randomBytes gives a uniform value; modulo bias over such a small range is negligible.
  const value = randomBytes(4).readUInt32BE(0) % max;
  return String(value).padStart(digits, '0');
}
