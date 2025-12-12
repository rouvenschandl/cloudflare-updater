import { select, confirm, password, checkbox, input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { CloudflareService, type Zone, type AccessApp, type AccessPolicy } from './cloudflare.js';
import {
  saveConfig,
  loadConfig,
  deleteConfig,
  hasConfig,
  type AccessPolicyConfig,
} from './config.js';
import { startUpdateLoop, runSingleUpdate } from './updater.js';

interface ZoneConfig {
  zoneId: string;
  zoneName: string;
  selectedRecordIds: string[];
}

/**
 * Prompts the user for the Cloudflare API Key
 */
async function promptForApiKey(): Promise<string> {
  console.log(chalk.bold.cyan('\n🔐 Cloudflare Setup\n'));
  console.log(chalk.gray('You need a Cloudflare API Token with the following permissions:'));
  console.log(chalk.gray('  - Zone:Read'));
  console.log(chalk.gray('  - DNS:Edit'));
  console.log(chalk.gray('  - Firewall:Edit\n'));

  const apiKey = await password({
    message: 'Cloudflare API Token:',
    mask: '*',
  });

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API Token must not be empty');
  }

  return apiKey.trim();
}

/**
 * Shows all available zones and lets the user select one
 */
async function promptForZone(cfService: CloudflareService): Promise<Zone> {
  const spinner = ora('Loading available zones...').start();

  try {
    const zones = await cfService.getZones();
    spinner.succeed(`${zones.length} zone(s) found`);

    if (zones.length === 0) {
      throw new Error('No zones found. Please check your API Token.');
    }

    console.log(chalk.bold.cyan('\n📋 Available Zones:\n'));

    const selectedZoneId = await select({
      message: 'Select a zone:',
      choices: zones.map((zone) => ({
        name: `${zone.name} ${chalk.gray(`(${zone.status})`)}`,
        value: zone.id,
        description: `Zone ID: ${zone.id}`,
      })),
    });

    const selectedZone = zones.find((z) => z.id === selectedZoneId);
    if (!selectedZone) {
      throw new Error('Zone not found');
    }

    return selectedZone;
  } catch (error) {
    spinner.fail('Error loading zones');
    throw error;
  }
}

/**
 * Shows DNS records and lets the user select which ones to update
 */
async function promptForDNSRecords(
  cfService: CloudflareService,
  zoneId: string
): Promise<string[]> {
  const spinner = ora('Loading DNS records...').start();

  try {
    // Fetch A and AAAA records only
    const [aRecords, aaaaRecords] = await Promise.all([
      cfService.getDNSRecords(zoneId, 'A'),
      cfService.getDNSRecords(zoneId, 'AAAA'),
    ]);

    const allRecords = [...aRecords, ...aaaaRecords];
    spinner.succeed(`${allRecords.length} DNS record(s) found`);

    if (allRecords.length === 0) {
      console.log(chalk.yellow('\n⚠ No A or AAAA records found in this zone.\n'));
      return [];
    }

    console.log(chalk.bold.cyan('\n📝 DNS Records:\n'));

    const selectedRecordIds = await checkbox({
      message: 'Select DNS records to update automatically:',
      choices: allRecords.map((record) => ({
        name: `${chalk.cyan(record.name)} ${chalk.gray(`(${record.type})`)} → ${chalk.yellow(record.content)}${record.proxied ? chalk.gray(' [Proxied]') : ''}`,
        value: record.id,
        checked: false,
      })),
      required: true,
    });

    return selectedRecordIds;
  } catch (error) {
    spinner.fail('Error loading DNS records');
    throw error;
  }
}

/**
 * Prompts the user for their Cloudflare Account ID
 */
async function promptForAccountId(): Promise<string> {
  console.log(chalk.bold.cyan('\n🔑 Account ID Required for Access Policies\n'));
  console.log(
    chalk.gray(
      'You can find your Account ID in the Cloudflare dashboard URL or account settings.\n'
    )
  );

  const accountId = await input({
    message: 'Cloudflare Account ID:',
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'Account ID must not be empty';
      }
      return true;
    },
  });

  return accountId.trim();
}

/**
 * Shows all available Access applications and lets the user select one
 */
