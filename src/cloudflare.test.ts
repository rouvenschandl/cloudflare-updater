import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const cloudflareCtorMock = mock<(config: { apiToken: string; apiEmail?: string }) => void>();
const zonesListMock =
  mock<() => Promise<{ result: Array<{ id: string; name: string; status?: string }> }>>();
const dnsRecordsListMock =
  mock<
    (params: { zone_id: string; type?: 'A' | 'AAAA' }) => Promise<{
      result: Array<{
        id: string;
        type: string;
        name: string;
        content?: string;
        proxied?: boolean;
        ttl?: number;
      }>;
    }>
  >();
const dnsRecordsUpdateMock =
  mock<
    (
      recordId: string,
      params: {
        zone_id: string;
        type: 'A' | 'AAAA';
        name: string;
        content: string;
        ttl: number;
        proxied?: boolean;
      }
    ) => Promise<void>
  >();

const accessAppsListMock =
  mock<
    (params: { account_id: string }) => Promise<{
      result: Array<{ id?: string; name?: string; domain?: string; type?: string }>;
    }>
  >();
const accessAppPoliciesListMock =
  mock<
    (
      appId: string,
      params: { account_id: string }
    ) => Promise<{
      result: Array<{
        id?: string;
        name?: string;
        decision?: 'allow' | 'deny' | 'non_identity' | 'bypass';
        include?: Array<{ ip?: { ip: string } }>;
        exclude?: Array<{ ip?: { ip: string } }>;
        require?: Array<{ ip?: { ip: string } }>;
        is_service_policy?: boolean;
        reusable?: boolean;
      }>;
    }>
  >();
const accessReusablePolicyUpdateMock = mock<(policyId: string, params: unknown) => Promise<void>>();
const accessAppPolicyUpdateMock =
  mock<(appId: string, policyId: string, params: unknown) => Promise<void>>();

class CloudflareMock {
  zones = {
    list: zonesListMock,
  };

  dns = {
    records: {
      list: dnsRecordsListMock,
      update: dnsRecordsUpdateMock,
    },
  };

  zeroTrust = {
    access: {
      applications: {
        list: accessAppsListMock,
        policies: {
          list: accessAppPoliciesListMock,
          update: accessAppPolicyUpdateMock,
        },
      },
      policies: {
        update: accessReusablePolicyUpdateMock,
      },
    },
  };

  constructor(config: { apiToken: string; apiEmail?: string }) {
    cloudflareCtorMock(config);
  }
}

mock.module('cloudflare', () => ({
  default: CloudflareMock,
}));

const { CloudflareService } = await import('./cloudflare.js');

beforeEach(() => {
  cloudflareCtorMock.mockReset();
  zonesListMock.mockReset();
  dnsRecordsListMock.mockReset();
  dnsRecordsUpdateMock.mockReset();
  accessAppsListMock.mockReset();
  accessAppPoliciesListMock.mockReset();
  accessReusablePolicyUpdateMock.mockReset();
  accessAppPolicyUpdateMock.mockReset();
});

afterEach(() => {
  cloudflareCtorMock.mockReset();
  zonesListMock.mockReset();
  dnsRecordsListMock.mockReset();
  dnsRecordsUpdateMock.mockReset();
  accessAppsListMock.mockReset();
  accessAppPoliciesListMock.mockReset();
  accessReusablePolicyUpdateMock.mockReset();
  accessAppPolicyUpdateMock.mockReset();
});

