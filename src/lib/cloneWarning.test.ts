import { describe, expect, it } from 'vitest';
import { WillStatus } from '@sorowill/sdk';
import { shouldWarnOnClone } from './cloneWarning';

describe('shouldWarnOnClone', () => {
  it.each([
    [WillStatus.Active, false],
    [WillStatus.Triggered, false],
    [WillStatus.Released, true],
    [WillStatus.Cancelled, true],
  ])('status %s -> %s', (status, expected) => {
    expect(shouldWarnOnClone(status)).toBe(expected);
  });
});
