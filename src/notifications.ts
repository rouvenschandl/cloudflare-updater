import chalk from 'chalk';

export interface UpdateNotification {
  type: 'dns_update' | 'access_update' | 'dns_failed' | 'access_failed';
  zoneName?: string;
  recordName?: string;
  appName?: string;
  policyName?: string;
  oldIP: string;
  newIP: string;
  error?: string;
  timestamp: string;
}

/**
 * Sends a notification to Discord via webhook
 */
export async function notifyDiscord(
  webhookUrl: string,
  notification: UpdateNotification
): Promise<void> {
  try {
    const color = notification.type.includes('failed') ? 15158332 : 3066993; // Red or Green

    const embed = {
      color,
      title:
        notification.type === 'dns_update'
          ? '🔄 DNS Record Updated'
          : notification.type === 'access_update'
            ? '🔐 Access Policy Updated'
            : notification.type === 'dns_failed'
              ? '❌ DNS Update Failed'
              : '❌ Access Policy Update Failed',
      fields: [
        notification.zoneName && {
          name: 'Zone',
          value: notification.zoneName,
          inline: true,
        },
        notification.recordName && {
          name: 'Record',
          value: notification.recordName,
          inline: true,
        },
        notification.appName && {
          name: 'Access App',
          value: notification.appName,
          inline: true,
        },
        notification.policyName && {
          name: 'Policy',
          value: notification.policyName,
          inline: true,
        },
        {
          name: 'Old IP',
          value: notification.oldIP,
          inline: true,
        },
        {
          name: 'New IP',
          value: notification.newIP,
          inline: true,
        },
        notification.error && {
          name: 'Error',
          value: notification.error,
          inline: false,
        },
      ].filter(Boolean),
      timestamp: notification.timestamp,
    };

    const payload = {
      embeds: [embed],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Failed to send Discord notification: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}

/**
 * Sends a notification to Slack via webhook
 */
export async function notifySlack(
  webhookUrl: string,
  notification: UpdateNotification
): Promise<void> {
  try {
    const color =
      notification.type === 'dns_update' || notification.type === 'access_update'
        ? '#36a64f'
        : '#ff0000';

    const title =
      notification.type === 'dns_update'
        ? '🔄 DNS Record Updated'
        : notification.type === 'access_update'
          ? '🔐 Access Policy Updated'
          : notification.type === 'dns_failed'
            ? '❌ DNS Update Failed'
            : '❌ Access Policy Update Failed';

    const fields = [
      notification.zoneName && {
        title: 'Zone',
        value: notification.zoneName,
        short: true,
      },
      notification.recordName && {
        title: 'Record',
        value: notification.recordName,
        short: true,
      },
      notification.appName && {
        title: 'Access App',
        value: notification.appName,
        short: true,
      },
      notification.policyName && {
        title: 'Policy',
        value: notification.policyName,
        short: true,
      },
      {
        title: 'Old IP',
        value: notification.oldIP,
        short: true,
      },
      {
        title: 'New IP',
        value: notification.newIP,
        short: true,
      },
      notification.error && {
        title: 'Error',
        value: notification.error,
        short: false,
      },
    ].filter(Boolean);

    const payload = {
      attachments: [
        {
          color,
          title,
          fields,
          ts: Math.floor(new Date(notification.timestamp).getTime() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `Failed to send Slack notification: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}

/**
 * Sends notifications to all configured webhooks (from config or env)
 */
export async function sendNotification(
  notification: UpdateNotification,
  config?: { discordWebhookUrl?: string; slackWebhookUrl?: string }
): Promise<void> {
  // Prefer config, fallback to environment variables
  const discordUrl =
    config?.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || process.env.CF_DISCORD_WEBHOOK;
  const slackUrl =
    config?.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL || process.env.CF_SLACK_WEBHOOK;

  const promises: Promise<void>[] = [];

  if (discordUrl) {
    promises.push(notifyDiscord(discordUrl, notification));
  }

  if (slackUrl) {
    promises.push(notifySlack(slackUrl, notification));
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}
