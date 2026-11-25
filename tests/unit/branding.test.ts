import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BRANDING,
  isValidHostname,
  normalizeHost,
  parseBranding,
  parseDomainList,
  resolveCanonicalRedirect,
} from '@/lib/branding';

describe('branding configuration (#880)', () => {
  it('falls back to the SoroWill defaults when nothing is configured', () => {
    expect(parseBranding({})).toEqual(DEFAULT_BRANDING);
  });

  it('reads a white-label brand from environment variables', () => {
    const branding = parseBranding({
      NEXT_PUBLIC_BRAND_NAME: 'Acme Inheritance',
      NEXT_PUBLIC_BRAND_TAGLINE: 'Estate planning for everyone',
      NEXT_PUBLIC_BRAND_LOGO_URL: 'https://cdn.example.com/logo.png',
      NEXT_PUBLIC_SITE_URL: 'https://wills.acme.com/',
      NEXT_PUBLIC_BRAND_PRIMARY_COLOR: '#4f46e5',
    });

    expect(branding).toEqual({
      name: 'Acme Inheritance',
      tagline: 'Estate planning for everyone',
      logoUrl: 'https://cdn.example.com/logo.png',
      siteUrl: 'https://wills.acme.com',
      primaryColor: '#4f46e5',
    });
  });

  it('ignores invalid values instead of breaking the build', () => {
    const branding = parseBranding({
      NEXT_PUBLIC_SITE_URL: 'not a url',
      NEXT_PUBLIC_BRAND_LOGO_URL: 'javascript:alert(1)',
      NEXT_PUBLIC_BRAND_PRIMARY_COLOR: 'red; background:url(x)',
      NEXT_PUBLIC_BRAND_NAME: '   ',
    });

    expect(branding.siteUrl).toBe(DEFAULT_BRANDING.siteUrl);
    expect(branding.logoUrl).toBe(DEFAULT_BRANDING.logoUrl);
    expect(branding.primaryColor).toBeUndefined();
    expect(branding.name).toBe(DEFAULT_BRANDING.name);
  });

  it('accepts a relative logo path to keep working on any domain', () => {
    expect(parseBranding({ NEXT_PUBLIC_BRAND_LOGO_URL: '/brand/logo.svg' }).logoUrl).toBe(
      '/brand/logo.svg',
    );
  });
});

describe('domain parsing', () => {
  it('validates hostnames', () => {
    expect(isValidHostname('wills.acme.com')).toBe(true);
    expect(isValidHostname('localhost')).toBe(true);
    expect(isValidHostname('https://acme.com')).toBe(false);
    expect(isValidHostname('acme')).toBe(false);
    expect(isValidHostname('acme.com/path')).toBe(false);
    expect(isValidHostname('')).toBe(false);
  });

  it('normalises hosts by lowercasing and removing ports', () => {
    expect(normalizeHost('Wills.ACME.com:3000')).toBe('wills.acme.com');
    expect(normalizeHost('[::1]:3000')).toBe('[::1]');
    expect(normalizeHost(null)).toBe('');
  });

  it('parses a mixed list and drops invalid entries', () => {
    expect(parseDomainList('wills.acme.com, sorowill.vercel.app  bad_host')).toEqual([
      'wills.acme.com',
      'sorowill.vercel.app',
    ]);
    expect(parseDomainList(undefined)).toEqual([]);
  });
});

describe('canonical domain redirect', () => {
  const aliases = ['sorowill.vercel.app', 'www.wills.acme.com'];

  it('does nothing when no canonical host is configured', () => {
    const result = resolveCanonicalRedirect(new URL('https://sorowill.vercel.app/dashboard'), '', aliases);
    expect(result.redirect).toBe(false);
  });

  it('does nothing when the request is already on the canonical host', () => {
    const result = resolveCanonicalRedirect(new URL('https://wills.acme.com/dashboard'), 'wills.acme.com', aliases);
    expect(result.redirect).toBe(false);
  });

  it('redirects an alias to the canonical host, preserving path and query', () => {
    const result = resolveCanonicalRedirect(
      new URL('https://sorowill.vercel.app/will/42?tab=beneficiaries'),
      'wills.acme.com',
      aliases,
    );

    expect(result.redirect).toBe(true);
    expect(result.target).toBe('https://wills.acme.com/will/42?tab=beneficiaries');
  });

  it('upgrades the redirect to https', () => {
    const result = resolveCanonicalRedirect(new URL('http://sorowill.vercel.app/'), 'wills.acme.com', aliases);
    expect(result.target).toBe('https://wills.acme.com/');
  });

  it('leaves unknown hosts alone, so previews and local dev still work', () => {
    expect(
      resolveCanonicalRedirect(new URL('https://preview-abc.vercel.app/'), 'wills.acme.com', aliases).redirect,
    ).toBe(false);
    expect(
      resolveCanonicalRedirect(new URL('http://localhost:3000/'), 'wills.acme.com', aliases).redirect,
    ).toBe(false);
    expect(
      resolveCanonicalRedirect(new URL('http://127.0.0.1:3000/'), 'wills.acme.com', aliases).redirect,
    ).toBe(false);
  });
});
