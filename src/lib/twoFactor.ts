/**
 * Two-factor authentication state (issue #879).
 *
 * The app has no user database: identity is the connected Stellar wallet. So
 * an enrollment is kept in a signed, HttpOnly cookie instead of a server
 * session store. The cookie is HMAC-signed with `TWO_FACTOR_SECRET`, so the
 * browser can hold it but cannot read or alter it.
 *
 * Two cookies are involved:
 *   - the *enrollment* cookie, short-lived, holds the TOTP secret (or the hash
 *     of the pending SMS code) while the user proves they can produce a code;
 *   - the *verified* cookie, issued after a correct code, marks the current
 *     browser as having passed the second factor.
 *
 * See `docs/TWO_FACTOR_AUTH.md` for the flow, the environment variables and
 * the security notes (in particular: a lost authenticator is recovered with a
 * recovery code, and enrolling again replaces the previous enrollment).
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateSmsCode,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from '@/lib/totp';

export const ENROLLMENT_COOKIE = 'sorowill_2fa_enrollment';
export const VERIFIED_COOKIE = 'sorowill_2fa_verified';
/** Long-lived record that this browser has two-factor set up for a wallet. */
export const ENROLLED_COOKIE = 'sorowill_2fa_enrolled';

export const ENROLLMENT_TTL_MS = 10 * 60_000;
export const VERIFIED_TTL_MS = 30 * 60_000;
export const ENROLLED_TTL_MS = 30 * 24 * 60 * 60_000;
export const SMS_CODE_TTL_MS = 5 * 60_000;
export const RECOVERY_CODE_COUNT = 10;

export type TwoFactorChannel = 'totp' | 'sms';

export interface EnrollmentPayload {
  v: 1;
  owner: string;
  channel: TwoFactorChannel;
  /** Base32 TOTP shared secret (TOTP channel only). */
  secret?: string;
  /** E.164 phone number (SMS channel only). */
  phone?: string;
  /** SHA-256 of the pending SMS code, so the code itself is not stored. */
  smsCodeHash?: string;
  smsExpiresAt?: number;
  /** SHA-256 hashes of the unused recovery codes. */
  recoveryCodeHashes: string[];
  createdAt: number;
  expiresAt: number;
}

export interface VerifiedPayload {
  v: 1;
  owner: string;
  channel: TwoFactorChannel;
  issuedAt: number;
  expiresAt: number;
}

/**
 * The key used to sign both cookies. A deployment must set
 * `TWO_FACTOR_SECRET`; outside production a fixed development key keeps local
 * setup working without configuration, with a warning in the logs.
 */
export function getSigningSecret(): string {
  const configured = process.env.TWO_FACTOR_SECRET || process.env.SESSION_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'TWO_FACTOR_SECRET must be set in production. Generate one with `openssl rand -hex 32`.',
    );
  }

  warnOnce();
  return 'sorowill-development-2fa-secret-do-not-use-in-production';
}

let warned = false;
function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    '[2fa] TWO_FACTOR_SECRET is not set; using the development signing key. Set it before deploying.',
  );
}

/** SHA-256 of a 6-digit SMS code (base32 normalisation would strip digits). */
function hashSmsCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', getSigningSecret()).update(data).digest('base64url');
}

/** Serialises and signs a payload for a cookie. */
export function signToken(payload: EnrollmentPayload | VerifiedPayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verifies a cookie's signature and expiry, returning its payload or `null`.
 * A tampered, malformed or expired token is indistinguishable to the caller.
 */
export function verifyToken<T extends EnrollmentPayload | VerifiedPayload>(
  token: string | null | undefined,
  now: number = Date.now(),
): T | null {
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = sign(body);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    if (!payload || typeof payload !== 'object' || typeof payload.expiresAt !== 'number') return null;
    return payload.expiresAt > now ? payload : null;
  } catch {
    return null;
  }
}

export interface CreatedEnrollment {
  enrollment: EnrollmentPayload;
  /** Signed cookie value to send to the browser. */
  token: string;
  /** One-time codes shown to the user; only the hashes are kept. */
  recoveryCodes: string[];
  /** `otpauth://` URI for authenticator apps (TOTP channel only). */
  otpauthUri?: string;
  /** The SMS code that must be delivered through `src/lib/sms.ts`. */
  smsCode?: string;
}

export interface CreateEnrollmentOptions {
  channel: TwoFactorChannel;
  owner: string;
  phone?: string;
  issuer?: string;
  now?: number;
}

/**
 * Starts an enrollment. The TOTP secret and recovery code hashes live only in
 * the returned signed cookie; the caller shows the recovery codes once and
 * delivers the SMS code when that channel is used.
 */
export function createEnrollment(options: CreateEnrollmentOptions): CreatedEnrollment {
  const now = options.now ?? Date.now();
  const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
  const base: EnrollmentPayload = {
    v: 1,
    owner: options.owner.trim(),
    channel: options.channel,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
    createdAt: now,
    expiresAt: now + ENROLLMENT_TTL_MS,
  };

  if (options.channel === 'sms') {
    if (!options.phone) throw new Error('A phone number is required for SMS two-factor authentication.');
    const smsCode = generateSmsCode();
    const enrollment: EnrollmentPayload = {
      ...base,
      phone: options.phone,
      smsCodeHash: hashSmsCode(smsCode),
      smsExpiresAt: now + SMS_CODE_TTL_MS,
    };
    return { enrollment, token: signToken(enrollment), recoveryCodes, smsCode };
  }

  const secret = generateTotpSecret();
  const enrollment: EnrollmentPayload = { ...base, secret };
  return {
    enrollment,
    token: signToken(enrollment),
    recoveryCodes,
    otpauthUri: buildOtpAuthUri(secret, {
      issuer: options.issuer ?? 'SoroWill',
      accountName: options.owner.trim(),
    }),
  };
}

