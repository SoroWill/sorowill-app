import { describe, expect, it } from 'vitest';
import { getGracePeriodRelationError, getSubmittedGuardians } from '@/app/will/new/page';

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

describe('getGracePeriodRelationError', () => {
  it.each([
    [7, 14],
    [30, 31],
    [1, 3650],
  ])('rejects grace %i days longer than check-in %i days', (checkin, grace) => {
    // arguments are (checkin, grace); these cases have grace > checkin
    expect(getGracePeriodRelationError(Math.min(checkin, grace), Math.max(checkin, grace))).toMatch(
      /must not be longer than the check-in period/,
    );
  });

  it.each([
    [30, 30],
    [90, 7],
    [60, 14],
  ])('accepts check-in %i with grace %i', (checkin, grace) => {
    expect(getGracePeriodRelationError(checkin, grace)).toBeNull();
  });
});
