import { describe, it, expect } from 'vitest';
import enMessages from '../../src/messages/en.json';
import esMessages from '../../src/messages/es.json';

// Issue #442: every page must render fully in every supported locale, so the
// Spanish catalog must never drift behind the English one. next-intl renders
// the raw key path when a message is missing, which silently ships English
// keys to Spanish users. This test plus the `prebuild` npm script (see
// package.json) make a missing translation fail the build, not production.

function flattenMessages(
  node: unknown,
  prefix = '',
): Record<string, string> {
  const leaves: Record<string, string> = {};

  if (typeof node === 'string') {
    if (prefix) leaves[prefix] = node;
    return leaves;
  }

  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      Object.assign(leaves, flattenMessages(value, prefix ? `${prefix}.${key}` : key));
    }
  }

  return leaves;
}

const enKeys = Object.keys(flattenMessages(enMessages)).sort();
const esKeys = Object.keys(flattenMessages(esMessages)).sort();

describe('i18n message parity (#442)', () => {
  it('es.json defines exactly the same keys as en.json', () => {
    const missingInEs = enKeys.filter((key) => !esKeys.includes(key));
    const extraInEs = esKeys.filter((key) => !enKeys.includes(key));

    expect(
      missingInEs,
      `Spanish translations missing for keys: ${missingInEs.join(', ')}`,
    ).toEqual([]);
    expect(
      extraInEs,
      `Spanish catalog has keys absent from English: ${extraInEs.join(', ')}`,
    ).toEqual([]);
    expect(esKeys.length).toBeGreaterThan(0);
  });

  it('defines the faq namespace with the expected structure in both locales', () => {
    const expectedItemKeys = [
      'howItWorks',
      'missedCheckIn',
      'updateBeneficiaries',
      'cancelWill',
      'guardians',
      'recoverFunds',
      'supportedTokens',
      'trustless',
      'willPrivacy',
      'lostWallet',
      'beneficiaryStatus',
      'willSafety',
      'federatedAddresses',
      'deadlineReminder',
      'fees',
      'claimInheritance',
    ];

    for (const messages of [enMessages, esMessages]) {
      const faq = messages.faq as Record<string, unknown> | undefined;
      expect(faq, 'faq namespace must exist in messages').toBeDefined();

      expect(Object.keys(faq)).toEqual(
        expect.arrayContaining(['items']),
      );

      const items = faq.items as Record<string, unknown>;
      expect(Object.keys(items)).toEqual(expect.arrayContaining(expectedItemKeys));

      for (const itemKey of expectedItemKeys) {
        const item = items[itemKey] as Record<string, unknown>;
        expect(item.question).toBeTruthy();
        expect(item.answer).toBeTruthy();
      }

      for (const stepKey of ['create', 'checkins', 'miss', 'grace', 'release']) {
        const step = (faq.lifecycle as Record<string, unknown>).steps[stepKey] as Record<
          string,
          unknown
        >;
        expect(step.title).toBeTruthy();
        expect(step.description).toBeTruthy();
      }
    }
  });
});
