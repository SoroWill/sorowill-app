import { NextResponse } from 'next/server';

import { apiError } from '@/lib/errors';
import { checkWindowRateLimit, getClientIp } from '@/lib/rate-limit';
import { issueAccessToken, verifyClientCredentials } from '@/lib/oauth';
import { withCorrelationId } from '@/lib/correlation';

export const dynamic = 'force-dynamic';

/**
 * @openapi POST
 * {
 *   "summary": "Get an OAuth access token",
 *   "description": "OAuth 2.0 client-credentials grant for third-party integrations. Exchange the client id and secret issued to your integration for a bearer access token, valid for one hour. Send the credentials as HTTP Basic auth or as `client_id`/`client_secret` form fields. Limited to 20 requests per hour per client IP.",
 *   "tags": [
 *     "OAuth"
 *   ],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/x-www-form-urlencoded": {
 *         "schema": {
 *           "type": "object",
 *           "required": [
 *             "grant_type"
 *           ],
 *           "properties": {
 *             "grant_type": {
 *               "type": "string",
 *               "enum": [
 *                 "client_credentials"
 *               ]
 *             },
 *             "client_id": {
 *               "type": "string"
 *             },
 *             "client_secret": {
 *               "type": "string"
 *             }
 *           }
 *         },
 *         "example": {
 *           "grant_type": "client_credentials",
 *           "client_id": "my-integration",
 *           "client_secret": "s3cret"
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": {
 *       "description": "A new access token.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "required": [
 *               "access_token",
 *               "token_type",
 *               "expires_in"
 *             ],
 *             "properties": {
 *               "access_token": {
 *                 "type": "string"
 *               },
 *               "token_type": {
 *                 "type": "string",
 *                 "enum": [
 *                   "Bearer"
 *                 ]
 *               },
 *               "expires_in": {
 *                 "type": "integer",
 *                 "description": "Lifetime in seconds."
 *               }
 *             }
 *           },
 *           "example": {
 *             "access_token": "my-integration.1767229200.9f2c…",
 *             "token_type": "Bearer",
 *             "expires_in": 3600
 *           }
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The grant type is not client_credentials.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "error": "unsupported_grant_type"
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The client id or secret is missing or wrong.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "error": "invalid_client"
 *           }
 *         }
 *       }
 *     },
 *     "429": {
 *       "description": "Too many token requests from this client IP.",
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

const TOKEN_LIMIT = 20;
const TOKEN_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function decodeBasicAuth(header: string | null): { clientId: string; clientSecret: string } | null {
  if (!header) return null;
  const match = /^Basic\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return {
      clientId: decodeURIComponent(decoded.slice(0, separator)),
      clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

async function handlePOST(request: Request) {
  const rate = checkWindowRateLimit(
    `oauth:token:${getClientIp(request)}`,
    TOKEN_LIMIT,
    TOKEN_WINDOW_MS,
  );
  if (!rate.allowed) {
    return apiError('rate_limited', 'Too many requests', {
      headers: { 'Retry-After': String(rate.retryAfterSeconds) },
    });
  }

  const basic = decodeBasicAuth(request.headers.get('authorization'));
  let clientId = basic?.clientId ?? '';
  let clientSecret = basic?.clientSecret ?? '';
  let grantType = 'client_credentials';

  if (!basic) {
    const form = await request.text().catch(() => '');
    const params = new URLSearchParams(form);
    clientId = params.get('client_id') ?? '';
    clientSecret = params.get('client_secret') ?? '';
    grantType = params.get('grant_type') ?? '';
  }

  if (grantType !== 'client_credentials') {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 });
  }

  const client = clientId && clientSecret ? verifyClientCredentials(clientId, clientSecret) : null;
  if (!client) {
    return NextResponse.json(
      { error: 'invalid_client' },
      { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="sorowill"' } },
    );
  }

  const { accessToken, expiresIn } = issueAccessToken(client.id);
  return NextResponse.json(
    { access_token: accessToken, token_type: 'Bearer', expires_in: expiresIn },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const POST = withCorrelationId(handlePOST);
