import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { POST as setup } from '@/app/api/auth/2fa/setup/route';
import { POST as verify } from '@/app/api/auth/2fa/verify/route';
import { POST as disable } from '@/app/api/auth/2fa/disable/route';
import { GET as status } from '@/app/api/auth/2fa/status/route';
import { computeTotp } from '@/lib/totp';
import { resetRateLimits } from '@/lib/rate-limit';

const OWNER = `G${'A'.repeat(55)}`;
const CSRF_TOKEN = 'b'.repeat(64);
const IP = '203.0.113.9';

beforeAll(() => {
  process.env.TWO_FACTOR_SECRET = 'route-test-secret';
});

beforeEach(() => {
  resetRateLimits();
});

function setCookies(response: Response): string[] {
  const withHelper = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withHelper.getSetCookie === 'function') return withHelper.getSetCookie();
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function cookieValue(cookies: string[], name: string): string | null {
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

function cookieHeader(cookies: string[]): string {
  return cookies
    .map((cookie) => cookie.split(';')[0])
    .filter((pair) => !pair.endsWith('='))
    .join('; ');
}

function post(path: string, body: unknown, cookies: string[] = [], csrf = CSRF_TOKEN): Request {
  return new Request(`https://app.example.com${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': IP,
      cookie: [`sorowill_csrf=${csrf}`, ...cookies].join('; '),
      'x-csrf-token': csrf,
    },
    body: JSON.stringify(body),
  });
}

describe('two-factor API (#879)', () => {
  it('rejects setup without a CSRF token', async () => {
    const response = await setup(
      new Request('https://app.example.com/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ owner: OWNER, channel: 'totp' }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it('rejects an invalid owner or channel', async () => {
    const badOwner = await setup(post('/api/auth/2fa/setup', { owner: 'nope', channel: 'totp' }));
    expect(badOwner.status).toBe(400);

    const badChannel = await setup(post('/api/auth/2fa/setup', { owner: OWNER, channel: 'email' }));
    expect(badChannel.status).toBe(400);

    const badPhone = await setup(post('/api/auth/2fa/setup', { owner: OWNER, channel: 'sms', phone: '123' }));
    expect(badPhone.status).toBe(400);
  });

  it('enrolls with TOTP, verifies a code and reports the enrolled state', async () => {
    const setupResponse = await setup(post('/api/auth/2fa/setup', { owner: OWNER, channel: 'totp' }));
    expect(setupResponse.status).toBe(200);

    const setupBody = (await setupResponse.json()) as {
      secret: string;
      otpauthUri: string;
      recoveryCodes: string[];
    };
    expect(setupBody.otpauthUri).toContain('otpauth://totp/');
    expect(setupBody.recoveryCodes).toHaveLength(10);

    const setupCookies = setCookies(setupResponse);
    const enrollment = cookieValue(setupCookies, 'sorowill_2fa_enrollment');
    expect(enrollment).toBeTruthy();
    // The enrollment cookie is HttpOnly and SameSite=Strict.
    expect(setupCookies.join('\n')).toMatch(/HttpOnly/);
    expect(setupCookies.join('\n')).toMatch(/SameSite=Strict/);

    const rotatedCsrf = setupResponse.headers.get('X-CSRF-Token') ?? CSRF_TOKEN;
    const code = computeTotp(setupBody.secret);

    const verifyResponse = await verify(
      post(
        '/api/auth/2fa/verify',
        { code },
        [`sorowill_2fa_enrollment=${enrollment}`],
        rotatedCsrf,
      ),
    );
    expect(verifyResponse.status).toBe(200);
    expect(await verifyResponse.json()).toMatchObject({ ok: true, channel: 'totp' });

    const verifyCookies = setCookies(verifyResponse);
    expect(cookieValue(verifyCookies, 'sorowill_2fa_enrolled')).toBeTruthy();
    expect(cookieValue(verifyCookies, 'sorowill_2fa_verified')).toBeTruthy();

    const statusResponse = status(
      new Request('https://app.example.com/api/auth/2fa/status', {
        headers: { cookie: cookieHeader(verifyCookies) },
      }),
    );
    expect(await statusResponse.json()).toMatchObject({
      enrolled: true,
      verified: true,
      channel: 'totp',
    });
  });

  it('rejects a wrong code', async () => {
    const setupResponse = await setup(post('/api/auth/2fa/setup', { owner: OWNER, channel: 'totp' }));
    const enrollment = cookieValue(setCookies(setupResponse), 'sorowill_2fa_enrollment');
    const rotatedCsrf = setupResponse.headers.get('X-CSRF-Token') ?? CSRF_TOKEN;

    const response = await verify(
      post(
        '/api/auth/2fa/verify',
        { code: '000000' },
        [`sorowill_2fa_enrollment=${enrollment}`],
        rotatedCsrf,
      ),
    );
    expect(response.status).toBe(400);
  });

  it('rejects verification without an enrollment cookie', async () => {
    const response = await verify(post('/api/auth/2fa/verify', { code: '123456' }));
    expect(response.status).toBe(400);
  });

  it('accepts a recovery code during enrollment', async () => {
    const setupResponse = await setup(post('/api/auth/2fa/setup', { owner: OWNER, channel: 'totp' }));
    const body = (await setupResponse.json()) as { recoveryCodes: string[] };
    const enrollment = cookieValue(setCookies(setupResponse), 'sorowill_2fa_enrollment');
    const rotatedCsrf = setupResponse.headers.get('X-CSRF-Token') ?? CSRF_TOKEN;

    const response = await verify(
      post(
        '/api/auth/2fa/verify',
        { code: body.recoveryCodes[0] },
        [`sorowill_2fa_enrollment=${enrollment}`],
        rotatedCsrf,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, usedRecoveryCode: true });
  });

  it('refuses to disable two-factor without a verified session', async () => {
    const response = await disable(post('/api/auth/2fa/disable', {}));
    expect(response.status).toBe(401);
  });
});
