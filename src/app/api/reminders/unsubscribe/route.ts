import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { apiError } from '@/lib/errors';
import { escapeHtml, unsubscribeReminderSubscription } from '@/lib/reminders';
import { withCorrelationId } from '@/lib/correlation';

/**
 * @openapi GET
 * {
 *   "summary": "Unsubscribe from reminders (link)",
 *   "description": "Answers with a small HTML page. The token comes from the unsubscribe link in a reminder email.",
 *   "tags": [
 *     "Reminders"
 *   ],
 *   "parameters": [
 *     {
 *       "name": "token",
 *       "in": "query",
 *       "required": true,
 *       "schema": {
 *         "type": "string"
 *       },
 *       "description": "The token from the email link."
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The subscription is removed.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>You have been unsubscribed from check-in reminder emails for this will.</p>"
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The token is missing or not valid.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>A valid unsubscribe token is required.</p>"
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
 *             "error": "Could not process unsubscribe request."
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
 *   "summary": "Unsubscribe from reminders (one click)",
 *   "description": "Answers with a small HTML page. The token comes from the unsubscribe link in a reminder email. The form encoding is accepted for one-click unsubscribe from mail clients (RFC 8058). The token may also be sent as a query parameter.",
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
 *             "token"
 *           ],
 *           "properties": {
 *             "token": {
 *               "type": "string"
 *             }
 *           }
 *         },
 *         "example": {
 *           "token": "3f0c1a52b7c04e8f9a1d"
 *         }
 *       },
 *       "application/x-www-form-urlencoded": {
 *         "schema": {
 *           "type": "object",
 *           "required": [
 *             "token"
 *           ],
 *           "properties": {
 *             "token": {
 *               "type": "string"
 *             }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": {
 *       "description": "The subscription is removed.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>You have been unsubscribed from check-in reminder emails for this will.</p>"
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The token is missing or not valid.",
 *       "content": {
 *         "text/html": {
 *           "schema": {
 *             "type": "string"
 *           },
 *           "example": "<p>A valid unsubscribe token is required.</p>"
 *         }
 *       }
 *     },
 *     "415": {
 *       "description": "The Content-Type is neither JSON nor form encoded.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           },
 *           "example": {
 *             "ok": false,
 *             "error": "Unsupported Content-Type; expected application/json or application/x-www-form-urlencoded"
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
 *             "error": "Could not process unsubscribe request."
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

async function handleUnsubscribe(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get('token') || undefined;

  if (request.method === 'POST') {
    try {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await request.json();
        if (body.token) token = body.token;
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = await request.formData();
        if (formData.get('token')) token = String(formData.get('token'));
      }
    } catch {
      // Fall back to query parameters if body parsing fails
    }
  }

  if (!token) {
    if (request.method === 'POST') {
      return apiError('INVALID_TOKEN', 'A valid unsubscribe token is required.', 400);
    }

    return new NextResponse(
      `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>A valid unsubscribe token is required.</p></body></html>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }

  try {
    const result = await unsubscribeReminderSubscription({ token });
    const message = result.ok
      ? 'You have been unsubscribed from check-in reminder emails for this will.'
      : result.error || 'Could not process unsubscribe request.';

    return new NextResponse(
      `<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><p>${escapeHtml(message)}</p></body></html>`,
      {
        status: result.ok ? 200 : 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not process unsubscribe request.';
    return apiError('INTERNAL_ERROR', message, 500);
  }
}

async function handleGET(request: Request) {
  return handleUnsubscribe(request);
}

async function handlePOST(request: Request) {
  // Form encoding stays allowed for RFC 8058 one-click unsubscribe from mail clients.
  const unsupported = rejectUnsupportedContentType(request, [
    'application/json',
    'application/x-www-form-urlencoded',
  ]);
  if (unsupported) return unsupported;

  return handleUnsubscribe(request);
}

export const GET = withCorrelationId(handleGET);
export const POST = withCorrelationId(handlePOST);
