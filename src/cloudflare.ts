import Cloudflare from 'cloudflare';

export interface Zone {
  id: string;
  name: string;
  status: string;
}

export interface DNSRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface AccessApp {
  id: string;
  name: string;
  domain: string;
  type?: string;
}

export interface AccessPolicyInclude {
  ip?: {
    ip: string;
  };
  ip_list?: {
    id: string;
  };
}

export interface AccessPolicy {
  id: string;
  name: string;
  decision: AccessDecision;
  include: AccessPolicyInclude[];
  exclude?: AccessPolicyInclude[];
  require?: AccessPolicyInclude[];
  reusable?: boolean;
}

type AccessDecision = 'allow' | 'deny' | 'non_identity' | 'bypass';

interface AccessAppApi {
  id?: string;
  name?: string;
  domain?: string;
  type?: string;
}

interface AccessPolicyApi {
  id?: string;
  name?: string;
  decision?: AccessDecision;
  include?: AccessPolicyInclude[];
  exclude?: AccessPolicyInclude[];
  require?: AccessPolicyInclude[];
  is_service_policy?: boolean;
  reusable?: boolean;
}

interface AccessPolicyUpdateParams {
  account_id: string;
  decision: AccessDecision;
  include: AccessPolicyInclude[];
  exclude?: AccessPolicyInclude[];
  require?: AccessPolicyInclude[];
  name?: string;
}

export class CloudflareService {
  private client: Cloudflare;
  private apiKey: string;

  constructor(apiKey: string, email?: string) {
    this.apiKey = apiKey;
    this.client = new Cloudflare({
      apiToken: apiKey,
      apiEmail: email,
    });
  }

  /**
   * Fetches all available zones
   */
  async getZones(): Promise<Zone[]> {
    const response = await this.client.zones.list();
    return response.result.map((zone) => ({
      id: zone.id,
      name: zone.name,
      status: zone.status || 'unknown',
    }));
  }

  /**
   * Fetches DNS records for a zone
   */
  async getDNSRecords(zoneId: string, type?: 'A' | 'AAAA'): Promise<DNSRecord[]> {
    const params: { zone_id: string; type?: 'A' | 'AAAA' } = { zone_id: zoneId };
    if (type) {
      params.type = type;
    }

    const response = await this.client.dns.records.list(params);
    return response.result.map((record) => ({
      id: record.id,
      type: record.type,
      name: record.name,
      content: record.content || '',
      proxied: record.proxied || false,
      ttl: record.ttl || 1,
    }));
  }

  /**
   * Updates a DNS record
   */
  async updateDNSRecord(
    zoneId: string,
    recordId: string,
    content: string,
    name: string,
    type: 'A' | 'AAAA' = 'A',
    proxied: boolean = false,
    ttl: number = 1
  ): Promise<void> {
    const params: {
      zone_id: string;
      type: 'A' | 'AAAA';
      name: string;
      content: string;
      ttl: number;
      proxied?: boolean;
    } = {
      zone_id: zoneId,
      type,
      name,
      content,
      ttl,
    };

    if (type === 'A' || type === 'AAAA') {
      params.proxied = proxied;
    }

    await this.client.dns.records.update(recordId, params);
  }

  /**
   * Fetches all Access applications for an account
   */
  async getAccessApps(accountId: string): Promise<AccessApp[]> {
    const response = await this.client.zeroTrust.access.applications.list({
      account_id: accountId,
    });

    const apps = response.result as AccessAppApi[];

    return apps.map((app) => ({
      id: app.id || '',
      name: app.name || '',
      domain: app.domain || '',
      type: app.type || '',
    }));
  }

  /**
   * Fetches Access policies for a specific application
   * Returns both application-specific and reusable policies with IP range includes
   */
  async getAccessPolicies(accountId: string, appId: string): Promise<AccessPolicy[]> {
    const response = await this.client.zeroTrust.access.applications.policies.list(appId, {
      account_id: accountId,
    });

    const policies = response.result as AccessPolicyApi[];

    // Filter policies that have IP range includes
    return policies
      .filter((policy) => {
        const includeList = policy.include ?? [];
        const hasIpIncludes = includeList.some((inc) => inc.ip !== undefined);
        return hasIpIncludes;
      })
      .map((policy) => ({
        id: policy.id || '',
        name: policy.name || '',
        decision: policy.decision ?? 'allow',
        include: policy.include || [],
        exclude: policy.exclude,
        require: policy.require,
        reusable: policy.is_service_policy || policy.reusable || false,
      }));
  }

  /**
   * Updates an Access policy's IP range includes
   * Handles both application-specific and reusable policies
   */
  async updateAccessPolicy(
    accountId: string,
    appId: string,
    policyId: string,
    newIp: string,
    policyData: AccessPolicy
  ): Promise<void> {
    // Update IP addresses in includes
    const updatedIncludes = policyData.include.map((inc) => {
      if (inc.ip) {
        return {
          ip: {
            ip: newIp,
          },
        };
      }
      return inc;
    });

    if (policyData.reusable) {
      // Use reusable policy endpoint
      const reusableParams: AccessPolicyUpdateParams = {
        account_id: accountId,
        decision: policyData.decision,
        include: updatedIncludes,
        exclude: policyData.exclude,
        require: policyData.require,
        name: policyData.name,
      };

      await this.client.zeroTrust.access.policies.update(
        policyId,
        reusableParams as unknown as Parameters<
          typeof this.client.zeroTrust.access.policies.update
        >[1]
      );
    } else {
      // Use application-specific policy endpoint
      const applicationParams: AccessPolicyUpdateParams = {
        account_id: accountId,
        decision: policyData.decision,
        include: updatedIncludes,
        exclude: policyData.exclude,
        require: policyData.require,
      };

      await this.client.zeroTrust.access.applications.policies.update(
        appId,
        policyId,
        applicationParams as unknown as Parameters<
          typeof this.client.zeroTrust.access.applications.policies.update
        >[2]
      );
    }
  }
}
