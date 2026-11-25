import { describe, expect, it } from 'vitest';

import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  computeTotp,
  generateRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from '@/lib/totp';

// RFC 6238 Appendix B uses this ASCII secret ("12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 255, 42]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow(/Invalid base32/);
  });
});

describe('TOTP (RFC 6238)', () => {
  const vectors: [number, string][] = [
    [59_000, '94287082'],
    [1_111_111_109_000, '07081804'],
    [1_111_111_111_000, '14050471'],
    [1_234_567_890_000, '89005924'],
    [2_000_000_000_000, '69279037'],
  ];

  it.each(vectors)('matches the RFC vector at %i ms', (now, expected) => {
    expect(computeTotp(RFC_SECRET, { now, digits: 8, algorithm: 'sha1' })).toBe(expected);
  });

  it('verifies the current code', () => {
    const now = 1_234_567_890_000;
    const code = computeTotp(RFC_SECRET, { now, digits: 8 });
    expect(verifyTotp(RFC_SECRET, code, { now, digits: 8 })).toBe(true);
  });

  it('accepts one step of clock skew but not two', () => {
    const now = 1_234_567_890_000;
    const previous = computeTotp(RFC_SECRET, { now: now - 30_000, digits: 8 });
    const twoBack = computeTotp(RFC_SECRET, { now: now - 60_000, digits: 8 });

    expect(verifyTotp(RFC_SECRET, previous, { now, digits: 8 })).toBe(true);
    expect(verifyTotp(RFC_SECRET, twoBack, { now, digits: 8 })).toBe(false);
  });

  it('ignores spaces and dashes in the submitted code', () => {
    const now = 1_234_567_890_000;
    const code = computeTotp(RFC_SECRET, { now });
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    expect(verifyTotp(RFC_SECRET, spaced, { now })).toBe(true);
  });

  it('rejects malformed codes without throwing', () => {
    expect(verifyTotp(RFC_SECRET, '')).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBe(false);
    expect(verifyTotp('not base32!', '123456')).toBe(false);
  });
});

describe('secret and otpauth URI', () => {
  it('generates a 32-character base32 secret by default', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('builds an otpauth URI with the issuer and account', () => {
    const uri = buildOtpAuthUri('JBSWY3DPEHPK3PXP', {
      issuer: 'SoroWill',
      accountName: 'GABC',
    });
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=SoroWill');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});

describe('recovery codes', () => {
  it('generates formatted, unique codes', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/);

    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('normalises formatting before hashing, so a pasted code still matches', () => {
    expect(normalizeRecoveryCode(' k3m7-9qxa ')).toBe('K3M79QXA');
    expect(hashRecoveryCode('k3m7-9qxa')).toBe(hashRecoveryCode('K3M7 9QXA'));
  });
});
