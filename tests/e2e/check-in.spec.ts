import { test, expect } from '@playwright/test';

// A check-in is signed with the owner's wallet and sent to the contract, so the signing step itself is not covered
// here. These tests cover what comes before it: the wallet prompt, and the server clock that deadline maths relies on.
test.describe('Check in (user journey)', () => {
  test('asks for a wallet before offering any check-in', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Connect your wallet' })).toBeVisible();
    await expect(page.getByRole('button', { name: /check in/i })).toHaveCount(0);
  });

  test('serves the server time used to compute check-in deadlines', async ({ request }) => {
    const before = Date.now();
    const response = await request.get('/api/time');
    const after = Date.now();

    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');

    const { now } = (await response.json()) as { now: number };
    expect(Number.isInteger(now)).toBe(true);
    // The server and the test run on the same machine, so the two clocks agree within a few seconds.
    expect(now).toBeGreaterThanOrEqual(before - 5_000);
    expect(now).toBeLessThanOrEqual(after + 5_000);
  });
});
