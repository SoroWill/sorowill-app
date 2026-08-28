import { describe, expect, it, beforeEach } from 'vitest';
import { loadActivity } from '@/app/will/[id]/page';

describe('will activity persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores activity entries for the same will after reload', () => {
    localStorage.setItem(
      'sorowill-activity-42',
      JSON.stringify([{ action: 'check_in', txHash: 'tx-123', at: '2026-08-28T12:00:00.000Z' }]),
    );

    const restored = loadActivity('42');

    expect(restored).toEqual([
      { action: 'check_in', txHash: 'tx-123', at: new Date('2026-08-28T12:00:00.000Z') },
    ]);
  });

  it('does not restore another will\'s activity', () => {
    localStorage.setItem(
      'sorowill-activity-41',
      JSON.stringify([{ action: 'check_in', txHash: 'tx-123', at: '2026-08-28T12:00:00.000Z' }]),
    );

    expect(loadActivity('42')).toEqual([]);
  });
});