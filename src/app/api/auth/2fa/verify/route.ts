import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { rotateCsrfToken, verifyCsrf } from '@/lib/csrf';
import { apiError } from '@/lib/errors';
import {
  buildRateLimitKey,
  buildRateLimitResponse,
  checkRateLimit,
  getClientIp,
  getRateLimitConfig,
} from '@/lib/rate-limit';
import {
  ENROLLED_COOKIE,
  ENROLLED_TTL_MS,
  ENROLLMENT_COOKIE,
  VERIFIED_COOKIE,
  VERIFIED_TTL_MS,
  clearTwoFactorCookie,
  createEnrolledToken,
  createVerifiedToken,
  readCookie,
  serializeTwoFactorCookie,
  verifyEnrollmentCode,
  verifyToken,
  type EnrollmentPayload,
} from '@/lib/twoFactor';

/**
 * @openapi POST
 * {
 *   "summary": "Verify a two-factor code",
 *   "description": "Completes enrollment by checking a TOTP or SMS code (or a single-use recovery code) against the signed enrollment cookie. On success the enrollment cookie is replaced by a long-lived enrolled cookie and a short-lived verified cookie. A used recovery code is removed from the enrollment.",
 *   "tags": ["Authentication"],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "required": ["code"],
 *           "properties": {
 *             "code": { "type": "string", "description": "Six-digit code, or a recovery code such as K3M7-9QXA." }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": { "description": "Code accepted." },
 *     "400": { "description": "No enrollment in progress or the code is wrong." },
 *     "403": { "description": "Missing or invalid CSRF token." },
 *     "429": { "description": "Too many verification attempts." }
 *   }
 * }
 */
export async function POST(request: Request) {
  const contentTypeError = rejectUnsupportedContentType(request);
  if (contentTypeError) return contentTypeError;

  if (!verifyCsrf(request)) {
    return apiError('unauthorized', 'Invalid or missing CSRF token', 403);
  }

  const config = getRateLimitConfig('auth/2fa/verify');
  const limit = checkRateLimit(
    buildRateLimitKey('auth/2fa/verify', getClientIp(request)),
    config.max,
    config.windowMs,
  );
  if (!limit.allowed) return buildRateLimitResponse(limit);

  const enrollment = verifyToken<EnrollmentPayload>(
    readCookie(request, ENROLLMENT_COOKIE),
  );
  if (!enrollment || !enrollment.secret && !enrollment.smsCodeHash) {
    return apiError('validation', 'No two-factor enrollment is in progress. Start again.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation', 'Request body must be JSON');
  }
  const { code } = (body ?? {}) as { code?: unknown };
  if (typeof code !== 'string' || code.trim() === '') {
    return apiError('validation', 'A verification code is required');
  }

  const result = verifyEnrollmentCode(enrollment, code);
  if (!result.ok) {
    return apiError(
      'validation',
      result.reason === 'expired'
        ? 'This enrollment has expired. Start again.'
        : 'That code is not valid. Check it and try again.',
      400,
    );
  }

  const response = NextResponse.json({
    ok: true,
    verified: true,
    channel: enrollment.channel,
    remainingRecoveryCodes: result.remainingRecoveryCodes,
    usedRecoveryCode: result.usedRecoveryCode,
    // A used recovery code is gone for good; tell the client how many are left
    // so it can prompt for new ones when the set runs low.
    ...(result.usedRecoveryCode ? { recoveryCodeConsumed: true } : {}),
  });

  response.headers.append('Set-Cookie', clearTwoFactorCookie(ENROLLMENT_COOKIE));
  response.headers.append(
    'Set-Cookie',
    serializeTwoFactorCookie(VERIFIED_COOKIE, createVerifiedToken(enrollment.owner, enrollment.channel), Math.floor(VERIFIED_TTL_MS / 1000)),
  );
  response.headers.append(
    'Set-Cookie',
    serializeTwoFactorCookie(ENROLLED_COOKIE, createEnrolledToken(enrollment.owner, enrollment.channel), Math.floor(ENROLLED_TTL_MS / 1000)),
  );

  return rotateCsrfToken(response);
}
