/**
 * Transaction fee estimation for SoroWill operations.
 *
 * Stellar charges fees in stroops (1 XLM = 10,000,000 stroops). A Soroban
 * transaction pays a base inclusion fee plus a resource fee covering CPU
 * instructions, ledger I/O and rent. The resource fee is only known after
 * simulation, so callers may pass a simulated total; otherwise we fall back to
 * a conservative per-operation estimate.
 */

/** Stroops in one lumen (XLM). */
export const STROOPS_PER_XLM = 10_000_000n;

/** Stellar base fee per operation, in stroops. */
export const BASE_FEE_STROOPS = 100n;

/** Conservative resource-fee estimate per Soroban operation, in stroops. */
export const RESOURCE_FEE_STROOPS = 10_000n;

/** Operations that submit a Soroban transaction and therefore pay fees. */
export type FeeOperation =
  | 'create_will'
  | 'check_in'
  | 'emergency_check_in'
  | 'top_up'
  | 'trigger_will'
  | 'release_inheritance'
  | 'update_beneficiaries'
  | 'cancel_will';

/** Human-readable labels for each fee-bearing operation. */
export const FEE_OPERATION_LABELS: Record<FeeOperation, string> = {
  create_will: 'Create will',
  check_in: 'Check in',
  emergency_check_in: 'Emergency check in',
  top_up: 'Top up',
  trigger_will: 'Trigger will',
  release_inheritance: 'Release inheritance',
  update_beneficiaries: 'Update beneficiaries',
  cancel_will: 'Cancel will',
};

export interface FeeBreakdown {
  /** Number of contract operations in the transaction. */
  operations: number;
  /** Base inclusion fee, in stroops. */
  baseFeeStroops: bigint;
  /** Soroban resource fee (CPU, I/O, rent), in stroops. */
  resourceFeeStroops: bigint;
  /** Total fee, in stroops. */
  totalStroops: bigint;
  /** Total fee, in lumens (XLM). */
  totalXlm: number;
  /** True when the resource fee came from a simulation rather than the estimate. */
  simulated: boolean;
}

/**
 * Builds a fee breakdown for `operationCount` operations.
 *
 * @param operationCount - Number of operations in the transaction (>= 1).
 * @param simulatedTotalStroops - Optional total fee returned by simulation.
 */
export function estimateFee(
  operationCount = 1,
  simulatedTotalStroops?: bigint | number | null,
): FeeBreakdown {
  const operations = Math.max(1, Math.floor(operationCount));
  const baseFeeStroops = BASE_FEE_STROOPS * BigInt(operations);

  if (simulatedTotalStroops !== undefined && simulatedTotalStroops !== null) {
    const totalStroops = BigInt(simulatedTotalStroops);
    const resourceFeeStroops = totalStroops > baseFeeStroops ? totalStroops - baseFeeStroops : 0n;
    return {
      operations,
      baseFeeStroops,
      resourceFeeStroops,
      totalStroops,
      totalXlm: Number(totalStroops) / Number(STROOPS_PER_XLM),
      simulated: true,
    };
  }

  const resourceFeeStroops = RESOURCE_FEE_STROOPS * BigInt(operations);
  const totalStroops = baseFeeStroops + resourceFeeStroops;
  return {
    operations,
    baseFeeStroops,
    resourceFeeStroops,
    totalStroops,
    totalXlm: Number(totalStroops) / Number(STROOPS_PER_XLM),
    simulated: false,
  };
}

/** Formats a stroop amount as a lumen string, e.g. `0.0010100 XLM`. */
export function formatStroopsAsXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = (stroops % STROOPS_PER_XLM).toString().padStart(7, '0');
  return `${whole}.${fraction} XLM`;
}

/** Formats a stroop amount with thousands separators, e.g. `10,100 stroops`. */
export function formatStroops(stroops: bigint): string {
  return `${stroops.toLocaleString('en-US')} stroops`;
}
