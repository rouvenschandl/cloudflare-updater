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

export class CloudflareService {
  private client: Cloudflare;

  constructor(apiKey: string, email?: string) {
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
}
