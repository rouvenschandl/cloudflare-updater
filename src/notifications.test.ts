import { afterEach, describe, expect, it, mock } from 'bun:test';
import { sendNotification } from './notifications.js';

const fetchMock = mock<typeof fetch>();
const originalFetch = globalThis.fetch;

function installFetchMock(): void {
  const wrappedFetch = ((...args: Parameters<typeof fetch>) => fetchMock(...args)) as typeof fetch;
  wrappedFetch.preconnect = originalFetch.preconnect;
  globalThis.fetch = wrappedFetch;
}

afterEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = originalFetch;
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  delete process.env.CF_DISCORD_WEBHOOK;
  delete process.env.CF_SLACK_WEBHOOK;
});

describe('sendNotification', () => {
  it('does not call fetch when no webhook is configured', async () => {
    installFetchMock();

    await sendNotification({
      type: 'dns_update',
      zoneName: 'example.com',
      recordName: 'home',
      oldIP: '203.0.113.1',
      newIP: '203.0.113.2',
      timestamp: new Date().toISOString(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers config webhook URLs over env values', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://env-discord.test';
    process.env.SLACK_WEBHOOK_URL = 'https://env-slack.test';

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    installFetchMock();

    await sendNotification(
      {
        type: 'dns_update',
        zoneName: 'example.com',
        recordName: 'home',
        oldIP: '203.0.113.1',
        newIP: '203.0.113.2',
        timestamp: new Date().toISOString(),
      },
      {
        discordWebhookUrl: 'https://config-discord.test',
        slackWebhookUrl: 'https://config-slack.test',
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://config-discord.test');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://config-slack.test');
  });

  it('falls back to env webhook URLs', async () => {
    process.env.CF_DISCORD_WEBHOOK = 'https://env-discord.test';

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    installFetchMock();

    await sendNotification({
      type: 'dns_failed',
      zoneName: 'example.com',
      recordName: 'home',
      oldIP: '203.0.113.1',
      newIP: '203.0.113.2',
      error: 'update failed',
      timestamp: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://env-discord.test');
  });

  it('uses Slack webhook for access updates', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://env-slack.test';

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    installFetchMock();

    await sendNotification({
      type: 'access_update',
      appName: 'Portal',
      policyName: 'Allow Home',
      oldIP: '203.0.113.1',
      newIP: '203.0.113.2',
      timestamp: new Date().toISOString(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://env-slack.test');
  });

  it('does not throw when Discord webhook responds with non-ok status', async () => {
    process.env.DISCORD_WEBHOOK_URL = 'https://env-discord.test';

    fetchMock.mockResolvedValue(
      new Response('failed', {
        status: 500,
        statusText: 'Server Error',
      })
    );
    installFetchMock();

    await expect(
      sendNotification({
        type: 'dns_update',
        zoneName: 'example.com',
        recordName: 'home',
        oldIP: '203.0.113.1',
        newIP: '203.0.113.2',
        timestamp: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Slack webhook responds with non-ok status', async () => {
    process.env.CF_SLACK_WEBHOOK = 'https://env-slack.test';

    fetchMock.mockResolvedValue(new Response('failed', { status: 503, statusText: 'Unavailable' }));
    installFetchMock();

    await expect(
      sendNotification({
        type: 'access_failed',
        appName: 'Portal',
        policyName: 'Allow Home',
        oldIP: '203.0.113.1',
        newIP: '203.0.113.2',
        error: 'update failed',
        timestamp: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
