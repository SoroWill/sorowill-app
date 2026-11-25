import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { isValidOwnerAddress } from '@/lib/serverValidation';

/**
 * Encryption key management for sensitive data (#903).
 *
 * SoroWill is non-custodial and never holds wallet keys (see `docs/KEY_DERIVATION.md`). This module
 * manages the *application* keys used to encrypt sensitive data at rest (for example the reminder
 * store): generating them, storing them encrypted under a master key, backing them up, and rotating
 * them without losing access to data written under an older key.
 *
 * Storage format: every key is wrapped (AES-256-GCM) with the master key from the environment, so
 * the store only ever holds ciphertext. The master key never leaves the server and is never
 * prefixed with `NEXT_PUBLIC_`.
 */

export const ENCRYPTION_KEY_BYTES = 32;
export const ENCRYPTION_IV_BYTES = 12;
export const ENCRYPTION_TAG_BYTES = 16;
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

/** Environment variable holding the base64 master key that wraps every data key. */
export const MASTER_KEY_ENV = 'SOROWILL_ENCRYPTION_MASTER_KEY';
/** Environment variable holding the KV key under which the keyring is stored. */
export const KEYRING_STORE_ENV = 'SOROWILL_ENCRYPTION_KEYRING_KEY';
export const DEFAULT_KEYRING_STORE_KEY = 'sorowill:encryption-keyring';

const KEY_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export interface EncryptionKeyRecord {
  /** Stable identifier stored next to ciphertext so the right key can be found. */
  id: string;
  /** The data key, base64, wrapped with the master key. */
  wrapped: string;
  createdAt: string;
  /** Set when the key is no longer used for new writes but still decrypts old data. */
  retiredAt?: string;
}

export interface EncryptionKeyring {
  /** The key new data is encrypted with. */
  activeKeyId: string;
  keys: Record<string, EncryptionKeyRecord>;
  /** When the active key was last rotated. */
  rotatedAt?: string;
}

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

/** A fresh 256-bit data key, base64 encoded. */
export function generateEncryptionKey(): string {
  return randomBytes(ENCRYPTION_KEY_BYTES).toString('base64');
}

/** A short, URL-safe identifier for a key. */
export function generateKeyId(): string {
  return randomBytes(9).toString('base64url');
}

/** A key id as it appears in an encrypted payload (base64 of the id). */
export function encodeKeyId(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64');
}

export function decodeKeyId(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function isValidKeyId(id: string): boolean {
  return KEY_ID_REGEX.test(id);
}

/** Reads and validates the master key from the environment. */
export function getMasterKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const raw = env[MASTER_KEY_ENV];
  if (!raw) {
    throw new EncryptionKeyError(`${MASTER_KEY_ENV} is not configured`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== ENCRYPTION_KEY_BYTES) {
    throw new EncryptionKeyError(`${MASTER_KEY_ENV} must be a base64 encoded 32 byte key`);
  }
  return key;
}

/** True when the server is configured to manage encryption keys. */
export function isEncryptionConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getMasterKey(env);
    return true;
  } catch {
    return false;
  }
}

