import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

import { withCorrelationId, getCorrelationId } from '@/lib/correlation';
import { apiError } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  appendAudit,
  readComplianceStore,
  reportToCsv,
  writeComplianceStore,
} from '@/lib/compliance';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Download a compliance report",
 *   "description": "Returns a stored compliance report as JSON, or as CSV when `?format=csv`. The download is recorded in the audit trail. Needs `Authorization: Bearer <COMPLIANCE_SECRET>`.",
 *   "tags": [
 *     "Compliance"
 *   ],
 *   "security": [
 *     {
 *       "cronBearer": []
 *     }
 *   ],
 *   "parameters": [
 *     {
 *       "name": "id",
 *       "in": "path",
 *       "required": true,
 *       "schema": {
 *         "type": "string"
 *       }
 *     },
 *     {
 *       "name": "format",
 *       "in": "query",
 *       "required": false,
 *       "schema": {
 *         "type": "string",
 *         "enum": [
 *           "json",
 *           "csv"
 *         ]
 *       }
 *     }
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The report.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/ComplianceReport"
 *           }
 *         },
 *         "text/csv": {
 *           "schema": {
 *             "type": "string"
 *           }
 *         }
 *       }
 *     },
 *     "401": {
 *       "description": "The bearer token is missing or wrong, or COMPLIANCE_SECRET is not set.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           }
 *         }
 *       }
 *     },
 *     "404": {
 *       "description": "No report with that id.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
 *           }
 *         }
 *       }
 *     },
 *     "429": {
 *       "description": "Too many requests from this client.",
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

const MIN_SECRET_LENGTH = 32;

function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}

function authorize(request: Request): NextResponse | null {
  const expected = process.env.COMPLIANCE_SECRET;
  if (!expected) return apiError('unauthorized', 'Unauthorized', 401);
  if (expected.length < MIN_SECRET_LENGTH) {
    console.warn(
      `[compliance] COMPLIANCE_SECRET is only ${expected.length} characters long; use at least ${MIN_SECRET_LENGTH}.`,
    );
  }
  const header = request.headers.get('authorization') ?? '';
  return constantTimeEqual(header, `Bearer ${expected}`)
    ? null
    : apiError('unauthorized', 'Unauthorized', 401);
}

async function handleGET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rate = checkRateLimit(`compliance:download:${getClientIp(request)}`);
  if (!rate.allowed) {
    return apiError('rate_limited', 'Too many requests', 429);
  }

  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json';

  let store;
  try {
    store = await readComplianceStore();
  } catch {
    return apiError('server_error', 'Could not read the compliance report.', 500);
  }

  const report = store.reports[id];
  if (!report) return apiError('not_found', 'Compliance report not found.', 404);

  try {
    appendAudit(store, {
      action: 'report.downloaded',
      reportId: report.id,
      actor: 'compliance-api',
      correlationId: getCorrelationId(request),
    });
    await writeComplianceStore(store);
  } catch {
    return apiError('server_error', 'Could not record the report download.', 500);
  }

  if (format === 'csv') {
    return new NextResponse(reportToCsv(report), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="compliance-${report.id}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(report, {
    headers: {
      'Content-Disposition': `attachment; filename="compliance-${report.id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = withCorrelationId(handleGET);
