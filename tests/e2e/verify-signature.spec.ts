import { test, expect } from '@playwright/test';

// Signature checks happen where a will owner proves they control their wallet: the reminder sign-up. These tests
// call the API directly, so they need neither a wallet nor a live contract.
const VALID_BODY = {
  willId: '42',
  email: 'owner@example.com',
  owner: '0x0000000000000000000000000000000000000001',
  message: 'Enable reminders for will 42',
  signature: '0x00',
};

test.describe('Verify a signature (user journey)', () => {
  test('rejects a request whose signature does not match the owner', async ({ request }) => {
    const response = await request.post('/api/reminders/register', { data: VALID_BODY });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
  });

  test('rejects a request that is missing the signature', async ({ request }) => {
    const { signature: _signature, ...withoutSignature } = VALID_BODY;
    const response = await request.post('/api/reminders/register', { data: withoutSignature });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'Missing required fields' });
  });

  test('rejects an invalid email before checking the signature', async ({ request }) => {
    const response = await request.post('/api/reminders/register', { data: { ...VALID_BODY, email: 'not-an-email' } });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid email format' });
  });

  test('only accepts JSON', async ({ request }) => {
    const response = await request.post('/api/reminders/register', {
      headers: { 'Content-Type': 'text/plain' },
      data: JSON.stringify(VALID_BODY),
    });

    expect(response.status()).toBe(415);
  });
});

test.describe('Verification page', () => {
  for (const id of ['not-a-number', '-1', '1.5']) {
    test(`answers 404 for the will id "${id}"`, async ({ page }) => {
      const response = await page.goto(`/verify/${id}`);
      expect(response?.status()).toBe(404);
    });
  }
});