/** Wraps a data key with the master key. Output is `iv.tag.ciphertext`, all base64. */
export function wrapKey(dataKey: string, masterKey: Buffer): string {
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(dataKey, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
}

/** Unwraps a data key wrapped by `wrapKey`. Throws when the master key is wrong or data is tampered. */
export function unwrapKey(wrapped: string, masterKey: Buffer): string {
  const parts = wrapped.split('.');
  if (parts.length !== 3) throw new EncryptionKeyError('Malformed wrapped key');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
  if (iv.length !== ENCRYPTION_IV_BYTES || tag.length !== ENCRYPTION_TAG_BYTES) {
    throw new EncryptionKeyError('Malformed wrapped key');
  }
  try {
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new EncryptionKeyError('Could not unwrap key: wrong master key or corrupted data');
  }
}

/** A keyring with one active key. */
export function createKeyring(masterKey: Buffer, now: Date = new Date()): EncryptionKeyring {
  const id = generateKeyId();
  return {
    activeKeyId: id,
    keys: {
      [id]: { id, wrapped: wrapKey(generateEncryptionKey(), masterKey), createdAt: now.toISOString() },
    },
  };
}

/** The active data key, unwrapped. */
export function getActiveKey(keyring: EncryptionKeyring, masterKey: Buffer): { id: string; key: string } {
  const record = keyring.keys[keyring.activeKeyId];
  if (!record) throw new EncryptionKeyError('Active encryption key is missing from the keyring');
  return { id: record.id, key: unwrapKey(record.wrapped, masterKey) };
}

/** Any key in the keyring by id, unwrapped, so data written before a rotation stays readable. */
export function getKeyById(keyring: EncryptionKeyring, id: string, masterKey: Buffer): string {
  const record = keyring.keys[id];
  if (!record) throw new EncryptionKeyError(`Unknown encryption key: ${id}`);
  return unwrapKey(record.wrapped, masterKey);
}

/**
 * Adds a new active key and retires the previous one. Retired keys are kept so existing ciphertext
 * can still be decrypted; `pruneRetiredKeys` removes them once data has been re-encrypted.
 */
export function rotateKeyring(
  keyring: EncryptionKeyring,
  masterKey: Buffer,
  now: Date = new Date(),
): EncryptionKeyring {
  const previous = keyring.keys[keyring.activeKeyId];
  const id = generateKeyId();
  const keys: Record<string, EncryptionKeyRecord> = { ...keyring.keys };
  if (previous) keys[previous.id] = { ...previous, retiredAt: now.toISOString() };
  keys[id] = { id, wrapped: wrapKey(generateEncryptionKey(), masterKey), createdAt: now.toISOString() };
  return { activeKeyId: id, keys, rotatedAt: now.toISOString() };
}

/** Drops retired keys, keeping the active one. Only call once no data references them. */
export function pruneRetiredKeys(keyring: EncryptionKeyring): EncryptionKeyring {
  const active = keyring.keys[keyring.activeKeyId];
  if (!active) throw new EncryptionKeyError('Active encryption key is missing from the keyring');
  return { ...keyring, keys: { [active.id]: active } };
}

/**
 * A backup of the keyring: the wrapped keys plus a checksum, so a restore can tell a truncated or
 * edited backup from a good one. The backup is still encrypted under the master key, so it is safe
 * to store off-site as long as the master key is kept separately.
 */
export interface KeyringBackup {
  version: 1;
  createdAt: string;
  keyring: EncryptionKeyring;
  checksum: string;
}

function checksumOf(keyring: EncryptionKeyring): string {
  return createHash('sha256').update(JSON.stringify(keyring)).digest('hex');
}

export function createKeyringBackup(keyring: EncryptionKeyring, now: Date = new Date()): KeyringBackup {
  return { version: 1, createdAt: now.toISOString(), keyring, checksum: checksumOf(keyring) };
}

/** Validates a backup and returns its keyring. Throws when the backup is malformed or edited. */
export function restoreKeyringBackup(backup: unknown): EncryptionKeyring {
  const candidate = backup as Partial<KeyringBackup> | null;
  if (!candidate || candidate.version !== 1 || !candidate.keyring) {
    throw new EncryptionKeyError('Unsupported keyring backup');
  }
  const keyring = candidate.keyring;
  if (!isValidKeyId(keyring.activeKeyId) || !keyring.keys?.[keyring.activeKeyId]) {
    throw new EncryptionKeyError('Keyring backup has no active key');
  }
  const expected = Buffer.from(checksumOf(keyring), 'hex');
  const actual = Buffer.from(String(candidate.checksum ?? ''), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new EncryptionKeyError('Keyring backup checksum does not match');
  }
  return keyring;
}

/** Encrypts a value with a data key. Output is `keyId.iv.tag.ciphertext`, all base64. */
export function encryptWithKey(plaintext: string, keyId: string, dataKey: string): string {
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(dataKey, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [encodeKeyId(keyId), iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString('base64'))
    .join('.');
}

/** Decrypts a value produced by `encryptWithKey`, looking the key up in the keyring. */
export function decryptWithKeyring(payload: string, keyring: EncryptionKeyring, masterKey: Buffer): string {
  const parts = payload.split('.');
  if (parts.length !== 4) throw new EncryptionKeyError('Malformed encrypted payload');
  const keyId = decodeKeyId(parts[0]);
  const [iv, tag, ciphertext] = parts.slice(1).map((part) => Buffer.from(part, 'base64'));
  if (iv.length !== ENCRYPTION_IV_BYTES || tag.length !== ENCRYPTION_TAG_BYTES) {
    throw new EncryptionKeyError('Malformed encrypted payload');
  }
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(getKeyById(keyring, keyId, masterKey), 'base64'), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new EncryptionKeyError('Could not decrypt payload: wrong key or corrupted data');
  }
}
