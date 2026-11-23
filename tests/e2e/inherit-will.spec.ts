import { test, expect } from '@playwright/test';

// The Soroban RPC the app talks to from the browser on testnet. These tests do not need a live contract: they
// cover what a beneficiary sees before any will data can be read.
const RPC_HOST = /soroban-testnet\.stellar\.org/;

test.describe('Inherit a will (user journey)', () => {
  test('rejects a will id that is not a number', async ({ page }) => {
    await page.goto('/inherit/not-a-number');

    await expect(page.getByRole('heading', { name: 'Invalid will ID' })).toBeVisible();
    await expect(page.getByText(/is not a valid will identifier/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /claim inheritance/i })).toHaveCount(0);
  });

  test('shows a loading placeholder while the will is being read', async ({ page }) => {
    // Hold the RPC response so the loading state stays on screen.
    await page.route(RPC_HOST, () => new Promise(() => {}));
    await page.goto('/inherit/12345');

    await expect(page.locator('.skeleton').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /claim inheritance/i })).toHaveCount(0);
  });

  test('explains that the will could not be loaded and lets the person try again', async ({ page }) => {
    let rpcRequests = 0;
    await page.route(RPC_HOST, (route) => {
      rpcRequests += 1;
      return route.abort('failed');
    });

    await page.goto('/inherit/12345');

    await expect(page.getByRole('heading', { name: /could not load will/i })).toBeVisible();
    // Nothing can be claimed without a will.
    await expect(page.getByRole('button', { name: /claim inheritance/i })).toHaveCount(0);

    const before = rpcRequests;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => rpcRequests).toBeGreaterThan(before);
  });
});
