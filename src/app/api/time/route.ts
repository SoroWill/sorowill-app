import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * @openapi GET
 * {
 *   "summary": "Server time",
 *   "description": "Returns the server's current time in epoch milliseconds so clients can correct deadline maths for a skewed local clock. Never cached.",
 *   "tags": [
 *     "Time"
 *   ],
 *   "responses": {
 *     "200": {
 *       "description": "The current server time.",
 *       "content": {
 *         "application/json": {
 *           "schema": {
 *             "type": "object",
 *             "required": [
 *               "now"
 *             ],
 *             "properties": {
 *               "now": {
 *                 "type": "integer",
 *                 "format": "int64",
 *                 "description": "Epoch milliseconds."
 *               }
 *             }
 *           },
 *           "example": {
 *             "now": 1767225600000
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */

/**
 * GET /api/time
 *
 * Returns the server's current time in epoch milliseconds so clients can
 * correct deadline math for local clock skew (#751).
 */
export function GET() {
  return NextResponse.json({ now: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
