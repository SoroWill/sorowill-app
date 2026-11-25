import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { rotateCsrfToken, verifyCsrf } from '@/lib/csrf';
import { apiError } from '@/lib/errors';
import {
  ENROLLED_COOKIE,
  ENROLLMENT_COOKIE,
  VERIFIED_COOKIE,
  clearTwoFactorCookie,
  readCookie,
  readVerifiedToken,
} from '@/lib/twoFactor';

/**
 * @openapi POST
 * {
 *   "summary": "Disable two-factor authentication",
 *   "description": "Removes this browser's two-factor enrollment. The caller must have completed a two-factor verification in this browser first, so a stolen CSRF token alone cannot turn protection off.",
 *   "tags": ["Authentication"],
 *   "responses": {
 *     "200": { "description": "Two-factor authentication disabled for this browser." },
 *     "401": { "description": "No recent verification or bad CSRF token." },
 *     "403": { "description": "Missing or invalid CSRF token." }
 *   }
 * }
 */
export async function POST(request: Request) {
  const contentTypeError = rejectUnsupportedContentType(request);
  if (contentTypeError) return contentTypeError;

  if (!verifyCsrf(request)) {
    return apiError('unauthorized', 'Invalid or missing CSRF token', 403);
  }

  const verified = readVerifiedToken(readCookie(request, VERIFIED_COOKIE));
  if (!verified) {
    return apiError(
      'unauthorized',
      'Verify a two-factor code in this browser before disabling it.',
    );
  }

  const response = NextResponse.json({ ok: true, disabled: true });
  for (const name of [ENROLLED_COOKIE, ENROLLMENT_COOKIE, VERIFIED_COOKIE]) {
    response.headers.append('Set-Cookie', clearTwoFactorCookie(name));
  }
  return rotateCsrfToken(response);
}
