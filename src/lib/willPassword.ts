/**
 * Password protection for a will's on-page details (issue #874).
 *
 * A will's on-chain record is public: anyone can read its owner, balance and
 * beneficiary addresses from Stellar. What this module protects is the local
 * copy shown in the app, so a will opened on a shared or unattended device does
 * not expose its details to whoever picks the device up.
 *
 * The payload is encrypted in the browser with a key derived from the user's
 * password (PBKDF2-SHA256, 210 000 iterations — the OWASP 2023 recommendation)
 * and AES-256-GCM, whose authentication tag detects a wrong password *and* a
 * tampered payload. Nothing derived from the password is ever stored: only the
 * salt, IV and ciphertext are kept, so a stolen localStorage dump cannot be
 * decrypted without guessing the password.
 *
 * See `docs/PASSWORD_PROTECTED_WILLS.md` for the threat model and what this
 * feature deliberately does not protect.
 */

export const WILL_PASSWORD_MIN_LENGTH = 10;
export const WILL_PASSWORD_MAX_LENGTH = 1024;
export const PBKDF2_ITERATIONS = 210_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_PREFIX = 'sorowill-will-lock:';

/** Window event fired when a will's lock is created, unlocked or removed. */
export const WILL_LOCK_CHANGED_EVENT = 'sorowill-will-lock-changed';

/** Tells the page's gate that the lock changed, so it re-reads it. */
export function notifyWillLockChanged(willId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WILL_LOCK_CHANGED_EVENT, { detail: willId }));
}

export interface ProtectedWillPayload {
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** Base64 of the PBKDF2 salt. */
  salt: string;
  /** Base64 of the AES-GCM initialisation vector. */
  iv: string;
  /** Base64 of the ciphertext, with the GCM tag appended. */
  ciphertext: string;
}

export interface StoredWillLock {
  /** The encrypted marker that proves the right password was entered. */
  payload: ProtectedWillPayload;
  /** Optional reminder shown on the unlock screen. Never contains the password. */
  hint?: string;
  /** ISO timestamp of when the lock was created. */
  createdAt: string;
}

/** Explains why a password is unacceptable, or `null` when it is fine. */
export function getPasswordProblem(password: string): string | null {
  if (password.length < WILL_PASSWORD_MIN_LENGTH) {
    return `Use at least ${WILL_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > WILL_PASSWORD_MAX_LENGTH) {
    return 'That password is too long.';
  }
  if (password.trim().length === 0) {
    return 'The password cannot be only spaces.';
  }
  return null;
}

function getCrypto(): Crypto {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) {
    throw new Error('Password protection needs a browser with Web Crypto support.');
  }
  return webcrypto;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytes(value: Uint8Array): BufferSource {
  return value as unknown as BufferSource;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await getCrypto().subtle.importKey(
    'raw',
    bytes(new TextEncoder().encode(password)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return getCrypto().subtle.deriveKey(
    { name: 'PBKDF2', salt: bytes(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts `plaintext` under `password`, returning a self-describing payload. */
export async function encryptWithPassword(
  plaintext: string,
  password: string,
  options: { iterations?: number } = {},
): Promise<ProtectedWillPayload> {
  const problem = getPasswordProblem(password);
  if (problem) throw new Error(problem);

  const iterations = options.iterations ?? PBKDF2_ITERATIONS;
  const salt = getCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = getCrypto().getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, iterations);
  const ciphertext = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: bytes(iv) },
    key,
    bytes(new TextEncoder().encode(plaintext)),
  );

  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypts a payload. A wrong password and a modified payload are
 * indistinguishable, by design: GCM authentication fails for both.
 */
export async function decryptWithPassword(
  payload: ProtectedWillPayload,
  password: string,
): Promise<string> {
  if (!isProtectedWillPayload(payload)) {
    throw new Error('This password-protected payload is not valid.');
  }

  try {
    const salt = fromBase64(payload.salt);
    const iv = fromBase64(payload.iv);
    const key = await deriveKey(password, salt, payload.iterations);
    const plaintext = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(iv) },
      key,
      bytes(fromBase64(payload.ciphertext)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Incorrect password.');
  }
}

/** Type guard for values read back from storage or a URL. */
export function isProtectedWillPayload(value: unknown): value is ProtectedWillPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProtectedWillPayload>;
  return (
    candidate.v === 1 &&
    candidate.alg === 'AES-256-GCM' &&
    candidate.kdf === 'PBKDF2-SHA256' &&
    typeof candidate.iterations === 'number' &&
    candidate.iterations >= 10_000 &&
    typeof candidate.salt === 'string' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ciphertext === 'string'
  );
}

/** The plaintext the lock stores, so unlocking can verify the password. */
export function willLockVerifier(willId: string): string {
  return `${VERIFIER_PREFIX}${willId.trim()}`;
}

/** localStorage key holding a will's lock on this device. */
export function willLockStorageKey(willId: string): string {
  return `sorowill-will-lock-${willId}`;
}

/** sessionStorage key remembering that this tab already unlocked a will. */
export function willUnlockedStorageKey(willId: string): string {
  return `sorowill-will-unlocked-${willId}`;
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads the lock stored for a will, or `null` when it is not protected here. */
export function readWillLock(willId: string): StoredWillLock | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(willLockStorageKey(willId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWillLock>;
    if (!isProtectedWillPayload(parsed.payload)) return null;
    return {
      payload: parsed.payload,
      hint: typeof parsed.hint === 'string' ? parsed.hint : undefined,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Encrypts the will's verifier under `password` and stores the lock locally. */
export async function createWillLock(
  willId: string,
  password: string,
  hint?: string,
): Promise<StoredWillLock> {
  const payload = await encryptWithPassword(willLockVerifier(willId), password);
  const lock: StoredWillLock = {
    payload,
    hint: hint?.trim() ? hint.trim() : undefined,
    createdAt: new Date().toISOString(),
  };
  const store = storage();
  if (!store) throw new Error('Password protection is only available in the browser.');
  store.setItem(willLockStorageKey(willId), JSON.stringify(lock));
  markWillUnlocked(willId);
  notifyWillLockChanged(willId);
  return lock;
}

/** Removes a will's local lock. The caller must have verified the password first. */
export function clearWillLock(willId: string): void {
  storage()?.removeItem(willLockStorageKey(willId));
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(willUnlockedStorageKey(willId));
  } catch {
    // Session storage can be unavailable in private modes; nothing to clear.
  }
  notifyWillLockChanged(willId);
}

function lockFingerprint(lock: StoredWillLock): string {
  return `${lock.payload.salt}.${lock.payload.iv}`;
}

/** Remembers, for this tab only, that the will's password was entered. */
export function markWillUnlocked(willId: string): void {
  const lock = readWillLock(willId);
  if (!lock || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(willUnlockedStorageKey(willId), lockFingerprint(lock));
  } catch {
    // Unlocking still worked; it just will not be remembered.
  }
}

/**
 * True when this tab has already unlocked the will *and* the stored lock has
 * not changed since (a new lock re-prompts).
 */
export function isWillUnlocked(willId: string): boolean {
  const lock = readWillLock(willId);
  if (!lock || typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(willUnlockedStorageKey(willId)) === lockFingerprint(lock);
  } catch {
    return false;
  }
}
