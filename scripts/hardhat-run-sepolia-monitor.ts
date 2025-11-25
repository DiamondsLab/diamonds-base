/**
 * Hardhat wrapper for the Sepolia deployment monitor
 * Run with: npx hardhat run scripts/hardhat-run-sepolia-monitor.ts --network sepolia
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

async function main() {
	console.log(chalk.blue('🚀 Starting Sepolia deployment and monitoring...'));

	try {
		// Execute the monitoring script using ts-node within Hardhat context
		console.log(chalk.cyan('📡 Initializing monitoring system...'));

		// Import and run the monitoring function
		const { runSepoliaMonitoring } = await import('./monitor-sepolia-deployment');
		await runSepoliaMonitoring();
	} catch (error) {
		console.error(chalk.red('❌ Deployment monitoring failed:'), error);
		process.exit(1);
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
