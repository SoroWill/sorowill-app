import { NextResponse } from 'next/server';

import {
  ENROLLED_COOKIE,
  ENROLLMENT_COOKIE,
  VERIFIED_COOKIE,
  readCookie,
  readVerifiedToken,
  verifyToken,
  type EnrollmentPayload,
} from '@/lib/twoFactor';

/**
 * @openapi GET
 * {
 *   "summary": "Two-factor authentication status",
 *   "description": "Reports whether this browser has an enrollment and whether the current session has verified a code. Reads only signed, HttpOnly cookies; there is no user database to query.",
 *   "tags": ["Authentication"],
 *   "responses": {
 *     "200": {
 *       "description": "The current browser's two-factor state.",
 *       "content": {
 *         "application/json": {
 *           "example": { "enrolled": true, "verified": true, "channel": "totp", "pending": false }
 *         }
 *       }
 *     }
 *   }
 * }
 */
export function GET(request: Request) {
  const enrolled = readVerifiedToken(readCookie(request, ENROLLED_COOKIE));
  const verified = readVerifiedToken(readCookie(request, VERIFIED_COOKIE));
  const pending = verifyToken<EnrollmentPayload>(readCookie(request, ENROLLMENT_COOKIE));

  return NextResponse.json({
    enrolled: enrolled !== null,
    verified: verified !== null,
    pending: pending !== null,
    channel: enrolled?.channel ?? pending?.channel ?? null,
  });
}