async function promptForAccessApp(
  cfService: CloudflareService,
  accountId: string
): Promise<AccessApp | null> {
  const spinner = ora('Loading Access applications...').start();

  try {
    const apps = await cfService.getAccessApps(accountId);
    spinner.succeed(`${apps.length} Access application(s) found`);

    if (apps.length === 0) {
      console.log(chalk.yellow('\n⚠ No Access applications found.\n'));
      return null;
    }

    console.log(chalk.bold.cyan('\n🔐 Available Access Applications:\n'));

    const selectedAppId = await select({
      message: 'Select an Access application:',
      choices: apps.map((app) => ({
        name: `${app.name} ${chalk.gray(`(${app.domain})`)}`,
        value: app.id,
        description: `App ID: ${app.id}`,
      })),
    });

    const selectedApp = apps.find((a) => a.id === selectedAppId);
    return selectedApp || null;
  } catch (error) {
    spinner.fail('Error loading Access applications');
    throw error;
  }
}

/**
 * Shows Access policies with IP range includes and lets the user select them
 */
async function promptForAccessPolicies(
  cfService: CloudflareService,
  accountId: string,
  appId: string
): Promise<AccessPolicy[]> {
  const spinner = ora('Loading Access policies...').start();

  try {
    const policies = await cfService.getAccessPolicies(accountId, appId);
    spinner.succeed(`${policies.length} policy/policies with IP range includes found`);

    if (policies.length === 0) {
      console.log(chalk.yellow('\n⚠ No policies with IP range includes found.\n'));
      return [];
    }

    console.log(chalk.bold.cyan('\n📝 Access Policies with IP Range Includes:\n'));

    const selectedPolicyIds = await checkbox({
      message: 'Select policies to update automatically:',
      choices: policies.map((policy) => {
        const ipRanges = policy.include
          .filter((inc) => inc.ip)
          .map((inc) => inc.ip!.ip)
          .join(', ');
        return {
          name: `${chalk.cyan(policy.name)} ${chalk.gray(`(${policy.decision})`)} → ${chalk.yellow(ipRanges)}`,
          value: policy.id,
          checked: false,
        };
      }),
      required: false,
    });

    return policies.filter((p) => selectedPolicyIds.includes(p.id));
  } catch (error) {
    spinner.fail('Error loading Access policies');
    throw error;
  }
}

/**
 * Performs the initial setup
 * @param existingApiKey - Optional API key from existing config (for reconfiguration)
 */
