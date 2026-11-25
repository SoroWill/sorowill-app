import { NextResponse } from 'next/server';

import { withCorrelationId } from '@/lib/correlation';
import { apiError, isWillNotFoundError } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { getNetwork, getSoroWillClient } from '@/lib/sorowill';
import { isValidWillId } from '@/lib/willId';
import { buildWillSnapshot, validateSnapshotTimestamp } from '@/lib/willSnapshot';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Will state snapshot at a timestamp",
 *   "description": "Returns the full on-chain record of a will together with the state derived from it (check-in deadline, grace window, claim availability) evaluated at the requested instant. The timestamp must not be in the future nor predate the will's creation. Limited to 60 requests per minute per client IP.",
 *   "tags": [
 *     "Wills"
 *   ],
 *   "parameters": [
 *     {
 *       "name": "id",
 *       "in": "path",
 *       "required": true,
 *       "schema": {
 *         "type": "string"
 *       },
 *       "description": "Numeric will id."
 *     },
 *     {
 *       "name": "timestamp",
 *       "in": "query",
 *       "required": true,
 *       "schema": {
 *         "type": "integer",
 *         "format": "int64"
 *       },
 *       "description": "Instant to evaluate the snapshot at, in epoch milliseconds (epoch seconds are also accepted)."
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The will snapshot.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "required": [
 *               "willId",
 *               "timestamp",
 *               "timestampIso",
 *               "generatedAt",
 *               "network",
 *               "will",
 *               "state"
 *             ],
 *             "properties": {
 *               "willId": {
 *                 "type": "string"
 *               },
 *               "timestamp": {
 *                 "type": "integer",
 *                 "format": "int64"
 *               },
 *               "timestampIso": {
 *                 "type": "string",
 *                 "format": "date-time"
 *               },
 *               "generatedAt": {
 *                 "type": "integer",
 *                 "format": "int64"
 *               },
 *               "network": {
 *                 "type": "string"
 *               },
 *               "will": {
 *                 "type": "object",
 *                 "description": "The full on-chain will record."
 *               },
 *               "state": {
 *                 "type": "object",
 *                 "description": "State derived at the requested timestamp."
 *               }
 *             }
 *           }
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The will id or timestamp is invalid.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           }
 *         }
 *       }
 *     },
 *     "404": {
 *       "description": "The will was not found on-chain.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           }
 *         }
 *       }
 *     },
 *     "429": {
 *       "description": "Too many requests.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
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
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

/**
 * GET /api/wills/:id/snapshot?timestamp=...
 *
 * Returns the will's state snapshot at `timestamp` (#901). Error responses
 * follow the standardized schema: { error: { code, message } }.
 */
async function handleGET(request: Request, context: { params: Promise<{ id: string }> }) {
  const rate = checkRateLimit('wills/snapshot', getClientIp(request));
  if (!rate.allowed) {
    return apiError('rate_limited', 'Too many requests');
  }

  const { id } = await context.params;
  if (!isValidWillId(id)) {
    return apiError('validation', 'Invalid will id.');
  }

  const rawTimestamp = new URL(request.url).searchParams.get('timestamp');
  const preliminary = validateSnapshotTimestamp(rawTimestamp);
  if (!preliminary.ok) {
    return apiError('validation', preliminary.message);
  }

  try {
    const will = await getSoroWillClient().getWill(id);
    if (!will) {
      return apiError('not_found', 'Will not found');
    }

    const createdAt = parseCreatedAt((will as { createdAt?: unknown }).createdAt);
    const timestamp = validateSnapshotTimestamp(rawTimestamp, { createdAt });
    if (!timestamp.ok) {
      return apiError('validation', timestamp.message);
    }

    const snapshot = buildWillSnapshot(will, timestamp.timestamp, { network: getNetwork() });
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (isWillNotFoundError(error)) {
      return apiError('not_found', 'Will not found');
    }
    return apiError('server_error', 'Failed to build will snapshot');
  }
}

export const GET = withCorrelationId(handleGET);
