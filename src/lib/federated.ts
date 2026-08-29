const STELLAR_TOML_CACHE_TTL_MS = 5 * 60 * 1000;
const STELLAR_TOML_CACHE = new Map<string, { toml: string; expiresAt: number }>();
const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

export async function resolveFederatedAddress(address: string): Promise<string> {
  if (!address.includes('*')) {
    return address;
  }

  const [name, domain] = address.split('*');

  try {
    const cached = STELLAR_TOML_CACHE.get(domain);
    let stellarToml = cached && cached.expiresAt > Date.now() ? cached.toml : undefined;

    if (!stellarToml) {
      const tomlResponse = await fetch(`https://${domain}/.well-known/stellar.toml`);
      if (!tomlResponse.ok) {
        throw new Error(`Failed to fetch stellar.toml from ${domain}`);
      }
      stellarToml = await tomlResponse.text();
      STELLAR_TOML_CACHE.set(domain, {
        toml: stellarToml,
        expiresAt: Date.now() + STELLAR_TOML_CACHE_TTL_MS,
      });
    }

    const federationServerLine = stellarToml
      .split('\n')
      .find((line) => line.startsWith('FEDERATION_SERVER'));

    if (!federationServerLine) {
      throw new Error(`No FEDERATION_SERVER found in ${domain}/.well-known/stellar.toml`);
    }

    const federationUrl = federationServerLine.split('=')[1]?.trim().replace(/["']/g, '');

    if (!federationUrl) {
      throw new Error('Invalid FEDERATION_SERVER URL');
    }

    const params = new URLSearchParams({
      q: `${name}*${domain}`,
      type: 'name',
    });

    const response = await fetch(`${federationUrl}?${params}`);

    if (!response.ok) {
      throw new Error(`Federation server returned status ${response.status}`);
    }

    const data = (await response.json()) as { account_id?: string };

    if (!data.account_id) {
      throw new Error('No account_id in federation response');
    }

    if (!STELLAR_PUBLIC_KEY_REGEX.test(data.account_id)) {
      throw new Error('Federation server returned a malformed account_id');
    }

    return data.account_id;
  } catch (error) {
    throw new Error(
      `Failed to resolve federated address "${address}": ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

export function isFederatedAddress(address: string): boolean {
  return address.includes('*');
}
