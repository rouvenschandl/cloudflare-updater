import { select, confirm, password } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { CloudflareService, type Zone } from './cloudflare.js';
import { saveConfig, loadConfig } from './config.js';

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
 * Performs the initial setup
 */
export async function runSetup(): Promise<void> {
  try {
    // 1. Request API Key
    const apiKey = await promptForApiKey();

    // 2. Initialize Cloudflare Service
    const cfService = new CloudflareService(apiKey);

    // 3. Fetch and display zones
    const selectedZone = await promptForZone(cfService);

    // 4. Save configuration
    const shouldSave = await confirm({
      message: `Do you want to save this configuration?\n  Zone: ${chalk.cyan(selectedZone.name)}`,
      default: true,
    });

    if (shouldSave) {
      await saveConfig({
        apiKey,
        zoneId: selectedZone.id,
        zoneName: selectedZone.name,
      });

      console.log(chalk.green('\n✓ Configuration saved successfully!\n'));
    } else {
      console.log(chalk.yellow('\n⚠ Configuration was not saved.\n'));
    }

    // 5. Display zone information
    console.log(chalk.bold.cyan('\n📍 Selected Zone:\n'));
    console.log(`  ${chalk.bold('Name:')}   ${selectedZone.name}`);
    console.log(`  ${chalk.bold('ID:')}     ${selectedZone.id}`);
    console.log(`  ${chalk.bold('Status:')} ${selectedZone.status}\n`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
    }
    throw error;
  }
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

  console.log(chalk.bold.cyan('\n⚙️  Current Configuration:\n'));
  console.log(`  ${chalk.bold('Zone:')}     ${config.zoneName || 'Not set'}`);
  console.log(`  ${chalk.bold('Zone ID:')} ${config.zoneId || 'Not set'}`);
  console.log(`  ${chalk.bold('API Key:')} ${chalk.gray('*'.repeat(20))}\n`);
}