export async function runSetup(existingApiKey?: string): Promise<void> {
  try {
    // 1. Request API Key (or use existing one)
    const apiKey = existingApiKey || (await promptForApiKey());

    // 2. Initialize Cloudflare Service
    const cfService = new CloudflareService(apiKey);

    // 3. Configure zones
    const zones: ZoneConfig[] = [];
    let addMoreZones = true;

    while (addMoreZones) {
      // Fetch and display zones
      const selectedZone = await promptForZone(cfService);

      // Select DNS records to update
      const selectedRecordIds = await promptForDNSRecords(cfService, selectedZone.id);

      if (selectedRecordIds.length > 0) {
        zones.push({
          zoneId: selectedZone.id,
          zoneName: selectedZone.name,
          selectedRecordIds,
        });
        console.log(
          chalk.green(
            `\n✓ ${selectedRecordIds.length} record(s) selected for ${selectedZone.name}\n`
          )
        );
      } else {
        console.log(chalk.yellow(`\n⚠ No records selected for ${selectedZone.name}.\n`));
      }

      addMoreZones = await confirm({
        message: 'Do you want to add another zone?',
        default: false,
      });
    }

    if (zones.length === 0) {
      console.log(chalk.yellow('\n⚠ No zones configured. Exiting setup.\n'));
      return;
    }

    // Calculate total records
    const totalRecords = zones.reduce((sum, zone) => sum + zone.selectedRecordIds.length, 0);

    // 4. Configure Access Policies (optional)
    let accountId: string | undefined;
    const accessPolicies: AccessPolicyConfig[] = [];

    const configureAccess = await confirm({
      message: 'Do you want to configure Access policies?',
      default: false,
    });

    if (configureAccess) {
      // Ask for Account ID
      accountId = await promptForAccountId();

      let addMoreApps = true;

      while (addMoreApps) {
        const selectedApp = await promptForAccessApp(cfService, accountId);

        if (selectedApp) {
          const selectedPolicies = await promptForAccessPolicies(
            cfService,
            accountId,
            selectedApp.id
          );

          if (selectedPolicies.length > 0) {
            selectedPolicies.forEach((policy) => {
              accessPolicies.push({
                appId: selectedApp.id,
                appName: selectedApp.name,
                policyId: policy.id,
                policyName: policy.name,
              });
            });
            console.log(
              chalk.green(
                `\n✓ ${selectedPolicies.length} policy/policies selected for ${selectedApp.name}\n`
              )
            );
          } else {
            console.log(chalk.yellow(`\n⚠ No policies selected for ${selectedApp.name}.\n`));
          }

          addMoreApps = await confirm({
            message: 'Do you want to add another Access application?',
            default: false,
          });
        } else {
          addMoreApps = false;
        }
      }
    }

    // 5. Ask for update interval
    const intervalInput = await input({
      message: 'Update interval in minutes (default: 5):',
      default: '5',
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) {
          return 'Please enter a valid number greater than 0';
        }
        return true;
      },
    });

    const updateInterval = parseInt(intervalInput, 10);

    // 6. Save configuration
    const totalAccessPolicies = accessPolicies.length;
    let confirmMessage = `Do you want to save this configuration?\n  Zones: ${chalk.cyan(zones.length.toString())}\n  DNS Records: ${chalk.cyan(totalRecords.toString())}`;
    if (totalAccessPolicies > 0) {
      confirmMessage += `\n  Access Policies: ${chalk.cyan(totalAccessPolicies.toString())}`;
    }

    const shouldSave = await confirm({
      message: confirmMessage,
      default: true,
    });

    if (shouldSave) {
      await saveConfig({
        apiKey,
        accountId,
        zones,
        accessPolicies: accessPolicies.length > 0 ? accessPolicies : undefined,
        updateInterval,
      });

      console.log(chalk.green('\n✓ Configuration saved successfully!\n'));

      // Display summary
      console.log(chalk.bold.cyan('\n📍 Configured Zones:\n'));
      zones.forEach((zone) => {
        console.log(
          `  ${chalk.cyan('●')} ${chalk.bold(zone.zoneName)} - ${zone.selectedRecordIds.length} record(s)`
        );
      });

      if (accessPolicies.length > 0) {
        console.log(chalk.bold.cyan('\n🔐 Configured Access Policies:\n'));
        const appGroups = accessPolicies.reduce(
          (acc, policy) => {
            if (!acc[policy.appId]) {
              acc[policy.appId] = { appName: policy.appName, policies: [] };
            }
            acc[policy.appId].policies.push(policy.policyName);
            return acc;
          },
          {} as Record<string, { appName: string; policies: string[] }>
        );

        Object.values(appGroups).forEach((group) => {
          console.log(
            `  ${chalk.cyan('●')} ${chalk.bold(group.appName)} - ${group.policies.length} policy/policies`
          );
        });
      }

      console.log();
    } else {
      console.log(chalk.yellow('\n⚠ Configuration was not saved.\n'));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
    }
    throw error;
  }
}

/**
 * Displays detailed information about configured records
 */
