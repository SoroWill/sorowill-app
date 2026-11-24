import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for sensitive data at rest (#911).
 *
 * Values are sealed with AES-256-GCM under a data encryption key (DEK) that is
 * itself sealed under the master key from `SOROWILL_ENCRYPTION_KEY`. The master
 * key never leaves the server: it is read from the environment (never
 * `NEXT_PUBLIC_*`) and is never written to storage. Rotating the master key only
 * requires re-wrapping the DEK, not re-encrypting every record.
 *
 * Sealed values are self-describing strings:
 *   `sorowill:v1:<wrappedDek>:<iv>:<authTag>:<ciphertext>` (all base64url)
 * so a stored blob can be decrypted without any out-of-band metadata.
 */

const PREFIX = 'sorowill:v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MASTER_KEY_ENV = 'SOROWILL_ENCRYPTION_KEY';

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

function decodeMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed)
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionError(
      `${MASTER_KEY_ENV} must be a 32-byte key encoded as 64 hex characters or base64.`,
    );
  }
  return key;
}

/** The configured master key, or null when encryption is not configured. */
export function getMasterKey(): Buffer | null {
  const raw = process.env[MASTER_KEY_ENV];
  if (!raw) return null;
  return decodeMasterKey(raw);
}

/** True when a master key is configured, i.e. sensitive data can be sealed. */
export function isEncryptionConfigured(): boolean {
  return Boolean(process.env[MASTER_KEY_ENV]);
}

function requireMasterKey(): Buffer {
  const key = getMasterKey();
  if (!key) {
    throw new EncryptionError(
      `${MASTER_KEY_ENV} is not set. Sensitive data cannot be encrypted at rest. ` +
        'Generate one with `openssl rand -hex 32` and keep it server-side only.',
    );
  }
  return key;
}

function seal(key: Buffer, plaintext: Buffer): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Seals a UTF-8 string with the master key. */
export function encryptString(plaintext: string): string {
  const masterKey = requireMasterKey();
  const dek = randomBytes(KEY_BYTES);
  const wrapped = seal(masterKey, dek);
  const payload = seal(dek, Buffer.from(plaintext, 'utf8'));
  return [
    PREFIX,
    wrapped.ciphertext.toString('base64url'),
    wrapped.iv.toString('base64url'),
    wrapped.tag.toString('base64url'),
    payload.iv.toString('base64url'),
    payload.tag.toString('base64url'),
    payload.ciphertext.toString('base64url'),
  ].join(':');
}

/** True when `value` looks like output of {@link encryptString}. */
export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

/** Opens a value produced by {@link encryptString}. Throws on tampering. */
export function decryptString(sealed: string): string {
  if (!isEncrypted(sealed)) {
    throw new EncryptionError('Value is not an encrypted payload.');
  }
  const parts = sealed.split(':');
  if (parts.length !== 7) {
    throw new EncryptionError('Encrypted payload is malformed.');
  }
  const [, , wrappedCiphertext, wrappedIv, wrappedTag, iv, tag, ciphertext] = parts;
  const masterKey = requireMasterKey();
  let dek: Buffer;
  try {
    dek = open(
      masterKey,
      Buffer.from(wrappedIv, 'base64url'),
      Buffer.from(wrappedTag, 'base64url'),
      Buffer.from(wrappedCiphertext, 'base64url'),
    );
  } catch {
    throw new EncryptionError('Unable to unwrap the data key: wrong master key or tampered data.');
  }
  try {
    return open(
      dek,
      Buffer.from(iv, 'base64url'),
      Buffer.from(tag, 'base64url'),
      Buffer.from(ciphertext, 'base64url'),
    ).toString('utf8');
  } catch {
    throw new EncryptionError('Unable to decrypt payload: tampered or truncated data.');
  }
}

/** Seals a JSON-serialisable value. */
export function encryptJson<T>(value: T): string {
  return encryptString(JSON.stringify(value));
}

/** Opens a value produced by {@link encryptJson}. */
export function decryptJson<T>(sealed: string): T {
  return JSON.parse(decryptString(sealed)) as T;
}

/**
 * Seals `value` when encryption is configured, otherwise returns it unchanged.
 * Used by stores that must keep working before a key is provisioned.
 */
export function encryptIfConfigured(value: string): string {
  return isEncryptionConfigured() ? encryptString(value) : value;
}

/** Opens `value` if it is sealed, otherwise returns it unchanged (legacy plaintext). */
export function decryptIfEncrypted(value: string): string {
  return isEncrypted(value) ? decryptString(value) : value;
}

/** Seals every string field of a record, leaving non-string fields untouched. */
export function encryptFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly (keyof T)[],
): T {
  const copy: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = copy[field as string];
    if (typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
      copy[field as string] = encryptIfConfigured(value);
    }
  }
  return copy as T;
}

/** Opens every sealed string field of a record, leaving plaintext fields untouched. */
export function decryptFields<T extends Record<string, unknown>>(
  record: T,
  fields: readonly (keyof T)[],
): T {
  const copy: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = copy[field as string];
    if (isEncrypted(value)) {
      copy[field as string] = decryptString(value);
    }
  }
  return copy as T;
}
