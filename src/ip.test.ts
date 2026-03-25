import { afterEach, describe, expect, it, mock } from 'bun:test';

const fetchMock = mock<typeof fetch>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const { getPublicIPv4, getPublicIPv6, getPublicIPs } = await import('./ip.js');

afterEach(() => {
  fetchMock.mockReset();
});

function createResponse(value: string, ok = true): Response {
  return {
    ok,
    text: async () => value,
  } as Response;
}

describe('ip helpers', () => {
  it('returns IPv4 when a majority agrees', async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse('203.0.113.10'))
      .mockResolvedValueOnce(createResponse('203.0.113.10'))
      .mockResolvedValueOnce(createResponse('198.51.100.4'));

    const result = await getPublicIPv4();

    expect(result).toBe('203.0.113.10');
  });

  it('returns null when IPv4 sources disagree without majority', async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse('203.0.113.10'))
      .mockResolvedValueOnce(createResponse('198.51.100.4'))
      .mockRejectedValueOnce(new Error('network error'));

    const result = await getPublicIPv4();

    expect(result).toBeNull();
  });

  it('returns IPv6 when lookup succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(createResponse('2001:db8::1'))
      .mockResolvedValueOnce(createResponse('2001:db8::1'))
      .mockResolvedValueOnce(createResponse('')); // invalid IPv6

    const result = await getPublicIPv6();

    expect(result).toBe('2001:db8::1');
  });

  it('returns both normalized IPs from getPublicIPs', async () => {
    fetchMock
      // IPv4 lookups
      .mockResolvedValueOnce(createResponse('203.0.113.20'))
      .mockResolvedValueOnce(createResponse('203.0.113.20'))
      .mockResolvedValueOnce(createResponse('203.0.113.20'))
      // IPv6 lookups
      .mockResolvedValueOnce(createResponse('2001:db8::20'))
      .mockResolvedValueOnce(createResponse('2001:db8::20'))
      .mockResolvedValueOnce(createResponse('2001:db8::20'));

    const result = await getPublicIPs();

    expect(result).toEqual({
      ipv4: '203.0.113.20',
      ipv6: '2001:db8::20',
    });
  });

  it('returns undefined values when both lookups fail', async () => {
    fetchMock
      // IPv4 lookups
      .mockRejectedValueOnce(new Error('v4 down'))
      .mockRejectedValueOnce(new Error('v4 down'))
      .mockRejectedValueOnce(new Error('v4 down'))
      // IPv6 lookups
      .mockRejectedValueOnce(new Error('v6 down'))
      .mockRejectedValueOnce(new Error('v6 down'))
      .mockRejectedValueOnce(new Error('v6 down'));

    const result = await getPublicIPs();

    expect(result).toEqual({
      ipv4: undefined,
      ipv6: undefined,
    });
  });
});
