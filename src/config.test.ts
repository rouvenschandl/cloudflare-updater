import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

const existsSyncMock = mock<(path: string) => boolean>();
const mkdirMock = mock<(path: string, options: { recursive: boolean }) => Promise<void>>();
const readFileMock = mock<(path: string, encoding: BufferEncoding) => Promise<string>>();
const writeFileMock =
  mock<(path: string, content: string, encoding: BufferEncoding) => Promise<void>>();
const unlinkMock = mock<(path: string) => Promise<void>>();

mock.module('node:fs', () => ({
  existsSync: existsSyncMock,
}));

mock.module('node:fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  unlink: unlinkMock,
}));

const { deleteConfig, hasConfig, loadConfig, saveConfig } = await import('./config.js');

beforeEach(() => {
  existsSyncMock.mockReset();
  mkdirMock.mockReset();
  readFileMock.mockReset();
  writeFileMock.mockReset();
  unlinkMock.mockReset();

  delete process.env.CF_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CF_ZONES;
  delete process.env.CLOUDFLARE_ZONES;
  delete process.env.CF_ACCESS_POLICIES;
  delete process.env.CLOUDFLARE_ACCESS_POLICIES;
  delete process.env.CF_UPDATE_INTERVAL;
  delete process.env.CLOUDFLARE_UPDATE_INTERVAL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.CF_DISCORD_WEBHOOK;
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.CF_SLACK_WEBHOOK;
});

afterEach(() => {
  delete process.env.CF_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CF_ZONES;
  delete process.env.CLOUDFLARE_ZONES;
  delete process.env.CF_ACCESS_POLICIES;
  delete process.env.CLOUDFLARE_ACCESS_POLICIES;
  delete process.env.CF_UPDATE_INTERVAL;
  delete process.env.CLOUDFLARE_UPDATE_INTERVAL;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.CF_DISCORD_WEBHOOK;
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.CF_SLACK_WEBHOOK;
});

describe('config env fallback', () => {
  it('loads config from env and normalizes selectedRecordIds', async () => {
    existsSyncMock.mockReturnValue(false);

    process.env.CF_API_TOKEN = 'token-1';
    process.env.CF_ZONES = JSON.stringify([
      {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        recordIds: ['rec-1'],
      },
    ]);
    process.env.CF_ACCESS_POLICIES = JSON.stringify([
      {
        appId: 'app-1',
        appName: 'Portal',
        policyId: 'pol-1',
        policyName: 'Allow Home',
      },
    ]);
    process.env.CF_UPDATE_INTERVAL = '10';
    process.env.CF_DISCORD_WEBHOOK = 'https://discord.test';
    process.env.SLACK_WEBHOOK_URL = 'https://slack.test';

    const config = await loadConfig();

    expect(config).toEqual({
      apiKey: 'token-1',
      email: undefined,
      accountId: undefined,
      zones: [
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          selectedRecordIds: ['rec-1'],
        },
      ],
      accessPolicies: [
        {
          appId: 'app-1',
          appName: 'Portal',
          policyId: 'pol-1',
          policyName: 'Allow Home',
        },
      ],
      updateInterval: 10,
      discordWebhookUrl: 'https://discord.test',
      slackWebhookUrl: 'https://slack.test',
    });

    expect(hasConfig()).toBe(true);
  });

  it('returns null when required env values are missing', async () => {
    existsSyncMock.mockReturnValue(false);

    const config = await loadConfig();

    expect(config).toBeNull();
    expect(hasConfig()).toBe(false);
  });

  it('returns null and logs when CF_ZONES contains invalid JSON', async () => {
    existsSyncMock.mockReturnValue(false);
    process.env.CF_API_TOKEN = 'token-1';
    process.env.CF_ZONES = '{invalid json';

    const errorSpy = mock<typeof console.error>();
    const originalConsoleError = console.error;
    console.error = errorSpy;

    try {
      const config = await loadConfig();

      expect(config).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
      expect(hasConfig()).toBe(false);
    } finally {
      console.error = originalConsoleError;
    }
  });
});

describe('config encrypted file flow', () => {
  it('saves encrypted content, loads it back, and deletes it', async () => {
    let configDirExists = false;
    let configFileExists = false;
    let encryptedContent = '';

    existsSyncMock.mockImplementation((path: string) => {
      if (path.endsWith('.cloudflare-updater')) {
        return configDirExists;
      }
      if (path.endsWith('config.enc')) {
        return configFileExists;
      }
      return false;
    });

    mkdirMock.mockImplementation(async () => {
      configDirExists = true;
    });

    writeFileMock.mockImplementation(async (_path, content) => {
      encryptedContent = content;
      configFileExists = true;
    });

    readFileMock.mockImplementation(async () => encryptedContent);

    unlinkMock.mockImplementation(async () => {
      configFileExists = false;
    });

    const inputConfig = {
      apiKey: 'token-2',
      zones: [
        {
          zoneId: 'zone-2',
          zoneName: 'example.org',
          selectedRecordIds: ['rec-2'],
        },
      ],
      updateInterval: 15,
    };

    await saveConfig(inputConfig);

    expect(mkdirMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(encryptedContent).toContain(':');
    expect(encryptedContent).not.toContain('token-2');

    const loaded = await loadConfig();
    expect(loaded).toEqual(inputConfig);

    await deleteConfig();
    expect(unlinkMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and logs when encrypted config cannot be decrypted', async () => {
    existsSyncMock.mockImplementation((path: string) => path.endsWith('config.enc'));
    readFileMock.mockResolvedValue('not-a-valid-payload');

    const errorSpy = mock<typeof console.error>();
    const originalConsoleError = console.error;
    console.error = errorSpy;

    try {
      const loaded = await loadConfig();

      expect(loaded).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      console.error = originalConsoleError;
    }
  });
});
