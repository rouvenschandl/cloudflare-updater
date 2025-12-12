import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config.js';
import { CloudflareService } from './cloudflare.js';
import { getPublicIPs } from './ip.js';

interface UpdateResult {
  zoneId: string;
  zoneName: string;
  recordId: string;
  recordName: string;
  oldIP: string;
  newIP: string;
  success: boolean;
  error?: string;
}

interface AccessUpdateResult {
  appId: string;
  appName: string;
  policyId: string;
  policyName: string;
  oldIP: string;
  newIP: string;
  success: boolean;
  error?: string;
}

// Normalize an IP string by stripping a CIDR suffix (e.g., /32, /128) for comparisons
function normalizeIp(ip?: string): string | undefined {
  if (!ip) return undefined;
  return ip.split('/')[0];
}

/**
 * Checks and updates DNS records if IP has changed
 */
async function updateDNSRecords(): Promise<UpdateResult[]> {
  const config = await loadConfig();
  if (!config) {
    throw new Error('No configuration found');
  }

  const { ipv4, ipv6 } = await getPublicIPs();
  const cfService = new CloudflareService(config.apiKey);
  const results: UpdateResult[] = [];

  for (const zone of config.zones) {
    const spinner = ora({
      text: `Checking records in ${zone.zoneName}...`,
      discardStdin: false,
    }).start();

    try {
      // Fetch current DNS records
      const [aRecords, aaaaRecords] = await Promise.all([
        cfService.getDNSRecords(zone.zoneId, 'A'),
        cfService.getDNSRecords(zone.zoneId, 'AAAA'),
      ]);

      const allRecords = [...aRecords, ...aaaaRecords];
      const selectedRecords = allRecords.filter((r) => zone.selectedRecordIds.includes(r.id));

      spinner.stop();

      for (const record of selectedRecords) {
        const currentIP = record.content;
        let newIP: string | undefined;

        // Determine which IP to use based on record type
        if (record.type === 'A' && ipv4) {
          newIP = ipv4;
        } else if (record.type === 'AAAA' && ipv6) {
          newIP = ipv6;
        }

        // Skip if no IP available for this type
        if (!newIP) {
          results.push({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            recordId: record.id,
            recordName: record.name,
            oldIP: currentIP,
            newIP: currentIP,
            success: false,
            error: `No ${record.type === 'A' ? 'IPv4' : 'IPv6'} address available`,
          });
          continue;
        }

        // Check if IP has changed
        if (currentIP === newIP) {
          results.push({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            recordId: record.id,
            recordName: record.name,
            oldIP: currentIP,
            newIP,
            success: true,
          });
          continue;
        }

        // Update DNS record
        const updateSpinner = ora({
          text: `Updating ${record.name} (${record.type}): ${currentIP} → ${newIP}`,
          discardStdin: false,
        }).start();

        try {
          await cfService.updateDNSRecord(
            zone.zoneId,
            record.id,
            newIP,
            record.name,
            record.type as 'A' | 'AAAA',
            record.proxied,
            record.ttl
          );

          updateSpinner.succeed(
            `Updated ${record.name} (${record.type}): ${chalk.red(currentIP)} → ${chalk.green(newIP)}`
          );

          results.push({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            recordId: record.id,
            recordName: record.name,
            oldIP: currentIP,
            newIP,
            success: true,
          });
        } catch (error) {
          updateSpinner.fail(`Failed to update ${record.name}`);
          results.push({
            zoneId: zone.zoneId,
            zoneName: zone.zoneName,
            recordId: record.id,
            recordName: record.name,
            oldIP: currentIP,
            newIP,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      spinner.fail(`Failed to check records in ${zone.zoneName}`);
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
    }
  }

  return results;
}

/**
 * Checks and updates Access policies if IP has changed
 */
async function updateAccessPolicies(): Promise<AccessUpdateResult[]> {
  const config = await loadConfig();
  if (!config || !config.accessPolicies || !config.accountId) {
    return [];
  }

  const { ipv4 } = await getPublicIPs();
  if (!ipv4) {
    console.log(chalk.yellow('\n⚠ No IPv4 address available for Access policy updates\n'));
    return [];
  }

  const cfService = new CloudflareService(config.apiKey);
  const results: AccessUpdateResult[] = [];

  // Group policies by app
  const appGroups = config.accessPolicies.reduce(
    (acc, policy) => {
      if (!acc[policy.appId]) {
        acc[policy.appId] = { appName: policy.appName, policies: [] };
      }
      acc[policy.appId].policies.push(policy);
      return acc;
    },
    {} as Record<string, { appName: string; policies: typeof config.accessPolicies }>
  );

  for (const [appId, group] of Object.entries(appGroups)) {
    const spinner = ora({
      text: `Checking Access policies in ${group.appName}...`,
      discardStdin: false,
    }).start();

    try {
      // Fetch current policies
      const policies = await cfService.getAccessPolicies(config.accountId, appId);

      spinner.stop();

      for (const configPolicy of group.policies) {
        const policy = policies.find((p) => p.id === configPolicy.policyId);

        if (!policy) {
          results.push({
            appId,
            appName: group.appName,
            policyId: configPolicy.policyId,
            policyName: configPolicy.policyName,
            oldIP: 'unknown',
            newIP: ipv4,
            success: false,
            error: 'Policy not found',
          });
          continue;
        }

        // Get current IP from policy
        const rawPolicyIp = policy.include.find((inc) => inc.ip)?.ip?.ip;
        const currentIp = rawPolicyIp || 'unknown';

        const normalizedCurrent = normalizeIp(rawPolicyIp);
        const normalizedNew = normalizeIp(ipv4);

        // Preserve existing CIDR suffix if present
        const cidrSuffix =
          rawPolicyIp && rawPolicyIp.includes('/') ? rawPolicyIp.split('/')[1] : undefined;
        const newPolicyIp = cidrSuffix ? `${ipv4}/${cidrSuffix}` : ipv4;

        // Check if IP has changed (ignore CIDR differences like /32)
        if (normalizedCurrent && normalizedNew && normalizedCurrent === normalizedNew) {
          results.push({
            appId,
            appName: group.appName,
            policyId: policy.id,
            policyName: policy.name,
            oldIP: currentIp,
            newIP: newPolicyIp,
            success: true,
          });
          continue;
        }

        // Update policy
        const updateSpinner = ora({
          text: `Updating ${policy.name}: ${currentIp} → ${ipv4}`,
          discardStdin: false,
        }).start();

        try {
          await cfService.updateAccessPolicy(
            config.accountId,
            appId,
            policy.id,
            newPolicyIp,
            policy
          );

          updateSpinner.succeed(
            `Updated ${policy.name}: ${chalk.red(currentIp)} → ${chalk.green(newPolicyIp)}`
          );

          results.push({
            appId,
            appName: group.appName,
            policyId: policy.id,
            policyName: policy.name,
            oldIP: currentIp,
            newIP: newPolicyIp,
            success: true,
          });
        } catch (error) {
          updateSpinner.fail(`Failed to update ${policy.name}`);
          results.push({
            appId,
            appName: group.appName,
            policyId: policy.id,
            policyName: policy.name,
            oldIP: currentIp,
            newIP: ipv4,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      spinner.fail(`Failed to check policies in ${group.appName}`);
      console.error(
        chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      );
    }
  }

  return results;
}

/**
 * Starts the DNS update monitoring loop
 */
export async function startUpdateLoop(intervalMinutes?: number): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    throw new Error('No configuration found');
  }

  const interval = intervalMinutes || config.updateInterval || 5;
  let isRunning = true;

  console.log(chalk.bold.cyan('\n🔄 Starting IP Update Monitoring\n'));
  console.log(`  ${chalk.bold('Update Interval:')} ${interval} minute(s)`);
  console.log(
    `  ${chalk.bold('Press')} ${chalk.cyan('q')} ${chalk.bold('to stop and return to menu')}\n`
  );

  // Setup keyboard listener with better handling (only if stdin is TTY)
  const keyListener = (chunk: Buffer) => {
    const str = chunk.toString('utf8');

    // Check for q, Q, or Ctrl+C
    if (str === 'q' || str === 'Q' || str === '\u0003' || str === '\x71' || str === '\x51') {
      isRunning = false;
      console.log(chalk.yellow('\n\nStopping monitoring...\n'));
    }
  };

  const isTTY = process.stdin.isTTY;
  if (isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', keyListener);
  }

  // Initial update
  console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] Checking for IP changes...\n`));
  const initialDnsResults = await updateDNSRecords();
  const initialAccessResults = await updateAccessPolicies();

  const dnsUpdated = initialDnsResults.filter((r) => r.success && r.oldIP !== r.newIP);
  const dnsUnchanged = initialDnsResults.filter((r) => r.success && r.oldIP === r.newIP);
  const dnsFailed = initialDnsResults.filter((r) => !r.success);

  const accessUpdated = initialAccessResults.filter((r) => r.success && r.oldIP !== r.newIP);
  const accessUnchanged = initialAccessResults.filter((r) => r.success && r.oldIP === r.newIP);
  const accessFailed = initialAccessResults.filter((r) => !r.success);

  if (dnsUpdated.length > 0) {
    console.log(chalk.green(`\n✓ Updated ${dnsUpdated.length} DNS record(s)`));
  }
  if (dnsUnchanged.length > 0) {
    console.log(chalk.gray(`  ${dnsUnchanged.length} DNS record(s) unchanged`));
  }
  if (dnsFailed.length > 0) {
    console.log(chalk.red(`\n✗ Failed to update ${dnsFailed.length} DNS record(s)`));
    dnsFailed.forEach((r) => {
      console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
    });
  }

  if (accessUpdated.length > 0) {
    console.log(chalk.green(`\n✓ Updated ${accessUpdated.length} Access policy/policies`));
  }
  if (accessUnchanged.length > 0) {
    console.log(chalk.gray(`  ${accessUnchanged.length} Access policy/policies unchanged`));
  }
  if (accessFailed.length > 0) {
    console.log(chalk.red(`\n✗ Failed to update ${accessFailed.length} Access policy/policies`));
    accessFailed.forEach((r) => {
      console.log(chalk.red(`  - ${r.policyName}: ${r.error}`));
    });
  }

  // Set up interval
  const intervalMs = interval * 60 * 1000;
  let nextCheck = Date.now() + intervalMs;
  console.log(
    chalk.gray(
      `\nNext check in ${interval} minute(s) at ${new Date(nextCheck).toLocaleTimeString()}...\n`
    )
  );

  // Run update loop
  while (isRunning) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second

    if (Date.now() >= nextCheck && isRunning) {
      console.log(
        chalk.gray(`\n[${new Date().toLocaleTimeString()}] Checking for IP changes...\n`)
      );
      const dnsResults = await updateDNSRecords();
      const accessResults = await updateAccessPolicies();

      const dnsUpdated = dnsResults.filter((r) => r.success && r.oldIP !== r.newIP);
      const dnsUnchanged = dnsResults.filter((r) => r.success && r.oldIP === r.newIP);
      const dnsFailed = dnsResults.filter((r) => !r.success);

      const accessUpdated = accessResults.filter((r) => r.success && r.oldIP !== r.newIP);
      const accessUnchanged = accessResults.filter((r) => r.success && r.oldIP === r.newIP);
      const accessFailed = accessResults.filter((r) => !r.success);

      if (dnsUpdated.length > 0) {
        console.log(chalk.green(`\n✓ Updated ${dnsUpdated.length} DNS record(s)`));
      }
      if (dnsUnchanged.length > 0) {
        console.log(chalk.gray(`  ${dnsUnchanged.length} DNS record(s) unchanged`));
      }
      if (dnsFailed.length > 0) {
        console.log(chalk.red(`\n✗ Failed to update ${dnsFailed.length} DNS record(s)`));
        dnsFailed.forEach((r) => {
          console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
        });
      }

      if (accessUpdated.length > 0) {
        console.log(chalk.green(`\n✓ Updated ${accessUpdated.length} Access policy/policies`));
      }
      if (accessUnchanged.length > 0) {
        console.log(chalk.gray(`  ${accessUnchanged.length} Access policy/policies unchanged`));
      }
      if (accessFailed.length > 0) {
        console.log(
          chalk.red(`\n✗ Failed to update ${accessFailed.length} Access policy/policies`)
        );
        accessFailed.forEach((r) => {
          console.log(chalk.red(`  - ${r.policyName}: ${r.error}`));
        });
      }

      nextCheck = Date.now() + intervalMs;
      if (isRunning) {
        console.log(
          chalk.gray(
            `\nNext check in ${interval} minute(s) at ${new Date(nextCheck).toLocaleTimeString()}...\n`
          )
        );
      }
    }
  }

  // Cleanup
  if (isTTY) {
    process.stdin.removeListener('data', keyListener);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  console.log(chalk.yellow('\n✓ Monitoring stopped.\n'));
}

/**
 * Performs a single DNS update check
 */
export async function runSingleUpdate(): Promise<void> {
  console.log(chalk.bold.cyan('\n🔄 Checking for IP changes...\n'));

  const dnsResults = await updateDNSRecords();
  const accessResults = await updateAccessPolicies();

  const dnsUpdated = dnsResults.filter((r) => r.success && r.oldIP !== r.newIP);
  const dnsUnchanged = dnsResults.filter((r) => r.success && r.oldIP === r.newIP);
  const dnsFailed = dnsResults.filter((r) => !r.success);

  const accessUpdated = accessResults.filter((r) => r.success && r.oldIP !== r.newIP);
  const accessUnchanged = accessResults.filter((r) => r.success && r.oldIP === r.newIP);
  const accessFailed = accessResults.filter((r) => !r.success);

  console.log(chalk.bold.cyan('\n📊 Update Summary:\n'));

  if (dnsUpdated.length > 0) {
    console.log(chalk.green(`✓ Updated ${dnsUpdated.length} DNS record(s):`));
    dnsUpdated.forEach((r) => {
      console.log(
        chalk.green(`  - ${r.recordName}: ${chalk.red(r.oldIP)} → ${chalk.green(r.newIP)}`)
      );
    });
    console.log();
  }

  if (dnsUnchanged.length > 0) {
    console.log(chalk.gray(`  ${dnsUnchanged.length} DNS record(s) unchanged\n`));
  }

  if (dnsFailed.length > 0) {
    console.log(chalk.red(`✗ Failed to update ${dnsFailed.length} DNS record(s):`));
    dnsFailed.forEach((r) => {
      console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
    });
    console.log();
  }

  if (accessUpdated.length > 0) {
    console.log(chalk.green(`✓ Updated ${accessUpdated.length} Access policy/policies:`));
    accessUpdated.forEach((r) => {
      console.log(
        chalk.green(`  - ${r.policyName}: ${chalk.red(r.oldIP)} → ${chalk.green(r.newIP)}`)
      );
    });
    console.log();
  }

  if (accessUnchanged.length > 0) {
    console.log(chalk.gray(`  ${accessUnchanged.length} Access policy/policies unchanged\n`));
  }

  if (accessFailed.length > 0) {
    console.log(chalk.red(`✗ Failed to update ${accessFailed.length} Access policy/policies:`));
    accessFailed.forEach((r) => {
      console.log(chalk.red(`  - ${r.policyName}: ${r.error}`));
    });
    console.log();
  }
}
