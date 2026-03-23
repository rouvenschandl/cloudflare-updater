import { afterEach, describe, expect, it, mock } from 'bun:test';

const publicIpv4Mock = mock<() => Promise<string>>();
const publicIpv6Mock = mock<() => Promise<string>>();

mock.module('public-ip', () => ({
  publicIpv4: publicIpv4Mock,
  publicIpv6: publicIpv6Mock,
}));

const { getPublicIPv4, getPublicIPv6, getPublicIPs } = await import('./ip.js');

afterEach(() => {
  publicIpv4Mock.mockReset();
  publicIpv6Mock.mockReset();
});

describe('ip helpers', () => {
  it('returns IPv4 when lookup succeeds', async () => {
    publicIpv4Mock.mockResolvedValue('203.0.113.10');

    const result = await getPublicIPv4();

    expect(result).toBe('203.0.113.10');
  });

  it('returns null when IPv4 lookup throws', async () => {
    publicIpv4Mock.mockRejectedValue(new Error('network error'));

    const result = await getPublicIPv4();

    expect(result).toBeNull();
  });

  it('returns IPv6 when lookup succeeds', async () => {
    publicIpv6Mock.mockResolvedValue('2001:db8::1');

    const result = await getPublicIPv6();

    expect(result).toBe('2001:db8::1');
  });

  it('returns both normalized IPs from getPublicIPs', async () => {
    publicIpv4Mock.mockResolvedValue('203.0.113.20');
    publicIpv6Mock.mockResolvedValue('2001:db8::20');

    const result = await getPublicIPs();

    expect(result).toEqual({
      ipv4: '203.0.113.20',
      ipv6: '2001:db8::20',
    });
  });

  it('returns undefined values when both lookups fail', async () => {
    publicIpv4Mock.mockRejectedValue(new Error('v4 down'));
    publicIpv6Mock.mockRejectedValue(new Error('v6 down'));

    const result = await getPublicIPs();

    expect(result).toEqual({
      ipv4: undefined,
      ipv6: undefined,
    });
  });
});
