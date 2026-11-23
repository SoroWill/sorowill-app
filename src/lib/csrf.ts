import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * CSRF protection for the API routes that change state on a browser's behalf (#840), using a
 * double-submit token. The server gives the browser a random token twice: in an HttpOnly,
 * SameSite=Strict cookie and in the response body. A request is accepted only when the
 * `X-CSRF-Token` header carries the same value as the cookie. A page on another site can make the
 * browser send the cookie, but it cannot read the token to put it in the header, and the cookie
 * is not sent from another site at all.
 *
 * The token is renewed after every successful use and removed when the wallet is disconnected.
 */

export const CSRF_COOKIE = 'sorowill_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const CSRF_TOKEN_REGEX = /^[0-9a-f]{64}$/;
const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** The token in the request's CSRF cookie, if it is well formed. */
export function getCsrfCookieToken(request: Request): string | null {
  const token = readCookie(request, CSRF_COOKIE);
  return token && CSRF_TOKEN_REGEX.test(token) ? token : null;
}

/** True when the header token is present and equal to the cookie token. */
export function verifyCsrf(request: Request): boolean {
  const cookieToken = getCsrfCookieToken(request);
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  // Compare digests so the comparison takes the same time whatever the two values are.
  return timingSafeEqual(digest(cookieToken), digest(headerToken));
}

function cookieAttributes(maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function csrfSetCookie(token: string): string {
  return `${CSRF_COOKIE}=${token}; ${cookieAttributes(CSRF_COOKIE_MAX_AGE_SECONDS)}`;
}

export function csrfClearCookie(): string {
  return `${CSRF_COOKIE}=; ${cookieAttributes(0)}`;
}

/** Gives the response a fresh token (cookie and `X-CSRF-Token` header), so a used token cannot be replayed. */
export function rotateCsrfToken<T extends Response>(response: T): T {
  const token = generateCsrfToken();
  response.headers.append('Set-Cookie', csrfSetCookie(token));
  response.headers.set('X-CSRF-Token', token);
  return response;
}
