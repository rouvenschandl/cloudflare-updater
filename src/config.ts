import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import crypto from 'crypto';

const CONFIG_DIR = join(homedir(), '.cloudflare-updater');
const CONFIG_FILE = join(CONFIG_DIR, 'config.enc');
const ENCRYPTION_KEY = process.env.CF_ENCRYPTION_KEY || 'default-key-please-change';

export interface ZoneConfig {
  zoneId: string;
  zoneName: string;
  selectedRecordIds: string[];
}

export interface AccessPolicyConfig {
  appId: string;
  appName: string;
  policyId: string;
  policyName: string;
}

export interface Config {
  apiKey: string;
  email?: string;
  accountId?: string;
  zones: ZoneConfig[];
  accessPolicies?: AccessPolicyConfig[];
  updateInterval?: number; // in minutes, default: 5
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

/**
 * Reads configuration from environment variables for non-interactive/docker usage.
 * Required: CF_API_TOKEN, CF_ZONES (JSON).
 * Optional: CF_EMAIL, CF_ACCOUNT_ID, CF_ACCESS_POLICIES (JSON), CF_UPDATE_INTERVAL.
 */
function loadEnvConfig(): Config | null {
  const apiKey = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  const email = process.env.CF_EMAIL || process.env.CLOUDFLARE_EMAIL;
  const accountId = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const intervalRaw = process.env.CF_UPDATE_INTERVAL || process.env.CLOUDFLARE_UPDATE_INTERVAL;

  const parseJson = <T>(value: string | undefined, field: string): T | null => {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Invalid JSON in ${field}:`, error);
      return null;
    }
  };

  const zonesEnv = parseJson<ZoneConfig[]>(
    process.env.CF_ZONES || process.env.CLOUDFLARE_ZONES,
    'CF_ZONES'
  );
  const accessPoliciesEnv = parseJson<AccessPolicyConfig[]>(
    process.env.CF_ACCESS_POLICIES || process.env.CLOUDFLARE_ACCESS_POLICIES,
    'CF_ACCESS_POLICIES'
  );

  if (!apiKey || !zonesEnv || zonesEnv.length === 0) {
    return null;
  }

  const normalizedZones: ZoneConfig[] = zonesEnv.map((zone) => ({
    zoneId: zone.zoneId,
    zoneName: zone.zoneName,
    selectedRecordIds:
      zone.selectedRecordIds || (zone as unknown as { recordIds?: string[] }).recordIds || [],
  }));

  const normalizedAccessPolicies = accessPoliciesEnv?.map((policy) => ({
    appId: policy.appId,
    appName: policy.appName,
    policyId: policy.policyId,
    policyName: policy.policyName,
  }));

  const updateInterval = intervalRaw ? Number.parseInt(intervalRaw, 10) : undefined;
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.CF_DISCORD_WEBHOOK;
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL || process.env.CF_SLACK_WEBHOOK;

  return {
    apiKey,
    email,
    accountId,
    zones: normalizedZones,
    accessPolicies:
      normalizedAccessPolicies && normalizedAccessPolicies.length > 0
        ? normalizedAccessPolicies
        : undefined,
    updateInterval,
    discordWebhookUrl,
    slackWebhookUrl,
  };
}

/**
 * Encrypts a text using AES-256-CBC
 */
function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts a text encrypted with encrypt()
 */
function decrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Saves the configuration encrypted
 */
export async function saveConfig(config: Config): Promise<void> {
  if (!existsSync(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true });
  }

  const encrypted = encrypt(JSON.stringify(config));
  await writeFile(CONFIG_FILE, encrypted, 'utf8');
}

/**
 * Loads the saved configuration
 */
export async function loadConfig(): Promise<Config | null> {
  if (!existsSync(CONFIG_FILE)) {
    return loadEnvConfig();
  }

  try {
    const encrypted = await readFile(CONFIG_FILE, 'utf8');
    const decrypted = decrypt(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Error loading configuration:', error);
    return null;
  }
}

/**
 * Checks if a configuration exists
 */
export function hasConfig(): boolean {
  return existsSync(CONFIG_FILE) || loadEnvConfig() !== null;
}

/**
 * Deletes the saved configuration
 */
export async function deleteConfig(): Promise<void> {
  if (existsSync(CONFIG_FILE)) {
    const { unlink } = await import('fs/promises');
    await unlink(CONFIG_FILE);
  }
}
