import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BeneficiaryForm } from '@/components/BeneficiaryForm';
import { GuardianForm } from '@/components/GuardianForm';
import { MAX_GUARDIANS } from '@/lib/constants';

vi.mock('@/lib/federated', () => ({
  isFederatedAddress: () => false,
  resolveFederatedAddress: vi.fn(),
}));

// Short words that stay lower case inside a title ("Add Guardian (1 of 5)").
const MINOR_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

/** True when every word starts with a capital letter, apart from minor words after the first. */
function isTitleCase(text: string): boolean {
  return text
    .replace(/^\+\s*/, '')
    .split(/\s+/)
    .filter((word) => /[A-Za-z]/.test(word))
    .every((word, index) => {
      const letters = word.replace(/^[^A-Za-z]+/, '');
      return (index > 0 && MINOR_WORDS.has(letters.toLowerCase())) || /^[A-Z]/.test(letters);
    });
}

function controlNames(container: HTMLElement): string[] {
  const names = new Set<string>();
  container.querySelectorAll('label').forEach((el) => names.add(el.textContent?.trim() ?? ''));
  container.querySelectorAll('[aria-label]').forEach((el) => names.add(el.getAttribute('aria-label') ?? ''));
  container.querySelectorAll('button').forEach((el) => {
    if (!el.getAttribute('aria-label')) names.add(el.textContent?.trim() ?? '');
  });
  names.delete('');
  names.delete('✕');
  return [...names];
}

describe('form label capitalization (#823)', () => {
  it('recognises title case', () => {
    expect(isTitleCase('Beneficiary 1 Address')).toBe(true);
    expect(isTitleCase('Add Guardian (1 of 5)')).toBe(true);
    expect(isTitleCase('+ Add Beneficiary')).toBe(true);
    expect(isTitleCase('Beneficiary 1 address')).toBe(false);
    expect(isTitleCase('Remove guardian 2')).toBe(false);
  });

  it('uses title case for every BeneficiaryForm label and button', () => {
    const { container } = render(
      <BeneficiaryForm
        value={[
          { address: '', percentage: 50 },
          { address: '', percentage: 50 },
        ]}
        onChange={vi.fn()}
      />,
    );
    const names = controlNames(container);
    expect(names).toContain('Beneficiary 1 Address');
    expect(names).toContain('Beneficiary 2 Percentage');
    expect(names).toContain('Remove Beneficiary 1');
    expect(names).toContain('Split Equally');
    expect(names).toContain('+ Add Beneficiary');
    expect(names.filter((name) => !isTitleCase(name))).toEqual([]);
  });

  it('uses title case for every GuardianForm label and button', () => {
    const guardians = ['', ''];
    const { container } = render(
      <GuardianForm
        guardians={guardians}
        guardianIds={new Map(guardians.map((_, i) => [i, `id-${i}`]))}
        resolvedGuardians={new Map()}
        guardianResolutionError={new Map()}
        resolvingGuardianId={null}
        rowErrors={guardians.map(() => '')}
        topError={null}
        blankGuardianIndices={[]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onResolve={vi.fn()}
      />,
    );
    const names = controlNames(container);
    expect(names).toContain('Guardian 1 Address');
    expect(names).toContain('Remove Guardian 2');
    expect(names).toContain(`Add Guardian (2 of ${MAX_GUARDIANS})`);
    expect(names).toContain('+ Add Guardian');
    expect(names.filter((name) => !isTitleCase(name))).toEqual([]);
  });
});
