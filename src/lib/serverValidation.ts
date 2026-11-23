import { isValidAmount } from '@/lib/amount';
import { isValidWillId } from '@/lib/willId';

/**
 * Server-side checks for what API routes accept (#839). The browser validates the same things for
 * a good experience, but a request can come from anywhere, so every route checks its own input
 * and answers 400 when it is wrong.
 */

export const EMAIL_MAX_LENGTH = 254;
export const MESSAGE_MAX_LENGTH = 2_000;
export const SIGNATURE_MAX_LENGTH = 2_048;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Will ids are unsigned 64-bit integers, which have at most 20 digits.
const WILL_ID_MAX_DIGITS = 20;
const STELLAR_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
const STELLAR_CONTRACT_REGEX = /^C[A-Z2-7]{55}$/;
// Reminder tokens are UUIDs; this also admits other URL-safe tokens but nothing with spaces or markup.
const TOKEN_REGEX = /^[A-Za-z0-9_-]{1,128}$/;
const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_REGEX.test(email);
}

export function isValidWillIdValue(willId: string): boolean {
  return isValidWillId(willId) && willId.length <= WILL_ID_MAX_DIGITS;
}

/** A positive token amount as text, with the same rules the forms apply (`isValidAmount`). */
export function isValidAmountValue(amount: unknown): amount is string {
  return typeof amount === 'string' && isValidAmount(amount);
}

/** A beneficiary percentage: a finite number above 0 and at most 100. */
export function isValidPercentageValue(percentage: unknown): percentage is number {
  return typeof percentage === 'number' && Number.isFinite(percentage) && percentage > 0 && percentage <= 100;
}

/** A Stellar account address (`G...`). */
export function isValidStellarAccount(address: string): boolean {
  return STELLAR_ACCOUNT_REGEX.test(address);
}

/** A Stellar contract address (`C...`). */
export function isValidStellarContract(address: string): boolean {
  return STELLAR_CONTRACT_REGEX.test(address);
}

/**
 * An owner address as the reminder sign-up receives it: a Stellar account (what a will stores as
 * its owner) or a 20 byte `0x` address (what its signature check works with).
 */
export function isValidOwnerAddress(address: string): boolean {
  return isValidStellarAccount(address) || EVM_ADDRESS_REGEX.test(address);
}

export function isValidReminderToken(token: string): boolean {
  return TOKEN_REGEX.test(token);
}

export interface RegisterFields {
  willId: string;
  email: string;
  owner: string;
  signature: string;
  message: string;
}

/** The message for the first problem in a reminder sign-up, or null when every field is acceptable. */
export function validateRegisterFields(fields: RegisterFields): string | null {
  if (!isValidWillIdValue(fields.willId)) return 'Invalid will ID';
  if (!isValidEmail(fields.email)) return 'Invalid email format';
  if (!isValidOwnerAddress(fields.owner)) return 'Invalid owner address';
  if (fields.message.length > MESSAGE_MAX_LENGTH) return 'Message is too long';
  if (fields.signature.length > SIGNATURE_MAX_LENGTH) return 'Signature is too long';
  return null;
}
