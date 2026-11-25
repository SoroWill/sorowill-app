import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * OAuth 2.0 client-credentials support for the public integration API (#905).
 *
 * Third-party integrations are confidential clients: they are issued a client
 * id and secret out of band (environment configuration, see `docs/API.md`) and
 * exchange them at `/api/oauth/token` for a short-lived bearer access token.
 * Access tokens are stateless — a signed `clientId.expiry` payload — so any
 * instance can verify one without shared storage.
 *
 * Configuration:
 *   OAUTH_CLIENTS — comma-separated `clientId:clientSecret` pairs.
 *   OAUTH_TOKEN_SECRET — HMAC key for access tokens. When unset, a random key
 *     is generated per process (tokens then do not survive a restart).
 */

export const OAUTH_TOKEN_TTL_SECONDS = 60 * 60;

export interface OAuthClient {
  id: string;
  secret: string;
}

export interface AccessTokenPayload {
  clientId: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

function tokenSecret(): string {
  return process.env.OAUTH_TOKEN_SECRET || fallbackSecret;
}

const fallbackSecret = randomBytes(32).toString('hex');

/** The configured clients, parsed from `OAUTH_CLIENTS`. */
export function getOAuthClients(): OAuthClient[] {
  const raw = process.env.OAUTH_CLIENTS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      if (separator === -1) return null;
      const id = entry.slice(0, separator).trim();
      const secret = entry.slice(separator + 1).trim();
      return id && secret ? { id, secret } : null;
    })
    .filter((client): client is OAuthClient => client !== null);
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** The client matching these credentials, or `null` when they are wrong. */
export function verifyClientCredentials(clientId: string, clientSecret: string): OAuthClient | null {
  const client = getOAuthClients().find((candidate) => candidate.id === clientId);
  if (!client) return null;
  return safeEqual(client.secret, clientSecret) ? client : null;
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload).digest('hex');
}

/** Issues a bearer access token for a client. */
export function issueAccessToken(clientId: string, now: number = Date.now()): {
  accessToken: string;
  expiresIn: number;
} {
  const exp = Math.floor(now / 1000) + OAUTH_TOKEN_TTL_SECONDS;
  const payload = `${clientId}.${exp}`;
  return { accessToken: `${payload}.${sign(payload)}`, expiresIn: OAUTH_TOKEN_TTL_SECONDS };
}

/** Verifies a bearer access token, returning its payload or `null`. */
export function verifyAccessToken(token: string, now: number = Date.now()): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [clientId, expRaw, signature] = parts;
  if (!clientId || !/^\d+$/.test(expRaw)) return null;
  if (!safeEqual(sign(`${clientId}.${expRaw}`), signature)) return null;

  const exp = Number(expRaw);
  if (exp * 1000 <= now) return null;
  return { clientId, exp };
}

/** The bearer token from an `Authorization` header, if it is well formed. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
