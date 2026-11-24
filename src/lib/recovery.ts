import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Emergency access recovery (#893).
 *
 * A wallet owner who loses access to their signing device can still prove they
 * own the will by presenting a recovery code that was issued to them while they
 * still had access, and by confirming a backup email address. Both factors are
 * required: the code proves possession of the printed/exported secret, the
 * backup email proves control of an inbox the owner registered earlier.
 *
 * Only hashes of the recovery code and of the email tokens are stored, so a
 * leak of the store does not hand out working codes.
 */

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
export const RECOVERY_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_MAX_ATTEMPTS = 5;

/** Crockford base32 without I, L, O and U so codes are unambiguous when typed. */
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_GROUPS = 4;
const CODE_GROUP_LENGTH = 4;
const CODE_REGEX = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

export interface RecoveryCodeRecord {
  /** SHA-256 of the normalised code. The code itself is never stored. */
  hash: string;
  createdAt: string;
  usedAt?: string | null;
}

export interface RecoveryRecord {
  owner: string;
  backupEmail: string;
  backupEmailVerified: boolean;
  /** SHA-256 of the pending verification token, if a verification is in flight. */
  emailTokenHash?: string | null;
  emailTokenExpiresAt?: string | null;
  codes: RecoveryCodeRecord[];
  failedAttempts: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryStore {
  records: Record<string, RecoveryRecord>;
}

export type RecoveryResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Normalises a user-typed code: upper case, no separators or spaces. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** True when `code` looks like a recovery code (XXXX-XXXX-XXXX-XXXX). */
export function isValidRecoveryCodeFormat(code: string): boolean {
  return CODE_REGEX.test(code.trim().toUpperCase());
}

function randomCode(): string {
  const bytes = randomBytes(CODE_GROUPS * CODE_GROUP_LENGTH);
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    chars.push(CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]);
  }
  const groups: string[] = [];
  for (let i = 0; i < CODE_GROUPS; i += 1) {
    groups.push(chars.slice(i * CODE_GROUP_LENGTH, (i + 1) * CODE_GROUP_LENGTH).join(''));
  }
  return groups.join('-');
}

/**
 * Issues a fresh set of recovery codes for `owner`, replacing any previous
 * ones. Returns the plaintext codes exactly once; only their hashes are kept.
 */
export function issueRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    codes.push(randomCode());
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  return hash(normalizeRecoveryCode(code));
}

export function hashRecoveryEmailToken(token: string): string {
  return hash(token);
}

export function createRecoveryEmailToken(): string {
  return randomBytes(32).toString('hex');
}

/** Builds the record for a newly registered owner with a fresh code set. */
export function createRecoveryRecord({
  owner,
  backupEmail,
  codes,
  now = new Date(),
}: {
  owner: string;
  backupEmail: string;
  codes: string[];
  now?: Date;
}): RecoveryRecord {
  const timestamp = now.toISOString();
  return {
    owner,
    backupEmail: backupEmail.trim().toLowerCase(),
    backupEmailVerified: false,
    emailTokenHash: null,
    emailTokenExpiresAt: null,
    codes: codes.map((code) => ({ hash: hashRecoveryCode(code), createdAt: timestamp, usedAt: null })),
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** Starts (or restarts) backup email verification and returns the plaintext token. */
export function startBackupEmailVerification(
  record: RecoveryRecord,
  now: Date = new Date(),
): { record: RecoveryRecord; token: string } {
  const token = createRecoveryEmailToken();
  return {
    token,
    record: {
      ...record,
      backupEmailVerified: false,
      emailTokenHash: hashRecoveryEmailToken(token),
      emailTokenExpiresAt: new Date(now.getTime() + RECOVERY_EMAIL_TOKEN_TTL_MS).toISOString(),
      updatedAt: now.toISOString(),
    },
  };
}

/** Marks the backup email verified when `token` matches and has not expired. */
export function confirmBackupEmail(
  record: RecoveryRecord,
  token: string,
  now: Date = new Date(),
): RecoveryResult<RecoveryRecord> {
  if (!record.emailTokenHash || !record.emailTokenExpiresAt) {
    return { ok: false, error: 'No verification is pending for this account.', status: 400 };
  }
  if (new Date(record.emailTokenExpiresAt).getTime() < now.getTime()) {
    return { ok: false, error: 'The verification link has expired.', status: 400 };
  }
  if (!safeEqualHex(record.emailTokenHash, hashRecoveryEmailToken(token))) {
    return { ok: false, error: 'The verification link is invalid.', status: 400 };
  }
  return {
    ok: true,
    value: {
      ...record,
      backupEmailVerified: true,
      emailTokenHash: null,
      emailTokenExpiresAt: null,
      updatedAt: now.toISOString(),
    },
  };
}

/**
 * Redeems a recovery code. Requires a verified backup email, refuses while the
 * record is locked after too many failures, and burns the code on success.
 */
export function redeemRecoveryCode(
  record: RecoveryRecord,
  code: string,
  now: Date = new Date(),
): RecoveryResult<RecoveryRecord> {
  if (record.lockedUntil && new Date(record.lockedUntil).getTime() > now.getTime()) {
    return { ok: false, error: 'Too many failed attempts. Try again later.', status: 429 };
  }
  if (!record.backupEmailVerified) {
    return { ok: false, error: 'Verify the backup email before using a recovery code.', status: 403 };
  }

  const candidate = hashRecoveryCode(code);
  const index = record.codes.findIndex((entry) => !entry.usedAt && safeEqualHex(entry.hash, candidate));

  if (index === -1) {
    return {
      ok: false,
      error: 'The recovery code is invalid or has already been used.',
      status: 400,
    };
  }

  const codes = record.codes.map((entry, i) =>
    i === index ? { ...entry, usedAt: now.toISOString() } : entry,
  );
  return {
    ok: true,
    value: { ...record, codes, failedAttempts: 0, lockedUntil: null, updatedAt: now.toISOString() },
  };
}

/** Records a failed redemption, locking the record after `RECOVERY_MAX_ATTEMPTS`. */
export function recordRecoveryFailure(record: RecoveryRecord, now: Date = new Date()): RecoveryRecord {
  const failedAttempts = record.failedAttempts + 1;
  const locked = failedAttempts >= RECOVERY_MAX_ATTEMPTS;
  return {
    ...record,
    failedAttempts: locked ? 0 : failedAttempts,
    lockedUntil: locked ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : record.lockedUntil ?? null,
    updatedAt: now.toISOString(),
  };
}

/** Number of unused, unexpired recovery codes left for `record`. */
export function remainingRecoveryCodes(record: RecoveryRecord, now: Date = new Date()): number {
  const expiry = new Date(record.createdAt).getTime() + RECOVERY_CODE_TTL_MS;
  if (expiry < now.getTime()) return 0;
  return record.codes.filter((entry) => !entry.usedAt).length;
}
