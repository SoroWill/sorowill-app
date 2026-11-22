import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { dispatchDueReminders } from '@/lib/reminders/dispatch';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Send due reminders (GET)",
 *   "description": "Sends the reminder emails that are due. Meant for a scheduled job. Needs `Authorization: Bearer <CRON_SECRET>` and is refused when CRON_SECRET is not set. Unlike POST, GET answers 500 instead of 401 when CRON_SECRET is not set.",
 *   "tags": [
 *     "Reminders"
 *   ],
 *   "security": [
 *     {
 *       "cronBearer": []
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The reminder run finished.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "properties": {
 *               "sent": {
 *                 "type": "integer"
 *               },
 *               "skipped": {
 *                 "type": "integer"
 *               },
 *               "errors": {
 *                 "type": "array",
 *                 "items": {
 *                   "type": "string"
 *                 }
 *               }
 *             }
 *           },
 *           "example": {
 *             "sent": 3,
 *             "skipped": 1,
 *             "errors": []
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The bearer token is missing or wrong.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "error": "Unauthorized"
 *           }
 *         }
 *       }
 *     },
 *     "500": {
 *       "description": "CRON_SECRET is not set on the server.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "properties": {
 *               "sent": {
 *                 "type": "integer"
 *               },
 *               "skipped": {
 *                 "type": "integer"
 *               },
 *               "errors": {
 *                 "type": "array",
 *                 "items": {
 *                   "type": "string"
 *                 }
 *               }
 *             }
 *           },
 *           "example": {
 *             "sent": 0,
 *             "skipped": 0,
 *             "errors": [
 *               "Server misconfigured: CRON_SECRET is not set"
 *             ]
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

/**
 * @openapi POST
 * {
 *   "summary": "Send due reminders (POST)",
 *   "description": "Sends the reminder emails that are due. Meant for a scheduled job. Needs `Authorization: Bearer <CRON_SECRET>` and is refused when CRON_SECRET is not set.",
 *   "tags": [
 *     "Reminders"
 *   ],
 *   "security": [
 *     {
 *       "cronBearer": []
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The reminder run finished.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "properties": {
 *               "sent": {
 *                 "type": "integer"
 *               },
 *               "skipped": {
 *                 "type": "integer"
 *               },
 *               "errors": {
 *                 "type": "array",
 *                 "items": {
 *                   "type": "string"
 *                 }
 *               }
 *             }
 *           },
 *           "example": {
 *             "sent": 3,
 *             "skipped": 1,
 *             "errors": []
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The bearer token is missing or wrong, or CRON_SECRET is not set.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "error": "Unauthorized"
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

/**
 * Minimum recommended length for CRON_SECRET.
 *
 * A short secret has low entropy, so even a timing-safe comparison offers
 * little protection against brute-force guessing. 32 characters of random
 * data provides ~192 bits of entropy when drawn from a 62-char alphabet.
 */
const MIN_CRON_SECRET_LENGTH = 32;

/**
 * Warn (once per invocation) when the configured secret is too short.
 * Weak secrets undermine the timing-safe comparison below.
 */
function warnIfSecretTooShort(secret: string): void {
  if (secret.length < MIN_CRON_SECRET_LENGTH) {
    console.warn(
      `[reminders/dispatch] CRON_SECRET is only ${secret.length} characters long; ` +
        `a weak secret undermines the timing-safe comparison. ` +
        `Use at least ${MIN_CRON_SECRET_LENGTH} random characters (e.g. \`openssl rand -hex 32\`).`,
    );
  }
}

/**
 * Constant-time comparison of two strings.
 *
 * V8's `===`/`!==` short-circuits on the first mismatched byte, which leaks
 * how many leading characters of a guessed secret are correct. We hash both
 * sides to a fixed-length digest first so that inputs of differing lengths
 * can still be compared with `crypto.timingSafeEqual` without throwing.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

async function handleDispatch(request: Request) {
  const expectedToken = process.env.CRON_SECRET;

  // Fail closed: if CRON_SECRET is not configured, reject the request rather
  // than skipping the auth check and exposing the endpoint publicly.
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  warnIfSecretTooShort(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  const expectedToken = process.env.CRON_SECRET;

  // Fail closed: if CRON_SECRET is not configured, reject the request rather
  // than skipping the auth check and exposing the endpoint publicly.
  if (!expectedToken) {
    return NextResponse.json(
      { sent: 0, skipped: 0, errors: ['Server misconfigured: CRON_SECRET is not set'] },
      { status: 500 },
    );
  }

  warnIfSecretTooShort(expectedToken);

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expectedToken}`;

  if (!constantTimeEqual(authHeader, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await dispatchDueReminders();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return handleDispatch(request);
}
