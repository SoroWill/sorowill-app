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
import { isValidStellarAccount } from '@/lib/serverValidation';
import { buildSmsCodeMessage, isSmsConfigured, sendSms } from '@/lib/sms';
import {
  ENROLLMENT_COOKIE,
  ENROLLMENT_TTL_MS,
  createEnrollment,
  isValidE164Phone,
  serializeTwoFactorCookie,
  type TwoFactorChannel,
} from '@/lib/twoFactor';

/**
 * @openapi POST
 * {
 *   "summary": "Start two-factor authentication enrollment",
 *   "description": "Starts TOTP or SMS two-factor enrollment for a Stellar wallet address. Returns the shared secret and otpauth URI for authenticator apps (TOTP), or sends a code by SMS. Recovery codes are returned once and never again. The short-lived, signed enrollment cookie must be sent with the verification request.",
 *   "tags": ["Authentication"],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "required": ["owner", "channel"],
 *           "properties": {
 *             "owner": { "type": "string", "description": "Stellar account address the enrollment belongs to." },
 *             "channel": { "type": "string", "enum": ["totp", "sms"] },
 *             "phone": { "type": "string", "description": "E.164 phone number; required for the SMS channel." }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": { "description": "Enrollment started; set the enrollment cookie before completing it." },
 *     "400": { "description": "Invalid owner address, channel or phone number." },
 *     "403": { "description": "Missing or invalid CSRF token." },
 *     "429": { "description": "Too many enrollment attempts." }
 *   }
 * }
 */
export async function POST(request: Request) {
  const contentTypeError = rejectUnsupportedContentType(request);
  if (contentTypeError) return contentTypeError;

  if (!verifyCsrf(request)) {
    return apiError('unauthorized', 'Invalid or missing CSRF token', 403);
  }

  const config = getRateLimitConfig('auth/2fa/setup');
  const limit = checkRateLimit(
    buildRateLimitKey('auth/2fa/setup', getClientIp(request)),
    config.max,
    config.windowMs,
  );
  if (!limit.allowed) return buildRateLimitResponse(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('validation', 'Request body must be JSON');
  }

  const { owner, channel, phone } = (body ?? {}) as {
    owner?: unknown;
    channel?: unknown;
    phone?: unknown;
  };

  if (typeof owner !== 'string' || !isValidStellarAccount(owner.trim())) {
    return apiError('validation', 'A valid Stellar account address is required');
  }
  if (channel !== 'totp' && channel !== 'sms') {
    return apiError('validation', "Channel must be 'totp' or 'sms'");
  }
  if (channel === 'sms' && (typeof phone !== 'string' || !isValidE164Phone(phone))) {
    return apiError('validation', 'A valid E.164 phone number is required for SMS');
  }

  const created = createEnrollment({
    owner: owner.trim(),
    channel: channel as TwoFactorChannel,
    phone: channel === 'sms' ? (phone as string).trim() : undefined,
  });

  let smsDelivered = false;
  let developmentCode: string | undefined;

  if (created.smsCode) {
    const delivery = await sendSms(created.enrollment.phone as string, buildSmsCodeMessage(created.smsCode));
    smsDelivered = delivery.delivered;
    if (!delivery.delivered && process.env.NODE_ENV === 'production') {
      return apiError('server_error', 'Could not send the verification code. Try again later.', 502);
    }
    if (!delivery.delivered) developmentCode = created.smsCode;
  }

  const response = NextResponse.json({
    ok: true,
    channel: created.enrollment.channel,
    expiresInSeconds: Math.floor(ENROLLMENT_TTL_MS / 1000),
    recoveryCodes: created.recoveryCodes,
    ...(created.otpauthUri ? { otpauthUri: created.otpauthUri, secret: created.enrollment.secret } : {}),
    ...(created.enrollment.phone
      ? { smsSent: smsDelivered, smsConfigured: isSmsConfigured(), ...(developmentCode ? { developmentCode } : {}) }
      : {}),
  });

  response.headers.append(
    'Set-Cookie',
    serializeTwoFactorCookie(ENROLLMENT_COOKIE, created.token, Math.floor(ENROLLMENT_TTL_MS / 1000)),
  );
  return rotateCsrfToken(response);
}
