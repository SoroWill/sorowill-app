/**
 * Browser side of the CSRF protection (#840): fetches the token, sends it with state-changing
 * requests, picks up the renewed token the server returns after each use, and forgets it when the
 * wallet is disconnected. See `src/lib/csrf.ts` for how the server checks it.
 */

const TOKEN_HEADER = 'X-CSRF-Token';
const TOKEN_ENDPOINT = '/api/csrf';

let cachedToken: string | null = null;
let pendingToken: Promise<string> | null = null;

export async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedToken && !forceRefresh) return cachedToken;
  // Share one request between callers that ask at the same time.
  pendingToken ??= fetch(TOKEN_ENDPOINT, { credentials: 'same-origin', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error('Could not get a CSRF token');
      const { token } = (await response.json()) as { token: string };
      cachedToken = token;
      return token;
    })
    .finally(() => {
      pendingToken = null;
    });
  return pendingToken;
}

/**
 * `fetch` with the CSRF token added. The server renews the token after a successful use and sends
 * the new one back, which is stored for the next request. A 403 (for example an expired cookie)
 * is retried once with a fresh token.
 */
export async function fetchWithCsrf(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const send = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers);
    headers.set(TOKEN_HEADER, await getCsrfToken(forceRefresh));
    return fetch(input, { ...init, headers, credentials: 'same-origin' });
  };

  let response = await send(false);
  if (response.status === 403) response = await send(true);

  const renewed = response.headers.get(TOKEN_HEADER);
  if (renewed) cachedToken = renewed;
  return response;
}

/** Forgets the token here and on the server. Call it when the wallet is disconnected. */
export async function clearCsrfToken(): Promise<void> {
  cachedToken = null;
  pendingToken = null;
  try {
    await fetch(TOKEN_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' });
  } catch {
    // Offline: the cookie expires by itself within the hour.
  }
}
