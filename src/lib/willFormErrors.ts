/**
 * Maps a submit-time error message from the will form (or the contract) to the form field it is
 * about, so the page can open the right step, mark the field and focus it (#816).
 */

export type WillFormField = 'token' | 'amount' | 'beneficiaries' | 'checkin' | 'grace' | 'guardians';

/** Wizard step (0-based) that holds each field. */
export const WILL_FORM_FIELD_STEP: Record<WillFormField, number> = {
  token: 0,
  amount: 0,
  beneficiaries: 1,
  checkin: 2,
  grace: 2,
  guardians: 3,
};

/** Label shown in front of a field's error message. */
export const WILL_FORM_FIELD_LABEL: Record<WillFormField, string> = {
  token: 'Token contract address',
  amount: 'Amount',
  beneficiaries: 'Beneficiaries',
  checkin: 'Check-in period',
  grace: 'Grace period',
  guardians: 'Guardians',
};

/** Id of the input to focus for fields that have a single input. Others use the first invalid input on the step. */
export const WILL_FORM_FIELD_INPUT_ID: Partial<Record<WillFormField, string>> = {
  token: 'token-address',
  amount: 'amount',
  checkin: 'custom-checkin',
  grace: 'custom-grace',
};

/**
 * Returns the field a message is about, or null when it is a general error. The checks run from
 * the most specific wording to the least specific one.
 */
export function classifyWillFormError(message: string): WillFormField | null {
  const text = message.toLowerCase();
  // "Grace period (…) must not be longer than the check-in period" is about the grace period.
  if (text.includes('grace')) return text.includes('check-in') && !text.includes('longer') ? 'checkin' : 'grace';
  if (text.includes('check-in') || text.includes('checkin')) return 'checkin';
  if (text.includes('guardian')) return 'guardians';
  if (text.includes('beneficiar')) return 'beneficiaries';
  if (text.includes('contract address') || text.includes('token')) return 'token';
  if (text.includes('amount') || text.includes('insufficient') || text.includes('balance')) return 'amount';
  return null;
}
