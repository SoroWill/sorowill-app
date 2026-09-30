import { describe, expect, it } from 'vitest';

import { isValidWillId } from '@/lib/willId';

describe('isValidWillId', () => {
  it('accepts decimal will IDs', () => {
    expect(isValidWillId('0')).toBe(true);
    expect(isValidWillId('123')).toBe(true);
  });

  it.each(['', 'invalid-id', '-1', '1.5', ' 123 '])('rejects malformed ID %j', (id) => {
    expect(isValidWillId(id)).toBe(false);
  });
});
