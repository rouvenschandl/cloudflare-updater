import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import crypto from 'crypto';

const CONFIG_DIR = join(homedir(), '.cloudflare-updater');
const CONFIG_FILE = join(CONFIG_DIR, 'config.enc');
const ENCRYPTION_KEY = process.env.CF_ENCRYPTION_KEY || 'default-key-please-change';

interface Config {
  apiKey: string;
  email?: string;
  zoneId?: string;
  zoneName?: string;
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
    return null;
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
  return existsSync(CONFIG_FILE);
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
