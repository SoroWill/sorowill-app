/**
 * Will IDs are assigned by the SoroWill contract as a sequential u64 counter,
 * so on-chain IDs can never collide and are never generated client-side.
 * `isValidWillId` only checks that a string has that numeric shape.
 */
export function isValidWillId(id: string): boolean {
  return /^\d+$/.test(id);
}

export function isValidContractAddress(address: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(address);
}

/** Generates a unique client-side ID for UI elements (e.g., toast messages). */
export function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
