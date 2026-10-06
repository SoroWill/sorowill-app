import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserBalance } from '@/lib/balance';

function makeKvFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url).pathname;
    const segments = path.split('/').filter(Boolean);

    if (segments[0] === 'accounts' && !init?.method) {
      const issuer = process.env.NEXT_PUBLIC_USDC_ISSUER_TESTNET || 'expected-issuer';
      const balances = [
        { balance: '100.00', asset_type: 'native' },
        { balance: '50.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: issuer },
        { balance: '25.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'spoofed-issuer' },
      ];
      return new Response(JSON.stringify({ balances }), { status: 200 });
    }

    return new Response(JSON.stringify({ balances: [] }), { status: 200 });
  };
}

describe('getUserBalance', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_USDC_ISSUER_TESTNET = 'expected-issuer';
    delete process.env.NEXT_PUBLIC_USDC_ISSUER_MAINNET;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('sorowill_network', 'testnet');
    }
    vi.stubGlobal('fetch', makeKvFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    delete process.env.NEXT_PUBLIC_USDC_ISSUER_TESTNET;
    delete process.env.NEXT_PUBLIC_USDC_ISSUER_MAINNET;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('sorowill_network');
    }
  });

  it('returns USDC balance from the correct issuer', async () => {
    const balance = await getUserBalance('GABC');
    expect(balance).toBe('50.00');
  });

  it('ignores spoofed USDC from a different issuer', async () => {
    const balance = await getUserBalance('GABC');
    expect(balance).toBe('50.00');
  });

  it('returns null when only spoofed USDC exists', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const path = new URL(typeof input === 'string' ? input : input.toString()).pathname;
      const segments = path.split('/').filter(Boolean);
      if (segments[0] === 'accounts') {
        return new Response(
          JSON.stringify({
            balances: [
              { balance: '25.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'spoofed-issuer' },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ balances: [] }), { status: 200 });
    });

    const balance = await getUserBalance('GABC');
    expect(balance).toBeNull();
  });

  it('returns null for non-existent account', async () => {
    vi.stubGlobal('fetch', async (): Promise<Response> => {
      return new Response('Not Found', { status: 404 });
    });

    const balance = await getUserBalance('GNOTEXIST');
    expect(balance).toBeNull();
  });

  it('uses mainnet issuer when network is mainnet', async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_USDC_ISSUER_MAINNET = 'mainnet-issuer';
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('sorowill_network', 'mainnet');
    }

    vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
      const path = new URL(typeof input === 'string' ? input : input.toString()).pathname;
      const segments = path.split('/').filter(Boolean);
      if (segments[0] === 'accounts') {
        return new Response(
          JSON.stringify({
            balances: [
              { balance: '200.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'mainnet-issuer' },
              { balance: '10.00', asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'wrong-issuer' },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ balances: [] }), { status: 200 });
    });

    const balance = await getUserBalance('GABC');
    expect(balance).toBe('200.00');
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('sorowill_network');
    }
  });
});
