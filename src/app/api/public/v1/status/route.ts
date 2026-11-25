import { NextResponse } from 'next/server';

import { apiError } from '@/lib/errors';
import { checkWindowRateLimit, getClientIp } from '@/lib/rate-limit';
import { getBearerToken, verifyAccessToken } from '@/lib/oauth';
import { withCorrelationId } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Public API status",
 *   "description": "Health and version information for third-party integrations. Needs an OAuth access token from `/api/oauth/token` in the `Authorization: Bearer` header. Limited to 120 requests per minute per client.",
 *   "tags": [
 *     "Public API"
 *   ],
 *   "security": [
 *     {
 *       "oauth2": []
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The API is up.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "required": [
 *               "ok",
 *               "version",
 *               "serverTime"
 *             ],
 *             "properties": {
 *               "ok": {
 *                 "type": "boolean"
 *               },
 *               "version": {
 *                 "type": "string"
 *               },
 *               "serverTime": {
 *                 "type": "integer",
 *                 "format": "int64",
 *                 "description": "Epoch milliseconds."
 *               }
 *             }
 *           },
 *           "example": {
 *             "ok": true,
 *             "version": "0.1.0",
 *             "serverTime": 1767225600000
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The access token is missing, invalid or expired.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "error": "invalid_token"
 *           }
 *         }
 *       }
 *     },
 *     "429": {
 *       "description": "Too many requests for this client.",
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
 *             "error": "Too many requests"
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

const API_LIMIT = 120;
const API_WINDOW_MS = 60 * 1000; // 1 minute

async function handleGET(request: Request) {
  const token = getBearerToken(request);
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload) {
    return NextResponse.json(
      { error: 'invalid_token' },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' } },
    );
  }

  const rate = checkWindowRateLimit(`public-api:${payload.clientId}`, API_LIMIT, API_WINDOW_MS);
  const headers = {
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(rate.limit),
    'X-RateLimit-Remaining': String(rate.remaining),
  };
  if (!rate.allowed) {
    return apiError('rate_limited', 'Too many requests', {
      headers: { ...headers, 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }

  return NextResponse.json(
    {
      ok: true,
      version: process.env.npm_package_version ?? '0.0.0',
      serverTime: Date.now(),
    },
    { headers },
  );
}

export const GET = withCorrelationId(handleGET);
