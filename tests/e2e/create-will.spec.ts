import { test, expect, type Page } from '@playwright/test';

// Well-formed addresses: the app checks the shape of an address, not that the account exists.
const TOKEN = `C${'A'.repeat(55)}`;
const HEIR = `G${'B'.repeat(55)}`;

async function fillAmountStep(page: Page, amount = '250') {
  await page.getByPlaceholder(/USDC Stellar Asset Contract/).fill(TOKEN);
  await page.getByPlaceholder('1000.00').fill(amount);
}

async function fillBeneficiaryStep(page: Page) {
  await page.getByLabel(/beneficiary 1 address/i).fill(HEIR);
}

const next = (page: Page) => page.getByRole('button', { name: 'Next' });

// Every test gets a fresh browser context, so no draft is left over from another test.
test.describe('Create a will (user journey)', () => {
  test('walks through every step to the review', async ({ page }) => {
    await page.goto('/will/new');
    await expect(page.getByText('Step 1 of 5: Amount')).toBeVisible();

    await fillAmountStep(page);
    await next(page).click();

    await expect(page.getByText('Step 2 of 5: Beneficiaries')).toBeVisible();
    await fillBeneficiaryStep(page);
    await next(page).click();

    await expect(page.getByText('Step 3 of 5: Timing')).toBeVisible();
    await next(page).click();

    await expect(page.getByText('Step 4 of 5: Guardians')).toBeVisible();
    await next(page).click();

    await expect(page.getByText('Step 5 of 5: Review')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
    await expect(page.getByText('250').first()).toBeVisible();
    await expect(page.getByText('100%').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Will' })).toBeVisible();
  });

  test('blocks the amount step until the token and amount are valid', async ({ page }) => {
    await page.goto('/will/new');
    await expect(next(page)).toBeDisabled();

    await page.getByPlaceholder(/USDC Stellar Asset Contract/).fill('not-a-contract');
    await page.getByPlaceholder('1000.00').fill('250');
    await expect(next(page)).toBeDisabled();

    await page.getByPlaceholder(/USDC Stellar Asset Contract/).fill(TOKEN);
    await expect(next(page)).toBeEnabled();

    await page.getByPlaceholder('1000.00').fill('0');
    await expect(next(page)).toBeDisabled();
  });

  test('blocks the beneficiary step until an address is given and the shares add up to 100%', async ({ page }) => {
    await page.goto('/will/new');
    await fillAmountStep(page);
    await next(page).click();

    // The row starts empty: no address yet.
    await expect(next(page)).toBeDisabled();

    await fillBeneficiaryStep(page);
    await expect(next(page)).toBeEnabled();

    await page.getByLabel(/beneficiary 1 percentage/i).fill('60');
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText(/total must equal 100%/i)).toBeVisible();

    await page.getByLabel(/beneficiary 1 percentage/i).fill('100');
    await expect(next(page)).toBeEnabled();
  });

  test('keeps what was entered when going back', async ({ page }) => {
    await page.goto('/will/new');
    await fillAmountStep(page, '125');
    await next(page).click();
    await expect(page.getByText('Step 2 of 5: Beneficiaries')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByText('Step 1 of 5: Amount')).toBeVisible();
    await expect(page.getByPlaceholder('1000.00')).toHaveValue('125');
    await expect(page.getByPlaceholder(/USDC Stellar Asset Contract/)).toHaveValue(TOKEN);
  });

  test('offers to resume the draft after a reload', async ({ page }) => {
    await page.goto('/will/new');
    await fillAmountStep(page, '75');
    await next(page).click();
    await expect(page.getByText('Step 2 of 5: Beneficiaries')).toBeVisible();

    await page.reload();

    await expect(page.getByText('Draft found')).toBeVisible();
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByText('Step 2 of 5: Beneficiaries')).toBeVisible();
  });
});
