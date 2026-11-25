import { describe, expect, it } from 'vitest';

import { getWillsByBeneficiary } from '@/lib/sorowill';

const ALICE = `G${'A'.repeat(55)}`;
const BOB = `G${'B'.repeat(55)}`;

function fakeClient(wills: Record<string, unknown>) {
  return {
    getWill: async (id: string) => {
      const will = wills[id];
      if (!will) throw new Error('will not found');
      return will;
    },
  } as never;
}

describe('getWillsByBeneficiary (#876)', () => {
  it('returns only the wills naming the beneficiary, across the scan batches', async () => {
    const client = fakeClient({
      '1': { id: '1', beneficiaries: [{ address: BOB, percentage: 100 }] },
      '2': { id: '2', beneficiaries: [{ address: ALICE, percentage: 50 }] },
      '3': { id: '3', beneficiaries: [] },
    });

    const result = await getWillsByBeneficiary(ALICE, { client });

    expect(result.wills.map((will) => will.id)).toEqual(['2']);
    expect(result.hasErrors).toBe(false);
  });

  it('matches addresses without regard to case', async () => {
    const client = fakeClient({
      '1': { id: '1', beneficiaries: [{ address: ALICE, percentage: 100 }] },
    });

    const result = await getWillsByBeneficiary(`  ${ALICE.toLowerCase()}  `, { client });

    expect(result.wills.map((will) => will.id)).toEqual(['1']);
  });

  it('stops scanning once a whole batch has no wills', async () => {
    let calls = 0;
    const client = {
      getWill: async (id: string) => {
        calls += 1;
        if (Number(id) === 1) {
          return { id, beneficiaries: [{ address: ALICE, percentage: 100 }] };
        }
        throw new Error('not found');
      },
    } as never;

    await getWillsByBeneficiary(ALICE, { client });

    // Batch 1 covers ids 1-30; the whole second batch misses, which ends the scan.
    expect(calls).toBe(60);
  });

  it('reports network errors as hasErrors without dropping matches', async () => {
    const client = {
      getWill: async (id: string) => {
        if (id === '1') {
          return { id, beneficiaries: [{ address: ALICE, percentage: 100 }] };
        }
        if (id === '31') throw new Error('RPC unavailable');
        throw new Error('will not found');
      },
    } as never;

    const result = await getWillsByBeneficiary(ALICE, { client });

    expect(result.wills.map((will) => will.id)).toEqual(['1']);
    expect(result.hasErrors).toBe(true);
  });
});
