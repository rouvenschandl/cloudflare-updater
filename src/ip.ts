import { publicIpv4, publicIpv6 } from 'public-ip';

export interface PublicIP {
  ipv4?: string;
  ipv6?: string;
}

/**
 * Fetches the current public IPv4 address
 */
export async function getPublicIPv4(): Promise<string | null> {
  try {
    return await publicIpv4();
  } catch {
    return null;
  }
}

/**
 * Fetches the current public IPv6 address
 */
export async function getPublicIPv6(): Promise<string | null> {
  try {
    return await publicIpv6();
  } catch {
    return null;
  }
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
