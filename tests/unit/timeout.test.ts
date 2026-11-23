import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RPC_TIMEOUT_MS, TimeoutError, withTimeout } from '@/lib/timeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1_000)).resolves.toBe('done');
  });

  it('passes on the rejection of the promise itself', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000)).rejects.toThrow('boom');
  });

  it('rejects with a TimeoutError naming the label and the time when the promise is too slow', async () => {
    const never = new Promise<never>(() => {});
    const result = withTimeout(never, 2_000, 'Fetching wills');
    const assertion = expect(result).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Fetching wills timed out after 2000ms',
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });

  it('uses "Request" as the label by default', async () => {
    const result = withTimeout(new Promise<never>(() => {}), 500);
    const assertion = expect(result).rejects.toThrow('Request timed out after 500ms');

    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });

  it('is an Error subclass that can be told apart from other errors', async () => {
    const result = withTimeout(new Promise<never>(() => {}), 10);
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(new TimeoutError('x', 1)).toBeInstanceOf(Error);
  });

  it('does not leave a timer running once the promise has settled', async () => {
    await withTimeout(Promise.resolve(1), 60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not reject later after a result has been returned', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 100);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(result).toBe('ok');
  });
});

describe('RPC_TIMEOUT_MS', () => {
  it('is 15 seconds by default', () => {
    expect(RPC_TIMEOUT_MS).toBe(15_000);
  });

  it('can be set with NEXT_PUBLIC_RPC_TIMEOUT_MS', async () => {
    vi.stubEnv('NEXT_PUBLIC_RPC_TIMEOUT_MS', '4000');
    vi.resetModules();
    const { RPC_TIMEOUT_MS: configured } = await import('@/lib/timeout');
    expect(configured).toBe(4_000);
  });

  it.each(['0', '-5', 'abc', ''])('falls back to the default for the value "%s"', async (value) => {
    vi.stubEnv('NEXT_PUBLIC_RPC_TIMEOUT_MS', value);
    vi.resetModules();
    const { RPC_TIMEOUT_MS: configured } = await import('@/lib/timeout');
    expect(configured).toBe(15_000);
  });
});
