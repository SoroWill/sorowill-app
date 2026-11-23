import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CORRELATION_ID_HEADER, getCorrelationId, withCorrelationId } from '@/lib/correlation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getCorrelationId (#824)', () => {
  it('generates a UUID when the request has no id', () => {
    expect(getCorrelationId(new Request('http://localhost/api/time'))).toMatch(UUID);
    expect(getCorrelationId()).toMatch(UUID);
  });

  it('keeps a plain id supplied by the caller', () => {
    const request = new Request('http://localhost/api/time', { headers: { [CORRELATION_ID_HEADER]: 'trace-1234_abcd' } });
    expect(getCorrelationId(request)).toBe('trace-1234_abcd');
  });

  it('replaces a supplied id that is too short, too long or has odd characters', () => {
    for (const bad of ['short', 'x'.repeat(65), 'has space in it', 'line\nbreak-id']) {
      const request = new Request('http://localhost/api/time', { headers: { [CORRELATION_ID_HEADER]: bad } });
      expect(getCorrelationId(request)).toMatch(UUID);
    }
  });
});

describe('withCorrelationId (#824)', () => {
  it('adds the id to the response headers and logs it with the request', async () => {
    const handler = withCorrelationId(async () => Response.json({ ok: true }, { status: 201 }));
    const response = await handler(new Request('http://localhost/api/reminders/register', { method: 'POST' }));

    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(id).toMatch(UUID);
    expect(response.status).toBe(201);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`POST /api/reminders/register -> 201`));
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(`correlationId=${id}`));
  });

  it('echoes an id supplied by the caller', async () => {
    const handler = withCorrelationId(() => new Response('ok'));
    const response = await handler(
      new Request('http://localhost/api/time', { headers: { [CORRELATION_ID_HEADER]: 'from-the-client-1' } }),
    );
    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe('from-the-client-1');
  });

  it('gives different requests different ids', async () => {
    const handler = withCorrelationId(() => new Response('ok'));
    const a = await handler(new Request('http://localhost/api/time'));
    const b = await handler(new Request('http://localhost/api/time'));
    expect(a.headers.get(CORRELATION_ID_HEADER)).not.toBe(b.headers.get(CORRELATION_ID_HEADER));
  });

  it('turns an uncaught error into a 500 that carries the id and logs the error with it', async () => {
    const handler = withCorrelationId(async () => {
      throw new Error('boom');
    });
    const response = await handler(new Request('http://localhost/api/time'));
    const id = response.headers.get(CORRELATION_ID_HEADER);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: 'Internal server error', correlationId: id });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`correlationId=${id}`), expect.any(Error));
  });

  it('works on a response whose headers are immutable', async () => {
    const immutable = Response.redirect('http://localhost/elsewhere', 302);
    const handler = withCorrelationId(() => immutable);
    const response = await handler(new Request('http://localhost/api/time'));
    expect(response.status).toBe(302);
    expect(response.headers.get(CORRELATION_ID_HEADER)).toMatch(UUID);
  });
});
