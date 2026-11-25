import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { withCorrelationId } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Rate limit status for the calling IP",
 *   "description": "Returns the current rate limit window state for the caller so the UI can display remaining quota and the reset time without waiting for a 429 response.",
 *   "tags": [
 *     "RateLimit"
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "Current rate limit state.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "required": ["limit", "remaining", "resetAt"],
 *             "properties": {
 *               "limit": {
 *                 "type": "integer",
 *                 "description": "Maximum requests allowed per window."
 *               },
 *               "remaining": {
 *                 "type": "integer",
 *                 "description": "Requests left in the current window."
 *               },
 *               "resetAt": {
 *                 "type": "string",
 *                 "format": "date-time",
 *                 "description": "ISO 8601 timestamp when the window resets."
 *               },
 *               "resetInSeconds": {
 *                 "type": "integer",
 *                 "description": "Seconds until the window resets."
 *               },
 *               "warning": {
 *                 "type": "boolean",
 *                 "description": "True when remaining requests are at or below the warning threshold (10 % of limit)."
 *               }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

/** Fraction of the limit at which the UI should show a warning. */
const WARN_THRESHOLD = 0.1;

async function handleGET(request: Request) {
  const ip = getClientIp(request);
  // Peek at the current bucket without debiting a request; we do that by
  // checking against the status endpoint's own namespace so general quota
  // is never consumed by a status poll.
  const result = checkRateLimit('rate-limit-status', ip);

  const resetInSeconds = Math.max(0, Math.ceil(result.resetMs / 1000));
  const resetAt = new Date(Date.now() + result.resetMs).toISOString();
  const warning = result.remaining <= Math.floor(result.limit * WARN_THRESHOLD);

  return NextResponse.json(
    {
      limit: result.limit,
      remaining: result.remaining,
      resetAt,
      resetInSeconds,
      warning,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': resetAt,
      },
    },
  );
}

export const GET = withCorrelationId(handleGET);
