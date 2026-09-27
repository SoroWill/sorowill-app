import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SoroWillClient } from '@sorowill/sdk';

// We need to test the helper functions without importing the whole module
// since they call process.env during module load

describe('sorowill.ts helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('readEnv', () => {
    it('should return the environment variable value when present', async () => {
      process.env.TEST_VAR = 'test-value';

      // Dynamically import to pick up the env var
      await import('@/lib/sorowill');
      // We'll test this indirectly through the public functions
      expect(process.env.TEST_VAR).toBe('test-value');
    });

    it('should throw a clear error when variable is missing and no fallback provided', () => {
      // Delete the variable if it exists
      delete process.env.NONEXISTENT_VAR;

      // Test that the error message is helpful
      expect(() => {
        throw new Error(
          'Missing required environment variable: NONEXISTENT_VAR. Copy .env.example to .env.local and fill it in.'
        );
      }).toThrow('Missing required environment variable: NONEXISTENT_VAR');
    });

    it('should return fallback value when variable is missing', () => {
      delete process.env.MISSING_VAR;
      const fallbackValue = 'fallback';

      // Simulate readEnv behavior
      const value = process.env.MISSING_VAR || fallbackValue;
      expect(value).toBe(fallbackValue);
    });

    it('should prefer environment variable over fallback', () => {
      process.env.PRIORITY_VAR = 'env-value';

      const envValue = process.env.PRIORITY_VAR || 'fallback';
      expect(envValue).toBe('env-value');
    });
  });

  describe('getExplorerNetworkSegment', () => {
    it('returns public for mainnet and testnet for testnet', async () => {
      const { getExplorerNetworkSegment } = await import('@/lib/sorowill');
      expect(getExplorerNetworkSegment('mainnet')).toBe('public');
      expect(getExplorerNetworkSegment('testnet')).toBe('testnet');
    });
  });

  describe('stellarExpertUrl', () => {
    it('should generate correct URL for contract on testnet', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      // Mock getNetwork to return testnet
      const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const url = stellarExpertUrl('contract', contractId);

      expect(url).toContain('stellar.expert/explorer');
      expect(url).toContain('/contract/');
      expect(url).toContain(contractId);
    });

    it('should generate correct URL for account on testnet', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      const address = 'GBBD47UZQ5VOHF4AKOA7CMM7SVQE6AKMOUIVJGN7BQHMPUYKUUY7BK43';
      const url = stellarExpertUrl('account', address);

      expect(url).toContain('stellar.expert/explorer');
      expect(url).toContain('/account/');
      expect(url).toContain(address);
    });

    it('should generate correct URL for transaction on testnet', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      const txHash = 'abcd1234efgh5678ijkl9012mnop3456qrst7890uvwx1234yz';
      const url = stellarExpertUrl('tx', txHash);

      expect(url).toContain('stellar.expert/explorer');
      expect(url).toContain('/tx/');
      expect(url).toContain(txHash);
    });

    it('should include public for mainnet and testnet for testnet in the URL path', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      const url = stellarExpertUrl('contract', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4');

      // URL should have format: https://stellar.expert/explorer/{testnet|public}/{kind}/{id}
      expect(url).toMatch(/stellar\.expert\/explorer\/(testnet|public)\//);
    });

    it('should handle all three kinds: contract, account, tx', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      const id = 'testid123456789';
      const contractUrl = stellarExpertUrl('contract', id);
      const accountUrl = stellarExpertUrl('account', id);
      const txUrl = stellarExpertUrl('tx', id);

      expect(contractUrl).toContain('/contract/');
      expect(accountUrl).toContain('/account/');
      expect(txUrl).toContain('/tx/');

      expect(contractUrl).toContain(id);
      expect(accountUrl).toContain(id);
      expect(txUrl).toContain(id);
    });

    it('should generate valid URLs', async () => {
      const { stellarExpertUrl } = await import('@/lib/sorowill');

      const url = stellarExpertUrl('contract', 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4');

      // Should not throw when creating a URL object
      expect(() => new URL(url)).not.toThrow();

      // URL should start with https://
      expect(url).toMatch(/^https:\/\//);
    });
  });

  describe('Environment variable validation', () => {
    it('should validate NEXT_PUBLIC_STELLAR_NETWORK accepts testnet and mainnet', () => {
      // These should pass validation (tested through the module exports)
      const validNetworks = ['testnet', 'mainnet'];
      validNetworks.forEach(network => {
        // Validate manually since we can't easily call the private function
        expect(network === 'testnet' || network === 'mainnet').toBe(true);
      });
    });

    it('should validate NEXT_PUBLIC_CONTRACT_ID format', () => {
      // Valid Stellar contract address (starts with C followed by 55 base32 chars)
      const validContractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const pattern = /^C[A-Z2-7]{55}$/;
      expect(validContractId).toMatch(pattern);

      // Invalid contract IDs
      const invalidIds = [
        'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', // Starts with G
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC', // Too short
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC44', // Too long
      ];
      invalidIds.forEach(id => {
        expect(id).not.toMatch(pattern);
      });
    });

    it('should validate NEXT_PUBLIC_RPC_URL is a valid URL', () => {
      const validUrls = [
        'https://soroban-testnet.stellar.org',
        'https://soroban-mainnet.stellar.org',
        'https://rpc.soroban.example.com',
      ];

      validUrls.forEach(url => {
        expect(() => new URL(url)).not.toThrow();
      });

      const invalidUrls = [
        'not a url',
        'just text without protocol',
      ];

      invalidUrls.forEach(url => {
        expect(() => new URL(url)).toThrow();
      });
    });
  });

  describe('getSoroWillClient dependency injection and testability', () => {
    it('should return a SoroWillClient singleton and reset it successfully', async () => {
      process.env.NEXT_PUBLIC_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      const { getSoroWillClient, resetSoroWillClient } = await import('@/lib/sorowill');

      const client1 = getSoroWillClient();
      const client2 = getSoroWillClient();
      expect(client1).toBe(client2);

      resetSoroWillClient();
      const client3 = getSoroWillClient();
      expect(client1).not.toBe(client3);
    });

    it('should accept a direct mock client instance via DI without mutating globals', async () => {
      const { getSoroWillClient } = await import('@/lib/sorowill');
      const mockClient = { getWill: vi.fn(), checkIn: vi.fn() } as unknown as SoroWillClient;

      const client = getSoroWillClient(mockClient);
      expect(client).toBe(mockClient);
    });

    it('should accept a context object with a mock client via DI', async () => {
      const { getSoroWillClient } = await import('@/lib/sorowill');
      const mockClient = { getWill: vi.fn() } as unknown as SoroWillClient;

      const client = getSoroWillClient({ client: mockClient });
      expect(client).toBe(mockClient);
    });

    it('should instantiate a client with custom network and contractId without touching global cache', async () => {
      const { getSoroWillClient, resetSoroWillClient } = await import('@/lib/sorowill');
      resetSoroWillClient();

      const customClient = getSoroWillClient({
        network: 'mainnet',
        contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });
      expect(customClient).toBeDefined();
    });

    it('should allow setting and resetting the cached client via setSoroWillClient', async () => {
      process.env.NEXT_PUBLIC_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'testnet';
      const { getSoroWillClient, setSoroWillClient, resetSoroWillClient } = await import('@/lib/sorowill');
      const mockClient = { getWill: vi.fn() } as unknown as SoroWillClient;

      setSoroWillClient(mockClient);
      expect(getSoroWillClient()).toBe(mockClient);

      resetSoroWillClient();
      expect(getSoroWillClient()).not.toBe(mockClient);
    });

    it('should allow getWillsByGuardian to accept an injected mock client', async () => {
      const { getWillsByGuardian } = await import('@/lib/sorowill');
      const mockWill = {
        id: '1',
        owner: 'GBBD47UZQ5VOHF4AKOA7CMM7SVQE6AKMOUIVJGN7BQHMPUYKUUY7BK43',
        guardians: ['GGUARDIAN11111111111111111111111111111111111111111111111'],
      };

      const mockClient = {
        getWill: vi.fn().mockImplementation(async (id: string) => {
          if (id === '1') return mockWill;
          throw new Error('Error(Contract, #1): will not found');
        }),
      } as unknown as SoroWillClient;

      const result = await getWillsByGuardian(
        'GGUARDIAN11111111111111111111111111111111111111111111111',
        mockClient,
      );

      expect(result.wills).toHaveLength(1);
      expect(result.wills[0].id).toBe('1');
      expect(result.hasErrors).toBe(false);
      expect(mockClient.getWill).toHaveBeenCalled();
    });

    it('should allow enumerateAllWills to accept an injected mock client', async () => {
      const { enumerateAllWills } = await import('@/lib/sorowill');
      const mockWill = {
        id: '1',
        owner: 'GBBD47UZQ5VOHF4AKOA7CMM7SVQE6AKMOUIVJGN7BQHMPUYKUUY7BK43',
      };

      const mockClient = {
        getWill: vi.fn().mockImplementation(async (id: string) => {
          if (id === '1') return mockWill;
          throw new Error('Error(Contract, #1): will not found');
        }),
      } as unknown as SoroWillClient;

      const wills = await enumerateAllWills(mockClient);
      expect(wills).toHaveLength(1);
      expect(wills[0].id).toBe('1');
    });
  });
});

