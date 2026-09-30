export function isValidWillId(id: string): boolean {
  return /^\d+$/.test(id);
}
