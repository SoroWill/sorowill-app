import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

import { withCorrelationId, getCorrelationId } from '@/lib/correlation';
import { rejectUnsupportedContentType } from '@/lib/contentType';
import { apiError } from '@/lib/errors';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import {
  appendAudit,
  generateComplianceReport,
  readComplianceStore,
  writeComplianceStore,
  type ComplianceWillInput,
} from '@/lib/compliance';

export const dynamic = 'force-dynamic';

/**
 * @openapi POST
 * {
 *   "summary": "Generate a compliance report",
 *   "description": "Builds a compliance report for the supplied wills, stores it and records the generation in the audit trail. Needs `Authorization: Bearer <COMPLIANCE_SECRET>` and is refused when the secret is not set.",
 *   "tags": [
 *     "Compliance"
 *   ],
 *   "security": [
 *     {
 *       "cronBearer": []
 *     }
 *   ],
 *   "requestBody": {
 *     "required": false,
 *     "content": {
 *       "application/json": {
 *         "schema": {
 *           "type": "object",
 *           "properties": {
 *             "periodStart": {
 *               "type": "string",
 *               "format": "date-time"
 *             },
 *             "periodEnd": {
 *               "type": "string",
 *               "format": "date-time"
 *             },
 *             "wills": {
 *               "type": "array",
 *               "items": {
 *                 "type": "object"
 *               }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   },
 *   "responses": {
 *     "201": {
 *       "description": "The report was generated and stored.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/ComplianceReport"
 *           }
 *         }
 *       }
 *     },
 *     "400": {
 *       "description": "The body is not valid JSON or the period is invalid.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "$ref": "#/components/schemas/Error"
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
 *     "415": {
 *       "description": "The Content-Type is not application/json.",
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

/** Returns an error response when the caller is not authorised, otherwise null. */
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

function parseDate(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string' || !value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function asWills(value: unknown): ComplianceWillInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ComplianceWillInput[] => {
    if (!raw || typeof raw !== 'object') return [];
    const will = raw as Record<string, unknown>;
    if (typeof will.id !== 'string' || !will.id) return [];
    const allocations = Array.isArray(will.allocations)
      ? will.allocations.flatMap((a) => {
          if (!a || typeof a !== 'object') return [];
          const entry = a as Record<string, unknown>;
          return typeof entry.address === 'string' && typeof entry.basisPoints === 'number'
            ? [{ address: entry.address, basisPoints: entry.basisPoints }]
            : [];
        })
      : [];
    return [
      {
        id: will.id,
        owner: typeof will.owner === 'string' ? will.owner : undefined,
        allocations,
        lastCheckin: typeof will.lastCheckin === 'number' ? will.lastCheckin : undefined,
        nextDeadline: typeof will.nextDeadline === 'number' ? will.nextDeadline : undefined,
        guardians: Array.isArray(will.guardians)
          ? will.guardians.filter((g): g is string => typeof g === 'string')
          : [],
        confirmed: will.confirmed === true,
      },
    ];
  });
}

async function handlePOST(request: Request) {
  const rate = checkRateLimit(`compliance:reports:${getClientIp(request)}`);
  if (!rate.allowed) {
    return apiError('rate_limited', 'Too many requests', 429);
  }

  const unauthorized = authorize(request);
  if (unauthorized) return unauthorized;

  const unsupported = rejectUnsupportedContentType(request);
  if (unsupported) return unsupported;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return apiError('validation', 'Invalid request body.', 400);
  }

  const now = new Date();
  const periodEnd = parseDate(body.periodEnd, now);
  const periodStart = parseDate(body.periodStart, new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000));
  if (periodStart > periodEnd) {
    return apiError('validation', 'periodStart must not be after periodEnd.', 400);
  }

  const report = generateComplianceReport(asWills(body.wills), { periodStart, periodEnd, now });

  try {
    const store = await readComplianceStore();
    store.reports[report.id] = report;
    appendAudit(store, {
      action: 'report.generated',
      reportId: report.id,
      actor: 'compliance-api',
      correlationId: getCorrelationId(request),
    });
    await writeComplianceStore(store);
  } catch {
    return apiError('server_error', 'Could not store the compliance report.', 500);
  }

  return NextResponse.json(report, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export const POST = withCorrelationId(handlePOST);
