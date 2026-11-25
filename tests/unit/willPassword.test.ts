import { beforeEach, describe, expect, it } from 'vitest';

import {
  PBKDF2_ITERATIONS,
  clearWillLock,
  createWillLock,
  decryptWithPassword,
  encryptWithPassword,
  getPasswordProblem,
  isProtectedWillPayload,
  isWillUnlocked,
  markWillUnlocked,
  readWillLock,
  willLockStorageKey,
  willLockVerifier,
  willUnlockedStorageKey,
} from '@/lib/willPassword';

const WILL_ID = '42';
const PASSWORD = 'correct horse battery staple';

// Keep the KDF cheap in tests while still exercising the real code path.
const FAST = { iterations: 10_000 };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('will password policy (#874)', () => {
  it('requires a minimum length', () => {
    expect(getPasswordProblem('short')).toMatch(/at least 10 characters/);
    expect(getPasswordProblem('a'.repeat(10))).toBeNull();
  });

  it('rejects whitespace-only and over-long passwords', () => {
    expect(getPasswordProblem('          ')).toMatch(/only spaces/);
    expect(getPasswordProblem('a'.repeat(2000))).toMatch(/too long/);
  });
});

describe('encryptWithPassword / decryptWithPassword (#874)', () => {
  it('round-trips the plaintext', async () => {
    const payload = await encryptWithPassword('sensitive details', PASSWORD, FAST);
    await expect(decryptWithPassword(payload, PASSWORD)).resolves.toBe('sensitive details');
  });

  it('stores only a self-describing payload, never the plaintext or password', async () => {
    const payload = await encryptWithPassword('sensitive details', PASSWORD, FAST);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('sensitive details');
    expect(serialized).not.toContain(PASSWORD);
    expect(payload).toMatchObject({ v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256' });
    expect(payload.iterations).toBe(10_000);
    expect(isProtectedWillPayload(payload)).toBe(true);
  });

  it('uses the documented default iteration count', async () => {
    const payload = await encryptWithPassword('x', PASSWORD);
    expect(payload.iterations).toBe(PBKDF2_ITERATIONS);
  });

  it('uses a fresh salt and IV for every encryption', async () => {
    const first = await encryptWithPassword('same text', PASSWORD, FAST);
    const second = await encryptWithPassword('same text', PASSWORD, FAST);
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('rejects a wrong password', async () => {
    const payload = await encryptWithPassword('secret', PASSWORD, FAST);
    await expect(decryptWithPassword(payload, 'wrong password here')).rejects.toThrow(
      /Incorrect password/,
    );
  });

  it('rejects a tampered ciphertext', async () => {
    const payload = await encryptWithPassword('secret', PASSWORD, FAST);
    const bytes = atob(payload.ciphertext).split('');
    bytes[0] = bytes[0] === 'A' ? 'B' : 'A';
    const tampered = { ...payload, ciphertext: btoa(bytes.join('')) };

    await expect(decryptWithPassword(tampered, PASSWORD)).rejects.toThrow(/Incorrect password/);
  });

  it('rejects values that are not encrypted payloads', async () => {
    expect(isProtectedWillPayload(null)).toBe(false);
    expect(isProtectedWillPayload({ v: 2, alg: 'AES-256-GCM' })).toBe(false);
    await expect(
      decryptWithPassword({ nope: true } as never, PASSWORD),
    ).rejects.toThrow(/not valid/);
  });

  it('refuses to encrypt with a password that fails the policy', async () => {
    await expect(encryptWithPassword('x', 'short', FAST)).rejects.toThrow(/at least 10/);
  });
});

describe('local will lock storage (#874)', () => {
  it('has no lock until one is created', () => {
    expect(readWillLock(WILL_ID)).toBeNull();
    expect(isWillUnlocked(WILL_ID)).toBe(false);
  });

  it('creates a lock, remembers the tab unlock, and can be cleared', async () => {
    const lock = await createWillLock(WILL_ID, PASSWORD, '  my hint  ');

    expect(lock.hint).toBe('my hint');
    expect(localStorage.getItem(willLockStorageKey(WILL_ID))).not.toBeNull();
    expect(readWillLock(WILL_ID)?.payload).toEqual(lock.payload);
    expect(isWillUnlocked(WILL_ID)).toBe(true);

    clearWillLock(WILL_ID);

    expect(readWillLock(WILL_ID)).toBeNull();
    expect(isWillUnlocked(WILL_ID)).toBe(false);
  });

  it('stores a payload that decrypts back to the will verifier', async () => {
    const lock = await createWillLock(WILL_ID, PASSWORD);
    await expect(decryptWithPassword(lock.payload, PASSWORD)).resolves.toBe(
      willLockVerifier(WILL_ID),
    );
  });

  it('re-prompts when the remembered unlock does not match the stored lock', async () => {
    await createWillLock(WILL_ID, PASSWORD);
    expect(isWillUnlocked(WILL_ID)).toBe(true);

    // A different lock (new salt/IV) must invalidate the tab's old unlock.
    sessionStorage.setItem(willUnlockedStorageKey(WILL_ID), 'stale-fingerprint');
    expect(isWillUnlocked(WILL_ID)).toBe(false);

    markWillUnlocked(WILL_ID);
    expect(isWillUnlocked(WILL_ID)).toBe(true);
  });

  it('ignores corrupt storage instead of throwing', () => {
    localStorage.setItem(willLockStorageKey(WILL_ID), '{not json');
    expect(readWillLock(WILL_ID)).toBeNull();
  });
});
