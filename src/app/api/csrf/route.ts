import { NextResponse } from 'next/server';

import { csrfClearCookie, csrfSetCookie, generateCsrfToken, getCsrfCookieToken } from '@/lib/csrf';

export const dynamic = 'force-dynamic';

/**
 * GET /api/csrf
 *
 * Returns the CSRF token for this browser and sets it in an HttpOnly cookie. A form that changes
 * state sends the token back in the `X-CSRF-Token` header (see `src/lib/csrfClient.ts`). An existing
 * valid token is reused, so opening two tabs does not invalidate either. (#840)
 */
export function GET(request: Request) {
  const token = getCsrfCookieToken(request) ?? generateCsrfToken();
  return NextResponse.json(
    { token },
    { headers: { 'Set-Cookie': csrfSetCookie(token), 'Cache-Control': 'no-store' } },
  );
}

/** DELETE /api/csrf: forgets the token, for when the person disconnects their wallet. */
export function DELETE() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Set-Cookie': csrfClearCookie(), 'Cache-Control': 'no-store' },
  });
}