export interface CodeVerification {
  ok: boolean;
  /** Why verification failed, for a user-facing message. */
  reason?: 'expired' | 'wrong-code';
  /** How many unused recovery codes remain after this attempt. */
  remainingRecoveryCodes: number;
  /** True when the submitted code was a recovery code rather than TOTP/SMS. */
  usedRecoveryCode: boolean;
  /** A new enrollment with the used recovery code removed (when one was used). */
  updatedEnrollment?: EnrollmentPayload;
}

/**
 * Verifies a TOTP/SMS code or a recovery code against an enrollment.
 *
 * Recovery codes are single-use: when one matches, the returned
 * `updatedEnrollment` has it removed so the cookie can be re-signed without it.
 */
export function verifyEnrollmentCode(
  enrollment: EnrollmentPayload,
  rawCode: string,
  now: number = Date.now(),
): CodeVerification {
  const code = rawCode.trim();
  const total = enrollment.recoveryCodeHashes.length;

  if (!code) {
    return { ok: false, reason: 'wrong-code', remainingRecoveryCodes: total, usedRecoveryCode: false };
  }

  if (!enrollment.expiresAt || enrollment.expiresAt <= now) {
    return { ok: false, reason: 'expired', remainingRecoveryCodes: total, usedRecoveryCode: false };
  }

  if (enrollment.channel === 'totp' && enrollment.secret) {
    if (verifyTotp(enrollment.secret, code, { now })) {
      return { ok: true, remainingRecoveryCodes: total, usedRecoveryCode: false };
    }
  }

  if (enrollment.channel === 'sms' && enrollment.smsCodeHash) {
    const expired = !enrollment.smsExpiresAt || enrollment.smsExpiresAt <= now;
    if (!expired && hashSmsCode(code) === enrollment.smsCodeHash) {
      // A correct SMS code is also single-use, but it lives in the enrollment
      // cookie, which the verify route replaces with the verified cookie.
      return { ok: true, remainingRecoveryCodes: total, usedRecoveryCode: false };
    }
  }

  const hash = hashRecoveryCode(normalizeRecoveryCode(code));
  const index = enrollment.recoveryCodeHashes.indexOf(hash);
  if (index !== -1) {
    const recoveryCodeHashes = enrollment.recoveryCodeHashes.filter((_, i) => i !== index);
    return {
      ok: true,
      remainingRecoveryCodes: recoveryCodeHashes.length,
      usedRecoveryCode: true,
      updatedEnrollment: { ...enrollment, recoveryCodeHashes },
    };
  }

  return { ok: false, reason: 'wrong-code', remainingRecoveryCodes: total, usedRecoveryCode: false };
}

/** A signed cookie marking this browser as having passed the second factor. */
export function createVerifiedToken(
  owner: string,
  channel: TwoFactorChannel,
  now: number = Date.now(),
): string {
  return signToken({
    v: 1,
    owner: owner.trim(),
    channel,
    issuedAt: now,
    expiresAt: now + VERIFIED_TTL_MS,
  } satisfies VerifiedPayload);
}

/**
 * A long-lived, signed record of an active enrollment for a wallet. It holds no
 * secret — the TOTP secret never leaves the enrollment cookie and the
 * authenticator app — only what is needed to describe the enrollment later.
 */
export function createEnrolledToken(
  owner: string,
  channel: TwoFactorChannel,
  now: number = Date.now(),
): string {
  return signToken({
    v: 1,
    owner: owner.trim(),
    channel,
    issuedAt: now,
    expiresAt: now + ENROLLED_TTL_MS,
  } satisfies VerifiedPayload);
}

/** Reads a verified cookie, optionally rejecting it for a different wallet. */
export function readVerifiedToken(
  token: string | null | undefined,
  owner?: string,
  now: number = Date.now(),
): VerifiedPayload | null {
  const payload = verifyToken<VerifiedPayload>(token, now);
  if (!payload) return null;
  if (owner !== undefined && payload.owner.trim() !== owner.trim()) return null;
  return payload;
}

const COOKIE_PATH = '/';

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

/** `Set-Cookie` value for an enrollment or verified token. */
export function serializeTwoFactorCookie(name: string, token: string, maxAgeSeconds: number): string {
  return `${name}=${token}; ${cookieAttributes(maxAgeSeconds)}`;
}

/** `Set-Cookie` value that deletes a two-factor cookie. */
export function clearTwoFactorCookie(name: string): string {
  return `${name}=; ${cookieAttributes(0)}`;
}

/** Reads one cookie from a request without pulling in a cookie parser. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** An E.164 phone number: a `+`, a country digit and up to 14 more digits. */
export function isValidE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value.trim());
}

/** Never show a full phone number back to the browser. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '••••';
  return `${phone.startsWith('+') ? '+' : ''}${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}
