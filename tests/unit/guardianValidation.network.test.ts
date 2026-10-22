import { describe, it, expect } from 'vitest';

import { validateGuardians, wrongNetworkGuardianError } from '@/lib/guardianValidation';

const G1 = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';
const G2 = 'GABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEJXA';

describe('validateGuardians network check (#740)', () => {
  it('rejects an address known to be on a different network', () => {
    const { rowErrors, topError } = validateGuardians([G1], null, 'mainnet', { [G1]: 'testnet' });
    expect(rowErrors[0]).toBe(wrongNetworkGuardianError('testnet', 'mainnet'));
    expect(topError).not.toBeNull();
  });

  it('rejects testnet-only addresses on a mainnet will but not the reverse for matching ones', () => {
    const map = { [G1]: 'mainnet', [G2]: 'testnet' };
    const { rowErrors } = validateGuardians([G1, G2], null, 'mainnet', map);
    expect(rowErrors[0]).toBe('');
    expect(rowErrors[1]).toBe(wrongNetworkGuardianError('testnet', 'mainnet'));
  });

  it('accepts addresses on the same network', () => {
    const { rowErrors, topError } = validateGuardians([G1], null, 'testnet', { [G1]: 'testnet' });
    expect(rowErrors[0]).toBe('');
    expect(topError).toBeNull();
  });

  it('accepts addresses with no known network', () => {
    expect(validateGuardians([G1], null, 'testnet').rowErrors[0]).toBe('');
  });
});
