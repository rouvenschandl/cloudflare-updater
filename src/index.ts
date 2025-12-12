#!/usr/bin/env node
import chalk from 'chalk';
import { hasConfig } from './config.js';
import { runSetup, showCurrentConfig, showMainMenu } from './setup.js';
import { getPublicIPs } from './ip.js';

/**
 * Displays the IP address in the top right of the terminal
 */
function displayIPHeader(ipv4?: string, ipv6?: string) {
  const terminalWidth = process.stdout.columns || 80;
  const title = '   Cloudflare DNS & Access Updater      ';
  const titleBox = `╔════════════════════════════════════════╗
║${title}║
╚════════════════════════════════════════╝`;

  // Prepare IP display
  let ipDisplay = '';
  if (ipv4) {
    ipDisplay = `IPv4: ${chalk.cyan(ipv4)}`;
  }
  if (ipv6) {
    if (ipDisplay) ipDisplay += ' | ';
    ipDisplay += `IPv6: ${chalk.cyan(ipv6)}`;
  }

  // Calculate padding for right alignment
  const ipLength = ipv4
    ? ipv4.length + 6
    : 0 + (ipv6 ? ipv6.length + 6 : 0) + (ipv4 && ipv6 ? 3 : 0);
  const padding = Math.max(0, terminalWidth - ipLength - 2);

  console.log(chalk.bold.blue(titleBox));
  if (ipDisplay) {
    console.log(' '.repeat(padding) + ipDisplay);
  }
  console.log();
}

async function main() {
  console.clear();

  // Fetch IP address
  const { ipv4, ipv6 } = await getPublicIPs();

  // Display header with IP
  displayIPHeader(ipv4, ipv6);

  try {
    // Check if configuration exists
    if (!hasConfig()) {
      console.log(chalk.yellow('⚠  No configuration found. Starting setup...\n'));
      await runSetup();

      // After setup, show config overview and menu if config was saved
      if (hasConfig()) {
        console.clear();
        displayIPHeader(ipv4, ipv6);
        console.log(chalk.green('✓ Configuration found\n'));
        await showCurrentConfig();
        await showMainMenu();
      }
    } else {
      console.log(chalk.green('✓ Configuration found\n'));
      await showCurrentConfig();
      await showMainMenu();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n✗ Error: ${error.message}\n`));
      process.exit(1);
    }
  }
}

main();
