import { NextResponse } from 'next/server';

import { rejectUnsupportedContentType } from '@/lib/contentType';
import { verifyCsrf } from '@/lib/csrf';
import {
  createShareToken,
  getShareAccess,
  openShareToken,
  shareExpiryFromHours,
} from '@/lib/shareLinks';
import { isValidWillId } from '@/lib/willId';

/**
 * @openapi POST
 * {
 *   "summary": "Create a time-limited share link for a will's verify page",
 *   "description": "Returns an encrypted link to the read-only verify page that stops working after `ttlHours` (1 to 720). The link carries no wallet access.",
 *   "tags": ["Share"],
 *   "requestBody": {
 *     "required": true,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "required": ["willId", "ttlHours"],
 *           "properties": {
 *             "willId": { "type": "string" },
 *             "ttlHours": { "type": "integer", "minimum": 1, "maximum": 720 }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "200": { "description": "The share path, its token and expiry" },
 *     "400": { "description": "Invalid will id or lifetime" },
 *     "403": { "description": "Missing or invalid CSRF token" }
 *   }
 * }
 */
export async function POST(request: Request) {
  const unsupported = rejectUnsupportedContentType(request);
  if (unsupported) return unsupported;
  if (!verifyCsrf(request)) {
    return NextResponse.json({ ok: false, error: 'Invalid or missing CSRF token' }, { status: 403 });
  }

  let body: { willId?: unknown; ttlHours?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const willId = typeof body.willId === 'string' ? body.willId : '';
  if (!isValidWillId(willId)) {
    return NextResponse.json({ ok: false, error: 'Invalid will id' }, { status: 400 });
  }
  const expiresAt = shareExpiryFromHours(body.ttlHours);
  if (expiresAt === null) {
    return NextResponse.json({ ok: false, error: 'ttlHours must be a whole number from 1 to 720' }, { status: 400 });
  }

  const { token } = createShareToken(willId, expiresAt);
  return NextResponse.json({
    ok: true,
    path: `/verify/${encodeURIComponent(willId)}?share=${token}`,
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

/**
 * @openapi GET
 * {
 *   "summary": "Access statistics for a share link",
 *   "description": "Returns how many times a share link was opened and its expiry. Counts are kept per server instance.",
 *   "tags": ["Share"],
 *   "parameters": [
 *     { "name": "willId", "in": "query", "required": true, "schema": { "type": "string" } },
 *     { "name": "token", "in": "query", "required": true, "schema": { "type": "string" } }
 *   ],
 *   "responses": {
 *     "200": { "description": "Access count, last access and expiry" },
 *     "400": { "description": "Invalid or tampered token" }
 *   }
 * }
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const willId = params.get('willId') ?? '';
  const token = params.get('token') ?? '';
  // Expired links still report their stats, so check with time zero.
  const opened = openShareToken(token, willId, 0);
  if (!opened.ok) {
    return NextResponse.json({ ok: false, error: 'Invalid share link' }, { status: 400 });
  }
  const access = getShareAccess(opened.linkId);
  return NextResponse.json({
    ok: true,
    accessCount: access.count,
    lastAccessAt: access.lastAccessAt ? new Date(access.lastAccessAt).toISOString() : null,
    expiresAt: new Date(opened.expiresAt).toISOString(),
    expired: Date.now() >= opened.expiresAt,
  });
}
