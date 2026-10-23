const STELLAR_TOML_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * In-memory cache of fetched stellar.toml contents, keyed by domain.
 * Each entry includes the TOML content and an expiry timestamp.
 * Cache TTL is 5 minutes per domain.
 *
 * @see {@link resolveFederatedAddress} - This cache is used to avoid
 * repeatedly fetching the same stellar.toml file during the process lifetime.
 */
const STELLAR_TOML_CACHE = new Map<string, { toml: string; expiresAt: number }>();
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * The trusted federation resolver domain.
 *
 * Trust model: this domain is the single source of truth for the host that
 * federation lookups are performed against. All stellar.toml fetches and
 * federation server queries are scoped to this domain, so it must never be
 * hardcoded inline elsewhere — changing it here is the only supported way to
 * point the app at a different resolver. Keeping it as one exported constant
 * ensures a domain change cannot silently route lookups to the wrong resolver.
 *
 * (#679)
 */
export const FEDERATION_DOMAIN = 'stellar.org';

/**
 * Strict hostname validator for the domain portion of a federated address.
 *
 * Rejects anything that contains characters that could alter the URL target:
 *   - `@`  — would introduce userinfo credentials
 *   - `/`  — would add a path component
 *   - `?`  — would add a query string
 *   - `#`  — would add a fragment
 *   - ` `  — whitespace is never valid in a hostname
 *
 * Accepts labels (a-z, A-Z, 0-9, `-`) separated by dots, optionally with a
 * port suffix (`hostname:port`). The port, if present, must be all digits.
 *
 * This deliberately does not follow the full IDNA/Punycode spec — federation
 * addresses in practice use plain ASCII hostnames.
 *
 * (#339)
 */
const STRICT_HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*(?::\d+)?$/;

/**
 * Result of validating a federated or public-key address for form feedback.
 */
export type AddressValidationResult =
  | { valid: true; kind: 'public-key' | 'federated' }
  | { valid: false; reason: string };

/**
 * Validates an address for UI feedback without performing any network calls.
 *
 * - Public keys must match the Stellar G-address format (56 chars, base32).
 * - Federated addresses must have exactly one `*`, a non-empty name, and a
 *   strictly-validated hostname on the right (#339).
 *
 * @param address - The raw user-entered address.
 * @returns A validation result describing whether the address is usable and why not.
 */
export function validateStellarAddress(address: string): AddressValidationResult {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, reason: 'Address is required' };
  }

  if (!isFederatedAddress(trimmed)) {
    if (STELLAR_PUBLIC_KEY_REGEX.test(trimmed)) {
      return { valid: true, kind: 'public-key' };
    }
    return {
      valid: false,
      reason: 'Enter a Stellar public key (starts with G, 56 characters) or a federated address (name*domain)',
    };
  }

  const starCount = (trimmed.match(/\*/g) ?? []).length;
  if (starCount !== 1) {
    return { valid: false, reason: 'Federated address must contain exactly one "*"' };
  }

  const starIndex = trimmed.indexOf('*');
  const name = trimmed.slice(0, starIndex);
  const domain = trimmed.slice(starIndex + 1);

  if (!name) {
    return { valid: false, reason: 'Name before "*" must not be empty' };
  }

  if (!domain) {
    return { valid: false, reason: 'Domain after "*" must not be empty' };
  }

  if (!STRICT_HOSTNAME_REGEX.test(domain)) {
    return { valid: false, reason: `"${domain}" is not a valid domain` };
  }

  return { valid: true, kind: 'federated' };
}

/**
 * Resolves a Stellar federated address (e.g., "user*example.com") to a Stellar account ID.
 *
 * For non-federated addresses (those not containing a `*`), returns the input unchanged.
 *
 * For federated addresses:
 * 1. Validates that the address has exactly one `*` with a non-empty name on the left
 *    and a strictly-validated hostname (no `@`, `/`, `?`, `#`, or whitespace) on the right (#339)
 * 2. Fetches the stellar.toml file from the specified domain's `.well-known/` directory
 * 3. Extracts the FEDERATION_SERVER URL from the TOML using exact-key matching that
 *    handles surrounding whitespace and preserves `=` characters inside the value (#340)
 * 4. Rejects non-`https` federation server URLs (#340)
 * 5. Queries the federation server with the federated address to obtain the account ID
 *
 * **Caching Behavior:**
 * - stellar.toml files are cached per-domain for 5 minutes to avoid repeated network requests
 * - Repeated calls for the same domain within the cache window will reuse the cached TOML
 * - Cache entries are stored for the duration of the process and automatically expire after 5 minutes
 *
 * @param address - A Stellar address, either a public key (e.g., "GXXXXXX...") or
 *                  a federated address (e.g., "username*example.com")
 * @returns The Stellar account ID (public key) if the address is federated, or the input unchanged if it's already a public key
 * @throws {Error} If the address is federated but:
 *   - The address does not have exactly one `*` (#339)
 *   - The name or domain portion is empty (#339)
 *   - The domain fails strict hostname validation (contains `@`, `/`, `?`, `#`, or whitespace) (#339)
 *   - The stellar.toml file cannot be fetched from the domain
 *   - The FEDERATION_SERVER entry is missing from the TOML (#340)
 *   - The FEDERATION_SERVER URL is not https (#340)
 *   - The federation server cannot resolve the federated address
 *   - The federation server returns a malformed account ID
 *
 * @example
 * // Federated address - will fetch and resolve
 * const accountId = await resolveFederatedAddress("user*example.com");
 * // Returns: "GXXXXXX..." (the resolved account ID)
 *
 * @example
 * // Regular public key - returned unchanged
 * const accountId = await resolveFederatedAddress("GXXXXXX...");
 * // Returns: "GXXXXXX..." (same as input)
 */
