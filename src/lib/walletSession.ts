export const DISCONNECTED_KEY = 'sorowill:wallet-cleared';
export const LAST_ACTIVITY_KEY = 'sorowill:wallet-last-activity';
export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_WARNING_MS = 5 * 60_000;

export function getIdleDeadline() {
  const lastActivity = sessionStorage.getItem(LAST_ACTIVITY_KEY);
  return lastActivity === null ? null : Number(lastActivity) + SESSION_IDLE_MS;
}

export function isWalletSessionBlocked() {
  const deadline = getIdleDeadline();
  return sessionStorage.getItem(DISCONNECTED_KEY) === 'true' ||
    (deadline !== null && Date.now() >= deadline);
}
