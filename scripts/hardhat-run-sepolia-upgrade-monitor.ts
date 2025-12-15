/**
 * Hardhat wrapper for the Sepolia upgrade monitor
 * Run with: npx hardhat run scripts/hardhat-run-sepolia-upgrade-monitor.ts --network sepolia
 */

import chalk from 'chalk';

async function main() {
	console.log(chalk.blue('🔄 Starting Sepolia Diamond upgrade and monitoring...'));

	try {
		// Execute the upgrade monitoring script
		console.log(chalk.cyan('📡 Initializing upgrade monitoring system...'));

		// Import and run the upgrade monitoring function
		const { runSepoliaUpgradeMonitoring } = await import('./monitor-sepolia-upgrade');
		await runSepoliaUpgradeMonitoring();
	} catch (error) {
		console.error(chalk.red('❌ Upgrade monitoring failed:'), error);
		process.exit(1);
	}
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
