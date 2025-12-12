import Cloudflare from 'cloudflare';

export interface Zone {
  id: string;
  name: string;
  status: string;
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
}
