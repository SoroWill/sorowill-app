import { describe, expect, it } from 'vitest';
import { getSubmittedGuardians } from '@/app/will/new/page';

describe('getSubmittedGuardians', () => {
  it('submits the resolved address for a federated guardian', () => {
    const rawGuardians = ['guardian*example.com'];
    const guardianIds = new Map([[0, 'guardian-row-id']]);
    const resolvedGuardians = new Map([
      ['guardian-row-id', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'],
    ]);

    expect(getSubmittedGuardians(rawGuardians, resolvedGuardians, guardianIds)).toEqual([
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
    ]);
  });
});