describe('CloudflareService', () => {
  it('creates Cloudflare client with token and email', async () => {
    new CloudflareService('api-token', 'mail@example.com');

    expect(cloudflareCtorMock).toHaveBeenCalledTimes(1);
    expect(cloudflareCtorMock.mock.calls[0]?.[0]).toEqual({
      apiToken: 'api-token',
      apiEmail: 'mail@example.com',
    });
  });

  it('maps zones and defaults missing status to unknown', async () => {
    const service = new CloudflareService('api-token');
    zonesListMock.mockResolvedValue({
      result: [
        { id: 'z1', name: 'example.com', status: 'active' },
        { id: 'z2', name: 'example.org' },
      ],
    });

    const zones = await service.getZones();

    expect(zones).toEqual([
      { id: 'z1', name: 'example.com', status: 'active' },
      { id: 'z2', name: 'example.org', status: 'unknown' },
    ]);
  });

  it('requests DNS records with optional type and normalizes defaults', async () => {
    const service = new CloudflareService('api-token');
    dnsRecordsListMock.mockResolvedValue({
      result: [
        { id: 'r1', type: 'A', name: 'home.example.com', content: '203.0.113.2' },
        { id: 'r2', type: 'AAAA', name: 'home.example.com' },
      ],
    });

    const records = await service.getDNSRecords('zone-1', 'A');

    expect(dnsRecordsListMock.mock.calls[0]?.[0]).toEqual({
      zone_id: 'zone-1',
      type: 'A',
    });
    expect(records).toEqual([
      {
        id: 'r1',
        type: 'A',
        name: 'home.example.com',
        content: '203.0.113.2',
        proxied: false,
        ttl: 1,
      },
      {
        id: 'r2',
        type: 'AAAA',
        name: 'home.example.com',
        content: '',
        proxied: false,
        ttl: 1,
      },
    ]);
  });

  it('updates DNS record with expected payload', async () => {
    const service = new CloudflareService('api-token');
    dnsRecordsUpdateMock.mockResolvedValue();

    await service.updateDNSRecord(
      'zone-1',
      'record-1',
      '203.0.113.10',
      'home.example.com',
      'A',
      true,
      120
    );

    expect(dnsRecordsUpdateMock).toHaveBeenCalledTimes(1);
    expect(dnsRecordsUpdateMock.mock.calls[0]?.[0]).toBe('record-1');
    expect(dnsRecordsUpdateMock.mock.calls[0]?.[1]).toEqual({
      zone_id: 'zone-1',
      type: 'A',
      name: 'home.example.com',
      content: '203.0.113.10',
      ttl: 120,
      proxied: true,
    });
  });

  it('maps Access applications with safe defaults', async () => {
    const service = new CloudflareService('api-token');
    accessAppsListMock.mockResolvedValue({
      result: [{ id: 'app-1', name: 'Portal', domain: 'portal.example.com' }, {}],
    });

    const apps = await service.getAccessApps('account-1');

    expect(accessAppsListMock.mock.calls[0]?.[0]).toEqual({ account_id: 'account-1' });
    expect(apps).toEqual([
      { id: 'app-1', name: 'Portal', domain: 'portal.example.com', type: '' },
      { id: '', name: '', domain: '', type: '' },
    ]);
  });

  it('filters Access policies to IP includes and maps reusable flag', async () => {
    const service = new CloudflareService('api-token');
    accessAppPoliciesListMock.mockResolvedValue({
      result: [
        {
          id: 'p1',
          name: 'Allow Home',
          decision: 'allow',
          include: [{ ip: { ip: '203.0.113.1/32' } }],
          is_service_policy: true,
        },
        {
          id: 'p2',
          name: 'Without IP',
          decision: 'allow',
          include: [{}],
        },
      ],
    });

    const policies = await service.getAccessPolicies('account-1', 'app-1');

    expect(accessAppPoliciesListMock.mock.calls[0]?.[0]).toBe('app-1');
    expect(accessAppPoliciesListMock.mock.calls[0]?.[1]).toEqual({ account_id: 'account-1' });
    expect(policies).toEqual([
      {
        id: 'p1',
        name: 'Allow Home',
        decision: 'allow',
        include: [{ ip: { ip: '203.0.113.1/32' } }],
        exclude: undefined,
        require: undefined,
        reusable: true,
      },
    ]);
  });

  it('updates reusable Access policy via reusable endpoint', async () => {
    const service = new CloudflareService('api-token');
    accessReusablePolicyUpdateMock.mockResolvedValue();

    await service.updateAccessPolicy('account-1', 'app-1', 'policy-1', '203.0.113.5/32', {
      id: 'policy-1',
      name: 'Reusable Policy',
      decision: 'allow',
      include: [{ ip: { ip: '203.0.113.1/32' } }],
      reusable: true,
    });

    expect(accessReusablePolicyUpdateMock).toHaveBeenCalledTimes(1);
    expect(accessReusablePolicyUpdateMock.mock.calls[0]?.[0]).toBe('policy-1');
    expect(accessReusablePolicyUpdateMock.mock.calls[0]?.[1]).toEqual({
      account_id: 'account-1',
      decision: 'allow',
      include: [{ ip: { ip: '203.0.113.5/32' } }],
      exclude: undefined,
      require: undefined,
      name: 'Reusable Policy',
    });
    expect(accessAppPolicyUpdateMock).not.toHaveBeenCalled();
  });

  it('updates app-specific Access policy via app endpoint', async () => {
    const service = new CloudflareService('api-token');
    accessAppPolicyUpdateMock.mockResolvedValue();

    await service.updateAccessPolicy('account-1', 'app-1', 'policy-1', '203.0.113.7', {
      id: 'policy-1',
      name: 'App Policy',
      decision: 'allow',
      include: [{ ip: { ip: '203.0.113.1' } }],
      reusable: false,
    });

    expect(accessAppPolicyUpdateMock).toHaveBeenCalledTimes(1);
    expect(accessAppPolicyUpdateMock.mock.calls[0]?.[0]).toBe('app-1');
    expect(accessAppPolicyUpdateMock.mock.calls[0]?.[1]).toBe('policy-1');
    expect(accessAppPolicyUpdateMock.mock.calls[0]?.[2]).toEqual({
      account_id: 'account-1',
      decision: 'allow',
      include: [{ ip: { ip: '203.0.113.7' } }],
      exclude: undefined,
      require: undefined,
    });
    expect(accessReusablePolicyUpdateMock).not.toHaveBeenCalled();
  });
});
