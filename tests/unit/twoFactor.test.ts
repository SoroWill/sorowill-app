import { beforeAll, describe, expect, it } from 'vitest';

import { computeTotp } from '@/lib/totp';
import {
  ENROLLED_TTL_MS,
  createEnrolledToken,
  createEnrollment,
  createVerifiedToken,
  isValidE164Phone,
  maskPhone,
  readVerifiedToken,
  signToken,
  verifyEnrollmentCode,
  verifyToken,
  type EnrollmentPayload,
} from '@/lib/twoFactor';

const OWNER = `G${'A'.repeat(55)}`;
const NOW = 1_700_000_000_000;

beforeAll(() => {
  process.env.TWO_FACTOR_SECRET = 'test-secret-for-two-factor-signing';
});

describe('signed two-factor tokens', () => {
  it('round-trips a payload it signed', () => {
    const token = createVerifiedToken(OWNER, 'totp', NOW);
    const payload = verifyToken(token, NOW + 1000);

    expect(payload).toMatchObject({ owner: OWNER, channel: 'totp' });
  });

  it('rejects a tampered payload', () => {
    const token = createVerifiedToken(OWNER, 'totp', NOW);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: 1, owner: OWNER, channel: 'totp', issuedAt: NOW, expiresAt: NOW + 1e9 }),
    ).toString('base64url');

    expect(verifyToken(`${forged}.${signature}`, NOW)).toBeNull();
    expect(verifyToken(`${body}.deadbeef`, NOW)).toBeNull();
  });

  it('rejects expired and malformed tokens', () => {
    const token = createVerifiedToken(OWNER, 'totp', NOW);
    expect(verifyToken(token, NOW + 31 * 60_000)).toBeNull();
    expect(verifyToken('', NOW)).toBeNull();
    expect(verifyToken('garbage', NOW)).toBeNull();
    expect(verifyToken('a.b', NOW)).toBeNull();
  });

  it('rejects a verified token for a different wallet', () => {
    const token = createVerifiedToken(OWNER, 'totp', NOW);
    expect(readVerifiedToken(token, OWNER, NOW)).not.toBeNull();
    expect(readVerifiedToken(token, `G${'B'.repeat(55)}`, NOW)).toBeNull();
  });

  it('keeps the enrolled record for 30 days', () => {
    const token = createEnrolledToken(OWNER, 'sms', NOW);
    expect(verifyToken(token, NOW + ENROLLED_TTL_MS - 1)).not.toBeNull();
    expect(verifyToken(token, NOW + ENROLLED_TTL_MS + 1)).toBeNull();
  });
});

describe('enrollment and code verification', () => {
  it('creates a TOTP enrollment with an otpauth URI and recovery codes', () => {
    const created = createEnrollment({ owner: OWNER, channel: 'totp', now: NOW });

    expect(created.recoveryCodes).toHaveLength(10);
    expect(created.otpauthUri).toContain('secret=');
    expect(created.enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    expect(created.enrollment.recoveryCodeHashes).toHaveLength(10);
    // The plaintext codes must not be stored.
    expect(JSON.stringify(created.enrollment)).not.toContain(created.recoveryCodes[0]);
  });

  it('accepts the current TOTP code and rejects a wrong one', () => {
    const created = createEnrollment({ owner: OWNER, channel: 'totp', now: NOW });
    const secret = created.enrollment.secret as string;
    const code = computeTotp(secret, { now: NOW });

    expect(verifyEnrollmentCode(created.enrollment, code, NOW)).toMatchObject({
      ok: true,
      usedRecoveryCode: false,
    });
    expect(verifyEnrollmentCode(created.enrollment, '000000', NOW)).toMatchObject({
      ok: false,
      reason: 'wrong-code',
    });
  });

  it('accepts a recovery code once and removes it from the updated enrollment', () => {
    const created = createEnrollment({ owner: OWNER, channel: 'totp', now: NOW });
    const recoveryCode = created.recoveryCodes[3];

    const first = verifyEnrollmentCode(created.enrollment, recoveryCode, NOW);
    expect(first).toMatchObject({ ok: true, usedRecoveryCode: true, remainingRecoveryCodes: 9 });
    const updated = first.updatedEnrollment as EnrollmentPayload;
    expect(updated.recoveryCodeHashes).toHaveLength(9);

    const second = verifyEnrollmentCode(updated, recoveryCode, NOW);
    expect(second.ok).toBe(false);
  });

  it('rejects codes after the enrollment expires', () => {
    const created = createEnrollment({ owner: OWNER, channel: 'totp', now: NOW });
    const secret = created.enrollment.secret as string;
    const code = computeTotp(secret, { now: NOW });

    expect(verifyEnrollmentCode(created.enrollment, code, NOW + 11 * 60_000)).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('creates an SMS enrollment whose code is not stored in plaintext', () => {
    const created = createEnrollment({
      owner: OWNER,
      channel: 'sms',
      phone: '+15551234567',
      now: NOW,
    });

    expect(created.smsCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(created.enrollment)).not.toContain(created.smsCode as string);
    expect(verifyEnrollmentCode(created.enrollment, created.smsCode as string, NOW).ok).toBe(true);
  });

  it('rejects an expired SMS code', () => {
    const created = createEnrollment({
      owner: OWNER,
      channel: 'sms',
      phone: '+15551234567',
      now: NOW,
    });
    expect(
      verifyEnrollmentCode(created.enrollment, created.smsCode as string, NOW + 6 * 60_000).ok,
    ).toBe(false);
  });

  it('requires a phone number for the SMS channel', () => {
    expect(() => createEnrollment({ owner: OWNER, channel: 'sms' })).toThrow(/phone number/);
  });

  it('signs a payload that cannot be verified with a different secret', () => {
    const token = signToken({
      v: 1,
      owner: OWNER,
      channel: 'totp',
      issuedAt: NOW,
      expiresAt: NOW + 60_000,
    });
    process.env.TWO_FACTOR_SECRET = 'a-different-secret';
    expect(verifyToken(token, NOW)).toBeNull();
    process.env.TWO_FACTOR_SECRET = 'test-secret-for-two-factor-signing';
  });
});

describe('phone helpers', () => {
  it('validates E.164 numbers', () => {
    expect(isValidE164Phone('+15551234567')).toBe(true);
    expect(isValidE164Phone('5551234567')).toBe(false);
    expect(isValidE164Phone('+0123')).toBe(false);
    expect(isValidE164Phone('+1 555 123 4567')).toBe(false);
  });

  it('masks all but the last four digits', () => {
    expect(maskPhone('+15551234567')).toBe('+•••••••4567');
    expect(maskPhone('1234')).toBe('••••');
  });
});
