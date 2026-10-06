import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveFederatedAddress } from '@/lib/federated';
import { getSubmittedGuardians } from '@/app/will/new/page';

describe('Federated Address Resolution Integration (#32, #186, #187, #217, #258)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves federated address with valid TTL and regex validation', async () => {
    const mockToml = 'FEDERATION_SERVER = "https://example.com/federation"';
    const mockAccount = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('stellar.toml')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockToml),
        });
      }
      if (url.includes('federation')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ account_id: mockAccount }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    const resolved = await resolveFederatedAddress('alice*example.com');
    expect(resolved).toBe(mockAccount);
  });

  it('rejects malformed account_id from federation server (#187)', async () => {
    const mockToml = 'FEDERATION_SERVER = "https://example.com/federation"';
    const badAccount = 'INVALID_ACCOUNT_ID';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('stellar.toml')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(mockToml),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ account_id: badAccount }),
      });
    });

    await expect(resolveFederatedAddress('bob*example.com')).rejects.toThrow(
      /malformed account_id/i,
    );
  });

  it('substitutes resolved address into submitted guardian payload (#217)', () => {
    const guardians = ['alice*example.com'];
    const resolvedGuardians = new Map([['id-1', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']]);
    const guardianIds = new Map([[0, 'id-1']]);

    const submitted = getSubmittedGuardians(guardians, resolvedGuardians, guardianIds);
    expect(submitted[0]).toBe('GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF12345');
    expect(submitted[0]).not.toContain('*');
  });
});
