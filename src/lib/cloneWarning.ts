import { WillStatus } from '@sorowill/sdk';

/** True when cloning from a will in this status is likely unintended (#736). */
export function shouldWarnOnClone(status: WillStatus): boolean {
  return status === WillStatus.Released || status === WillStatus.Cancelled;
}
