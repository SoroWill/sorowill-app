import { describe, expect, it, vi } from 'vitest';
import { loadActivity } from '@/app/will/[id]/page';

describe('will detail activity persistence', () => {
  it('loads persisted activity after a page reload', () => {
    window.localStorage.setItem(
      'sorowill-activity-42',
      JSON.stringify([{ action: 'check_in', txHash: 'tx-123', at: '2026-08-28T12:00:00.000Z' }]),
    );

    const activity = loadActivity('42');

    expect(activity).toEqual([
      { action: 'check_in', txHash: 'tx-123', at: new Date('2026-08-28T12:00:00.000Z') },
    ]);
  });

  it('returns an empty log when stored activity is invalid', () => {
    window.localStorage.setItem('sorowill-activity-42', 'invalid JSON');

    expect(loadActivity('42')).toEqual([]);
  });
});