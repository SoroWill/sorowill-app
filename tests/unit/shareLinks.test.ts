import { describe, it, expect, beforeEach } from 'vitest';
import {
  createShareToken,
  getShareAccess,
  openShareToken,
  recordShareAccess,
  resetShareAccessLog,
  shareExpiryFromHours,
} from '../../src/lib/shareLinks';

const SECRET = 'test-secret';
const NOW = Date.UTC(2026, 0, 1);
const HOUR = 60 * 60 * 1000;

describe('time-limited share links (#875)', () => {
  beforeEach(() => resetShareAccessLog());

  it('opens a valid link before it expires', () => {
    const { token, linkId } = createShareToken('42', NOW + HOUR, SECRET);
    const opened = openShareToken(token, '42', NOW, SECRET);
    expect(opened).toEqual({ ok: true, willId: '42', expiresAt: NOW + HOUR, linkId });
  });

  it('refuses the link once it has expired', () => {
    const { token } = createShareToken('42', NOW + HOUR, SECRET);
    expect(openShareToken(token, '42', NOW + HOUR, SECRET)).toEqual({
      ok: false,
      reason: 'expired',
      expiresAt: NOW + HOUR,
    });
  });

  it('is encrypted: the will id and expiry are not readable from the token', () => {
    const { token } = createShareToken('424242', NOW + HOUR, SECRET);
    const decoded = Buffer.from(token, 'base64url').toString('latin1');
    expect(decoded).not.toContain('424242');
    expect(token).not.toContain('424242');
  });

  it('refuses a tampered token, a different secret, and another will', () => {
    const { token } = createShareToken('42', NOW + HOUR, SECRET);
    const bytes = Buffer.from(token, 'base64url');
    bytes[bytes.length - 20] ^= 0xff;
    expect(openShareToken(bytes.toString('base64url'), '42', NOW, SECRET)).toEqual({ ok: false, reason: 'invalid' });
    expect(openShareToken(token, '42', NOW, 'other-secret')).toEqual({ ok: false, reason: 'invalid' });
    expect(openShareToken(token, '43', NOW, SECRET)).toEqual({ ok: false, reason: 'wrong-will' });
    expect(openShareToken('garbage', '42', NOW, SECRET)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('accepts only whole-hour lifetimes from 1 hour to 30 days', () => {
    expect(shareExpiryFromHours(24, NOW)).toBe(NOW + 24 * HOUR);
    expect(shareExpiryFromHours(720, NOW)).toBe(NOW + 720 * HOUR);
    for (const bad of [0, 721, 1.5, '24', null]) {
      expect(shareExpiryFromHours(bad, NOW)).toBeNull();
    }
  });

  it('tracks how often each link was opened', () => {
    const a = createShareToken('1', NOW + HOUR, SECRET).linkId;
    const b = createShareToken('1', NOW + HOUR, SECRET).linkId;
    recordShareAccess(a, NOW);
    recordShareAccess(a, NOW + 1000);
    expect(getShareAccess(a)).toEqual({ count: 2, lastAccessAt: NOW + 1000 });
    expect(getShareAccess(b)).toEqual({ count: 0, lastAccessAt: null });
  });
});