export async function showRecordsList(): Promise<void> {
  const config = await loadConfig();

  if (!config || config.zones.length === 0) {
    console.log(chalk.yellow('\n⚠ No configuration found.\n'));
    return;
  }

  console.clear();
  console.log(chalk.bold.cyan('\n📋 Configured DNS Records:\n'));

  const cfService = new CloudflareService(config.apiKey);

  for (const zone of config.zones) {
    console.log(chalk.bold(`\n  Zone: ${chalk.cyan(zone.zoneName)}`));
    console.log(chalk.gray(`  ════════════════════════════════════════\n`));

    const spinner = ora(`Loading records for ${zone.zoneName}...`).start();

    try {
      const [aRecords, aaaaRecords] = await Promise.all([
        cfService.getDNSRecords(zone.zoneId, 'A'),
        cfService.getDNSRecords(zone.zoneId, 'AAAA'),
      ]);

      const allRecords = [...aRecords, ...aaaaRecords];
      const selectedRecords = allRecords.filter((r) => zone.selectedRecordIds.includes(r.id));

      spinner.stop();

      if (selectedRecords.length === 0) {
        console.log(chalk.yellow('    No records configured\n'));
        continue;
      }

      selectedRecords.forEach((record) => {
        const proxiedBadge = record.proxied ? chalk.gray('[Proxied]') : chalk.gray('[DNS Only]');
        const typeBadge = record.type === 'A' ? chalk.blue('[A]   ') : chalk.magenta('[AAAA]');
        console.log(
          `    ${typeBadge} ${chalk.white(record.name.padEnd(30))} → ${chalk.yellow(record.content.padEnd(15))} ${proxiedBadge}`
        );
      });
      console.log();
    } catch (error) {
      spinner.fail(`Failed to load records for ${zone.zoneName}`);
      console.log(
        chalk.red(`    Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
      );
    }
  }

  // Display Access Policies
  if (config.accessPolicies && config.accessPolicies.length > 0 && config.accountId) {
    console.log(chalk.bold.cyan('\n🔐 Configured Access Policies:\n'));

    const appGroups = config.accessPolicies.reduce(
      (acc, policy) => {
        if (!acc[policy.appId]) {
          acc[policy.appId] = { appName: policy.appName, policies: [] };
        }
        acc[policy.appId].policies.push(policy);
        return acc;
      },
      {} as Record<string, { appName: string; policies: AccessPolicyConfig[] }>
    );

    for (const [appId, group] of Object.entries(appGroups)) {
      console.log(chalk.bold(`\n  Application: ${chalk.cyan(group.appName)}`));
      console.log(chalk.gray(`  ════════════════════════════════════════\n`));

      const spinner = ora(`Loading policies for ${group.appName}...`).start();

      try {
        const policies = await cfService.getAccessPolicies(config.accountId, appId);
        const selectedPolicies = policies.filter((p) =>
          group.policies.some((gp) => gp.policyId === p.id)
        );

        spinner.stop();

        if (selectedPolicies.length === 0) {
          console.log(chalk.yellow('    No policies configured\n'));
          continue;
        }

        selectedPolicies.forEach((policy) => {
          const ipRanges = policy.include
            .filter((inc) => inc.ip)
            .map((inc) => inc.ip!.ip)
            .join(', ');
          const decisionBadge =
            policy.decision === 'allow' ? chalk.green('[Allow]') : chalk.red('[Deny]');
          console.log(
            `    ${decisionBadge} ${chalk.white(policy.name.padEnd(30))} → ${chalk.yellow(ipRanges)}`
          );
        });
        console.log();
      } catch (error) {
        spinner.fail(`Failed to load policies for ${group.appName}`);
        console.log(
          chalk.red(`    Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`)
        );
      }
    }
  }

  console.log(chalk.gray('\n  Press any key to continue...'));
  await new Promise<void>((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}

/**
 * Displays the current configuration
 */
export async function showCurrentConfig(): Promise<void> {
  const config = await loadConfig();

  if (!config) {
    console.log(chalk.yellow('\n⚠ No configuration found.\n'));
    return;
  }

  const totalRecords = config.zones.reduce((sum, zone) => sum + zone.selectedRecordIds.length, 0);
  const totalAccessPolicies = config.accessPolicies?.length || 0;
  const updateInterval = config.updateInterval || 5;

  console.log(chalk.bold.cyan('\n⚙️  Current Configuration:\n'));
  console.log(`  ${chalk.bold('Zones:')}    ${config.zones.length}`);
  console.log(`  ${chalk.bold('DNS Records:')} ${totalRecords}`);
  if (totalAccessPolicies > 0) {
    console.log(`  ${chalk.bold('Access Policies:')} ${totalAccessPolicies}`);
  }
  console.log(`  ${chalk.bold('Update Interval:')} ${updateInterval} minute(s)`);
  console.log(`  ${chalk.bold('API Key:')} ${chalk.gray('*'.repeat(20))}`);

  console.log(chalk.bold.cyan('\n  Configured Zones:\n'));
  config.zones.forEach((zone) => {
    console.log(
      `    ${chalk.cyan('●')} ${zone.zoneName.padEnd(30)} - ${zone.selectedRecordIds.length} record(s)`
    );
  });

  if (config.accessPolicies && config.accessPolicies.length > 0) {
    console.log(chalk.bold.cyan('\n  Configured Access Applications:\n'));
    const appGroups = config.accessPolicies.reduce(
      (acc, policy) => {
        if (!acc[policy.appId]) {
          acc[policy.appId] = { appName: policy.appName, policies: [] };
        }
        acc[policy.appId].policies.push(policy.policyName);
        return acc;
      },
      {} as Record<string, { appName: string; policies: string[] }>
    );

    Object.values(appGroups).forEach((group) => {
      console.log(
        `    ${chalk.cyan('●')} ${group.appName.padEnd(30)} - ${group.policies.length} policy/policies`
      );
    });
  }

  console.log();
}

/**
 * Shows the main menu and handles user choices
 */
export async function showMainMenu(): Promise<void> {
  const choice = await select({
    message: 'What would you like to do?',
    choices: [
      { name: '📋 View configured records', value: 'view' },
      { name: '⚙️  Reconfigure zones', value: 'reconfigure' },
      { name: '🔄 Start IP update monitoring', value: 'start' },
      { name: '🗑️  Delete configuration', value: 'delete' },
      { name: '❌ Exit', value: 'exit' },
    ],
  });

  switch (choice) {
    case 'view': {
      await showRecordsList();
      console.clear();
      await showCurrentConfig();
      await showMainMenu();
      break;
    }
    case 'reconfigure': {
      console.clear();
      const config = await loadConfig();
      await runSetup(config?.apiKey);

      // After reconfiguration, show updated config and menu
      if (hasConfig()) {
        const { ipv4, ipv6 } = await import('./ip.js').then((m) => m.getPublicIPs());
        console.clear();

        // Re-import and display header
        const { default: chalk } = await import('chalk');
        const terminalWidth = process.stdout.columns || 80;
        const title = '   Cloudflare DNS & Access Updater      ';
        const titleBox = `╔════════════════════════════════════════╗
║${title}║
╚════════════════════════════════════════╝`;

        let ipDisplay = '';
        if (ipv4) {
          ipDisplay = `IPv4: ${chalk.cyan(ipv4)}`;
        }
        if (ipv6) {
          if (ipDisplay) ipDisplay += ' | ';
          ipDisplay += `IPv6: ${chalk.cyan(ipv6)}`;
        }

        const ipLength = ipv4
          ? ipv4.length + 6
          : 0 + (ipv6 ? ipv6.length + 6 : 0) + (ipv4 && ipv6 ? 3 : 0);
        const padding = Math.max(0, terminalWidth - ipLength - 2);

        console.log(chalk.bold.blue(titleBox));
        if (ipDisplay) {
          console.log(' '.repeat(padding) + ipDisplay);
        }
        console.log();

        console.log(chalk.green('✓ Configuration found\n'));
        await showCurrentConfig();
        await showMainMenu();
      }
      break;
    }
    case 'start': {
      console.clear();

      const updateChoice = await select({
        message: 'DNS Update Options:',
        choices: [
          { name: '🔄 Start automatic monitoring', value: 'auto' },
          { name: '⚡ Run single update check', value: 'once' },
          { name: '⚙️  Change update interval', value: 'interval' },
          { name: '← Back to main menu', value: 'back' },
        ],
      });

      switch (updateChoice) {
        case 'auto': {
          console.clear();
          await startUpdateLoop();
          // After monitoring stops, return to menu
          console.clear();
          await showCurrentConfig();
          await showMainMenu();
          break;
        }
        case 'once': {
          console.clear();
          await runSingleUpdate();
          console.log(chalk.gray('\nPress any key to continue...'));
          await new Promise<void>((resolve) => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
              process.stdin.setRawMode(false);
              process.stdin.pause();
              resolve();
            });
          });
          console.clear();
          await showCurrentConfig();
          await showMainMenu();
          break;
        }
        case 'interval': {
          const config = await loadConfig();
          if (!config) {
            console.log(chalk.red('\n✗ No configuration found.\n'));
            await showMainMenu();
            break;
          }

          const currentInterval = config.updateInterval || 5;
          const intervalInput = await input({
            message: `Update interval in minutes (current: ${currentInterval}):`,
            default: currentInterval.toString(),
            validate: (value) => {
              const num = parseInt(value, 10);
              if (isNaN(num) || num < 1) {
                return 'Please enter a valid number greater than 0';
              }
              return true;
            },
          });

          const newInterval = parseInt(intervalInput, 10);
          config.updateInterval = newInterval;
          await saveConfig(config);

          console.log(chalk.green(`\n✓ Update interval changed to ${newInterval} minute(s)\n`));
          await showMainMenu();
          break;
        }
        case 'back': {
          console.clear();
          await showCurrentConfig();
          await showMainMenu();
          break;
        }
      }
      break;
    }
    case 'delete': {
      const confirmDelete = await confirm({
        message: chalk.red('Are you sure you want to delete the configuration?'),
        default: false,
      });
      if (confirmDelete) {
        await deleteConfig();
        console.log(chalk.green('\n✓ Configuration deleted successfully!\n'));
        process.exit(0);
      } else {
        await showMainMenu();
      }
      break;
    }
    case 'exit': {
      console.log(chalk.cyan('\nGoodbye! 👋\n'));
      process.exit(0);
      break;
    }
  }
}