export function isFederatedAddress(address: string): boolean {
  return address.includes('*');
}

export async function resolveFederatedAddress(address: string): Promise<string> {
  if (!isFederatedAddress(address)) {
    return address;
  }

  // #339 — Validate that the address contains exactly one `*` and that both
  // the name and domain portions are non-empty.
  const starCount = (address.match(/\*/g) ?? []).length;
  if (starCount !== 1) {
    throw new Error(
      `Invalid federated address "${address}": must contain exactly one "*" separator`,
    );
  }

  const starIndex = address.indexOf('*');
  const name = address.slice(0, starIndex);
  const domain = address.slice(starIndex + 1);

  if (!name) {
    throw new Error(
      `Invalid federated address "${address}": the name portion before "*" must not be empty`,
    );
  }

  if (!domain) {
    throw new Error(
      `Invalid federated address "${address}": the domain portion after "*" must not be empty`,
    );
  }

  // #339 — Reject domains that contain characters which would alter the
  // constructed stellar.toml URL target (userinfo, path, query, fragment).
  if (!STRICT_HOSTNAME_REGEX.test(domain)) {
    throw new Error(
      `Invalid federated address "${address}": domain "${domain}" is not a valid hostname` +
        ' (must not contain "@", "/", "?", "#", or whitespace)',
    );
  }

  try {
    const cached = STELLAR_TOML_CACHE.get(domain);
    let stellarToml = cached && cached.expiresAt > Date.now() ? cached.toml : undefined;

    if (!stellarToml) {
      const tomlResponse = await fetch(`https://${FEDERATION_DOMAIN}/.well-known/stellar.toml`);
      if (!tomlResponse.ok) {
        throw new Error(`Failed to fetch stellar.toml from ${FEDERATION_DOMAIN}`);
      }
      stellarToml = await tomlResponse.text();
      STELLAR_TOML_CACHE.set(domain, {
        toml: stellarToml,
        expiresAt: Date.now() + STELLAR_TOML_CACHE_TTL_MS,
      });
    }

    // #340 — Match the exact key `FEDERATION_SERVER` (trimmed, to tolerate
    // leading whitespace in the TOML file) and read *everything after the
    // first `=`* so that URLs containing `=` (e.g. query strings) are
    // preserved intact.  Only surrounding quotes are stripped — internal
    // quotes inside the value are untouched.
    const federationServerLine = stellarToml
      .split('\n')
      .find((line) => line.trimStart().startsWith('FEDERATION_SERVER') &&
        // Require the key to be exactly `FEDERATION_SERVER` followed by
        // optional whitespace and `=`, preventing `FEDERATION_SERVER_URL`
        // or similar prefixes from matching.
        /^\s*FEDERATION_SERVER\s*=/.test(line));

    if (!federationServerLine) {
      throw new Error(`No FEDERATION_SERVER found in ${FEDERATION_DOMAIN}/.well-known/stellar.toml`);
    }

    // Take everything after the first `=` so embedded `=` characters in
    // the URL (e.g. base64 query params) are preserved.
    const rawFederationUrl = federationServerLine.slice(federationServerLine.indexOf('=') + 1).trim();

    // Strip only leading/trailing quotes — do not use a global replace that
    // would also remove quotes inside the value.
    const federationUrl = rawFederationUrl.replace(/^["']|["']$/g, '');

    if (!federationUrl) {
      throw new Error('Invalid FEDERATION_SERVER URL');
    }

    // #340 — Reject non-https federation URLs to prevent MITM attacks and
    // to align with the Stellar federation specification which mandates TLS.
    if (!federationUrl.startsWith('https://')) {
      throw new Error(
        `FEDERATION_SERVER URL must use HTTPS, got: "${federationUrl}"`,
      );
    }

    const params = new URLSearchParams({
      q: `${name}*${FEDERATION_DOMAIN}`,
      type: 'name',
    });

    const response = await fetch(`${federationUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`Federation server returned status ${response.status}`);
    }

    // #666 — Parse the JSON defensively: a non-JSON body (e.g. HTML error
    // page) must be rejected rather than surfacing an opaque parse error.
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('Federation server returned a malformed federation response (invalid JSON)');
    }

    // #666 — The payload must be a non-null, non-array object.
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('Federation server returned a malformed federation response (expected an object)');
    }

    const accountId = (data as Record<string, unknown>).account_id;

    if (accountId === undefined || accountId === null) {
      throw new Error('No account_id in federation response');
    }

    if (typeof accountId !== 'string') {
      throw new Error('Federation server returned a malformed account_id (expected a string)');
    }

    if (!STELLAR_PUBLIC_KEY_REGEX.test(accountId)) {
      throw new Error('Federation server returned a malformed account_id');
    }

    return accountId;
  } catch (error) {
    throw new Error(
      `Failed to resolve federated address "${address}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
