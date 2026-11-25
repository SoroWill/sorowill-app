/**
 * Correlation IDs for API routes (#824). Every response carries an `X-Correlation-ID` header and
 * each request is logged with the same id, so an error a user reports can be found in the logs.
 */

export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

// A caller (a proxy, or a client following up on an error) may supply its own id. It is only kept
// when it is short and plain, so it cannot be used to inject text into the logs.
const ACCEPTED_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** The id from the request when it has an acceptable one, otherwise a new UUID. */
export function getCorrelationId(request?: Request): string {
  const supplied = request?.headers?.get(CORRELATION_ID_HEADER) ?? undefined;
  return supplied && ACCEPTED_ID.test(supplied) ? supplied : crypto.randomUUID();
}

function withHeader(response: Response, correlationId: string): Response {
  try {
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
    return response;
  } catch {
    // Some responses (for example from fetch) have immutable headers; copy them.
    const headers = new Headers(response.headers);
    headers.set(CORRELATION_ID_HEADER, correlationId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

/**
 * Wraps a route handler: generates (or accepts) a correlation id, logs the request and its
 * outcome with it, adds it to the response headers, and turns an uncaught error into a 500 that
 * also carries the id. The wrapper has the same call signature as the handler.
 */
export function withCorrelationId<Args extends [Request, ...unknown[]]>(
  handler: (...args: Args) => Response | Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const [request] = args;
    const correlationId = getCorrelationId(request);
    const method = request?.method ?? 'GET';
    const path = request?.url ? new URL(request.url).pathname : 'unknown';
    const startedAt = Date.now();

    try {
      const response = await handler(...args);
      console.info(
        `[api] ${method} ${path} -> ${response.status} in ${Date.now() - startedAt}ms correlationId=${correlationId}`,
      );
      return withHeader(response, correlationId);
    } catch (error) {
      console.error(
        `[api] ${method} ${path} -> 500 in ${Date.now() - startedAt}ms correlationId=${correlationId}`,
        error,
      );
      return withHeader(
        Response.json({ ok: false, error: 'Internal server error', correlationId }, { status: 500 }),
        correlationId,
      );
    }
  };
}
