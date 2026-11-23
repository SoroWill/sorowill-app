import { NextResponse } from 'next/server';
import { verifyMessage } from 'viem';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { apiError, ErrorCode } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { registerReminderSubscription } from '@/lib/reminders';
import { getSoroWillClient } from '@/lib/sorowill';
import { withCorrelationId } from '@/lib/correlation';

/**
 * @openapi POST
 * {
 *   "summary": "Register an email reminder for a will",
 *   "description": "Subscribes an email address to check-in reminders for a will. The caller proves they control the owner's wallet by signing `message`. The will must exist on-chain. A confirmation email is sent and the subscription is active once its link is opened. Limited to 10 requests per hour per client IP.",
 *   "tags": [
 *     "Reminders"
 *   ],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "required": [
 *             "willId",
 *             "email",
 *             "owner",
 *             "signature",
 *             "message"
 *           ],
 *           "properties": {
 *             "willId": {
 *               "type": "string",
 *               "description": "Numeric will id.",
 *               "example": "42"
 *             },
 *             "email": {
 *               "type": "string",
 *               "format": "email",
 *               "maxLength": 254
 *             },
 *             "owner": {
 *               "type": "string",
 *               "description": "Address of the will owner who signed the message."
 *             },
 *             "message": {
 *               "type": "string",
 *               "description": "The text that was signed."
 *             },
 *             "signature": {
 *               "type": "string",
 *               "description": "Signature of `message` by `owner`."
 *             }
 *           }
 *         },
 *         "example": {
 *           "willId": "42",
 *           "email": "owner@example.com",
 *           "owner": "0x0000000000000000000000000000000000000001",
 *           "message": "Enable reminders for will 42",
 *           "signature": "0x..."
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": {
 *       "description": "The subscription was stored.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "properties": {
 *               "ok": {
 *                 "type": "boolean"
 *               },
 *               "subscription": {
 *                 "type": "object",
 *                 "properties": {
 *                   "willId": {
 *                     "type": "string"
 *                   },
 *                   "email": {
 *                     "type": "string"
 *                   },
 *                   "owner": {
 *                     "type": "string"
 *                   },
 *                   "confirmed": {
 *                     "type": "boolean"
 *                   },
 *                   "createdAt": {
 *                     "type": "string",
 *                     "format": "date-time"
 *                   },
 *                   "updatedAt": {
 *                     "type": "string",
 *                     "format": "date-time"
 *                   }
 *                 }
 *               }
 *             }
 *           },
 *           "example": {
 *             "ok": true,
 *             "subscription": {
 *               "willId": "42",
 *               "email": "owner@example.com",
 *               "owner": "0x0000000000000000000000000000000000000001",
 *               "confirmed": false,
 *               "createdAt": "2026-01-01T00:00:00.000Z",
 *               "updatedAt": "2026-01-01T00:00:00.000Z"
 *             }
 *           }
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "A field is missing, the email is invalid, or the subscription could not be stored.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Missing required fields"
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The signature does not match the owner.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Unauthorized"
 *           }
 *         }
 *       }
 *     },
 *     "404": {
 *       "description": "The will does not exist.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Will not found"
 *           }
 *         }
 *       }
 *     },
 *     "415": {
 *       "description": "The Content-Type is not application/json.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Unsupported Content-Type; expected application/json"
 *           }
 *         }
 *       }
 *     },
 *     "429": {
 *       "description": "Too many requests from this client. Retry after the number of seconds in the Retry-After header.",
 *       "headers": {
 *         "Retry-After": {
 *           "schema": {
 *             "type": "integer"
 *           },
 *           "description": "Seconds until the next attempt is allowed."
 *         }
 *       },
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Too many requests"
 *           }
 *         }
 *       }
 *     },
 *     "500": {
 *       "description": "Unexpected server error.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Could not register reminder"
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

// Per-IP budget for reminder registration. See `src/lib/rate-limit.ts` for the
// algorithm and its limits.
//
// Threat model: this endpoint is unauthenticated until the signature check
// below, and each accepted request writes a subscription and can trigger an
// outbound email. Without a cap an attacker can:
//   - flood it with junk payloads to burn CPU on `verifyMessage` and RPC
//     quota on the `getWill` lookup (both run before we reject the request);
//   - use it as an email cannon, registering many victim addresses against a
//     will they own so the reminder service mails people who never opted in;
//   - enumerate will IDs by watching for 404 vs. 401 responses.
//
// Why 10 per hour: a legitimate owner registers a reminder once per will,
// and might retry a few times after a typo or wallet-signature rejection.
// 10 leaves plenty of headroom for that (and for several people behind one
// NAT/office IP) while capping an attacker at ~240 attempts/day per IP —
// too slow to enumerate IDs or spam meaningfully. A one-hour window matches
// how rarely the action is needed: a blocked user waits at most an hour, which
// is acceptable for a set-and-forget setting.
const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const EMAIL_MAX_LENGTH = 254;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
  if (email.length > EMAIL_MAX_LENGTH) return false;
  return EMAIL_REGEX.test(email);
}

async function handlePOST(request: Request) {
  const rate = checkRateLimit(`reminders:register:${getClientIp(request)}`, IP_LIMIT, IP_WINDOW_MS);
  if (!rate.allowed) {
    return apiError(ErrorCode.RATE_LIMITED, 'Too many requests', {
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }
  const unsupported = rejectUnsupportedContentType(request);
  if (unsupported) return unsupported;

  try {
    const body = await request.json();
    const willId = typeof body?.willId === 'string' ? body.willId : '';
    const email = typeof body?.email === 'string' ? body.email : '';
    const owner = typeof body?.owner === 'string' ? body.owner : '';
    const signature = typeof body?.signature === 'string' ? body.signature : '';
    const message = typeof body?.message === 'string' ? body.message : '';

    if (!willId || !email || !owner || !signature || !message) {
      return apiError(ErrorCode.VALIDATION_ERROR, 'Missing required fields');
    }

    if (!isValidEmail(email)) {
      return apiError(ErrorCode.VALIDATION_ERROR, 'Invalid email format');
    }

    // Verify the caller controls the connected wallet that owns this will.
    let authorized = false;
    try {
      authorized = await verifyMessage({
        address: owner as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch {
      authorized = false;
    }

    if (!authorized) {
      return apiError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
    }

    // Verify the will actually exists on-chain before storing a subscription.
    try {
      const will = await getSoroWillClient().getWill(willId);
      if (!will) {
        return apiError(ErrorCode.NOT_FOUND, 'Will not found');
      }
    } catch {
      return apiError(ErrorCode.NOT_FOUND, 'Will not found');
    }

    const result = await registerReminderSubscription({ willId, email, owner });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not register reminder';
    return apiError(ErrorCode.INTERNAL_ERROR, message);
  }
}

export const POST = withCorrelationId(handlePOST);
