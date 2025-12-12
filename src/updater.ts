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

  // Setup keyboard listener with better handling
  const keyListener = (chunk: Buffer) => {
    const str = chunk.toString('utf8');

    // Check for q, Q, or Ctrl+C
    if (str === 'q' || str === 'Q' || str === '\u0003' || str === '\x71' || str === '\x51') {
      isRunning = false;
      console.log(chalk.yellow('\n\nStopping monitoring...\n'));
    }
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', keyListener);

  // Initial update
  console.log(chalk.gray(`[${new Date().toLocaleTimeString()}] Checking for IP changes...\n`));
  const initialResults = await updateDNSRecords();

  const updated = initialResults.filter((r) => r.success && r.oldIP !== r.newIP);
  const unchanged = initialResults.filter((r) => r.success && r.oldIP === r.newIP);
  const failed = initialResults.filter((r) => !r.success);

  if (updated.length > 0) {
    console.log(chalk.green(`\n✓ Updated ${updated.length} record(s)`));
  }
  if (unchanged.length > 0) {
    console.log(chalk.gray(`  ${unchanged.length} record(s) unchanged`));
  }
  if (failed.length > 0) {
    console.log(chalk.red(`\n✗ Failed to update ${failed.length} record(s)`));
    failed.forEach((r) => {
      console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
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
      const results = await updateDNSRecords();

      const updated = results.filter((r) => r.success && r.oldIP !== r.newIP);
      const unchanged = results.filter((r) => r.success && r.oldIP === r.newIP);
      const failed = results.filter((r) => !r.success);

      if (updated.length > 0) {
        console.log(chalk.green(`\n✓ Updated ${updated.length} record(s)`));
      }
      if (unchanged.length > 0) {
        console.log(chalk.gray(`  ${unchanged.length} record(s) unchanged`));
      }
      if (failed.length > 0) {
        console.log(chalk.red(`\n✗ Failed to update ${failed.length} record(s)`));
        failed.forEach((r) => {
          console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
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
  process.stdin.removeListener('data', keyListener);
  process.stdin.setRawMode(false);
  process.stdin.pause();

  console.log(chalk.yellow('\n✓ Monitoring stopped.\n'));
}

/**
 * Performs a single DNS update check
 */
export async function runSingleUpdate(): Promise<void> {
  console.log(chalk.bold.cyan('\n🔄 Checking for IP changes...\n'));

  const results = await updateDNSRecords();

  const updated = results.filter((r) => r.success && r.oldIP !== r.newIP);
  const unchanged = results.filter((r) => r.success && r.oldIP === r.newIP);
  const failed = results.filter((r) => !r.success);

  console.log(chalk.bold.cyan('\n📊 Update Summary:\n'));

  if (updated.length > 0) {
    console.log(chalk.green(`✓ Updated ${updated.length} record(s):`));
    updated.forEach((r) => {
      console.log(
        chalk.green(`  - ${r.recordName}: ${chalk.red(r.oldIP)} → ${chalk.green(r.newIP)}`)
      );
    });
    console.log();
  }

  if (unchanged.length > 0) {
    console.log(chalk.gray(`  ${unchanged.length} record(s) unchanged\n`));
  }

  if (failed.length > 0) {
    console.log(chalk.red(`✗ Failed to update ${failed.length} record(s):`));
    failed.forEach((r) => {
      console.log(chalk.red(`  - ${r.recordName}: ${r.error}`));
    });
    console.log();
  }
}
