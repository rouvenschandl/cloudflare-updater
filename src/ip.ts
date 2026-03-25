import { isIP } from 'node:net';

export interface PublicIP {
  ipv4?: string;
  ipv6?: string;
}

const REQUEST_TIMEOUT_MS = 5000;

const IPV4_SOURCES = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];

const IPV6_SOURCES = ['https://api64.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];

function isValidIp(value: string, version: 4 | 6): boolean {
  return isIP(value) === version;
}

async function fetchIpFromSource(url: string, version: 4 | 6): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      return null;
    }

    const body = (await response.text()).trim();
    return isValidIp(body, version) ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getConsensusIp(ipResults: string[]): string | null {
  if (ipResults.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const ip of ipResults) {
    counts.set(ip, (counts.get(ip) || 0) + 1);
  }

  const sortedByVotes = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [bestIp, bestVotes] = sortedByVotes[0];
  const secondVotes = sortedByVotes[1]?.[1] ?? 0;

  // If the top two candidates have the same score, there is no clear winner.
  if (bestVotes === secondVotes) {
    return null;
  }

  return bestIp;
}

async function getPublicIP(version: 4 | 6): Promise<string | null> {
  const sources = version === 4 ? IPV4_SOURCES : IPV6_SOURCES;
  const lookups = await Promise.all(sources.map((url) => fetchIpFromSource(url, version)));
  const validIps = lookups.filter((ip): ip is string => ip !== null);

  return getConsensusIp(validIps);
}

/**
 * Fetches the current public IPv4 address
 */
export async function getPublicIPv4(): Promise<string | null> {
  return getPublicIP(4);
}

/**
 * Fetches the current public IPv6 address
 */
export async function getPublicIPv6(): Promise<string | null> {
  return getPublicIP(6);
}

/**
 * Fetches both public IP addresses (IPv4 and IPv6)
 */
export async function getPublicIPs(): Promise<PublicIP> {
  const [ipv4, ipv6] = await Promise.all([getPublicIPv4(), getPublicIPv6()]);

  return {
    ipv4: ipv4 || undefined,
    ipv6: ipv6 || undefined,
  };
}
