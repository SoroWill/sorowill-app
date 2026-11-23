/**
 * Community links shown in the footer (#820). GitHub is the project's own repository. Twitter and
 * Discord have no fixed address in this repository, so they come from the environment and are
 * left out of the footer until a valid https URL is configured.
 */

export const GITHUB_URL = 'https://github.com/SoroWill/sorowill-app';

export interface SocialLink {
  id: 'github' | 'twitter' | 'discord';
  url: string;
}

/** Returns the URL when it is a well-formed https URL, otherwise null. */
export function parseHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getSocialLinks(
  env: { twitter?: string; discord?: string } = {
    twitter: process.env.NEXT_PUBLIC_TWITTER_URL,
    discord: process.env.NEXT_PUBLIC_DISCORD_URL,
  },
): SocialLink[] {
  const links: SocialLink[] = [{ id: 'github', url: GITHUB_URL }];
  const twitter = parseHttpsUrl(env.twitter);
  if (twitter) links.push({ id: 'twitter', url: twitter });
  const discord = parseHttpsUrl(env.discord);
  if (discord) links.push({ id: 'discord', url: discord });
  return links;
}
