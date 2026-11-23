import { validateBeneficiaries, type Beneficiary } from '@sorowill/sdk';

import { isValidAmount } from '@/lib/amount';
import { isFederatedAddress } from '@/lib/federated';
import { validateGuardians } from '@/lib/guardianValidation';
import { isValidContractAddress } from '@/lib/willId';

/** Everything the create-will steps check, taken from the form or from a saved draft. */
export interface WillStepData {
  token: string;
  amount: string;
  beneficiaries: Beneficiary[];
  checkinPeriodDays: number;
  gracePeriodDays: number;
  guardians: string[];
  ownerAddress: string | null;
  network: string | null;
  /** Longest check-in period that is safe from storage archival. */
  safeCheckinWindowDays: number;
}

/** Wizard steps in order: 0 amount, 1 beneficiaries, 2 timing, 3 guardians, 4 review. */
export const REVIEW_STEP = 4;

/**
 * Plain-language list of what is still wrong on one step (#830); empty when the step is complete.
 * The review step has no fields of its own.
 */
export function getStepProblems(step: number, data: WillStepData): string[] {
  const problems: string[] = [];

  if (step === 0) {
    if (!isValidContractAddress(data.token.trim())) {
      problems.push('Enter a valid token contract address (it starts with C and is 56 characters long).');
    }
    if (!isValidAmount(data.amount) || Number(data.amount) === 0) {
      problems.push('Enter an amount greater than zero.');
    }
  }

  if (step === 1) {
    const rows = data.beneficiaries;
    if (rows.length === 0) {
      problems.push('Add at least one beneficiary.');
    }
    if (rows.some((b) => b.address.trim() === '')) {
      problems.push('Every beneficiary needs an address.');
    }
    if (rows.some((b) => isFederatedAddress(b.address))) {
      problems.push('Resolve each federated address to a Stellar address before continuing.');
    }
    if (rows.length > 0 && !validateBeneficiaries(rows)) {
      const total = rows.reduce((sum, b) => sum + Math.round(Number(b.percentage) * 100), 0) / 100;
      problems.push(`Percentages must be valid and add up to 100% (they add up to ${total}% now).`);
    }
  }

  if (step === 2) {
    const { checkinPeriodDays: checkin, gracePeriodDays: grace } = data;
    if (!Number.isInteger(checkin) || checkin <= 0) problems.push('Check-in period must be a whole number of days.');
    if (!Number.isInteger(grace) || grace <= 0) problems.push('Grace period must be a whole number of days.');
    if (checkin > data.safeCheckinWindowDays) {
      problems.push(`Check-in period must be ${data.safeCheckinWindowDays} days or fewer.`);
    }
    if (grace > checkin) problems.push('Grace period must not be longer than the check-in period.');
  }

  if (step === 3) {
    const { rowErrors, topError } = validateGuardians(data.guardians, data.ownerAddress, data.network);
    if (topError) problems.push(topError);
    rowErrors.forEach((error, index) => {
      if (error) problems.push(`Guardian ${index + 1}: ${error}`);
    });
  }

  return problems;
}

/**
 * The first step before `target` that is not complete, or `target` when all earlier ones are.
 * Used so a restored draft cannot land past a step that still has problems.
 */
export function firstIncompleteStepBefore(target: number, data: WillStepData): number {
  for (let step = 0; step < Math.min(target, REVIEW_STEP); step++) {
    if (getStepProblems(step, data).length > 0) return step;
  }
  return target;
}
