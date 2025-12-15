#!/usr/bin/env npx ts-node

/**
 * Hardhat wrapper for RPC deployment script
 * Run with: npx hardhat run scripts/deploy/rpc/hardhat-run-deploy-rpc.ts --network <network>
 *
 * This wrapper allows the RPC deployment script to run within Hardhat's runtime context,
 * which is required for accessing hardhat configuration and ethers.
 */

import chalk from 'chalk';

async function main() {
	const args = process.argv.slice(2);

	// Parse arguments: first should be diamond name, second should be network (optional since --network flag is used)
	const diamondName =
		args.find((arg) => !arg.startsWith('--')) ||
		process.env.DIAMOND_NAME ||
		'ExampleDiamond';
	const networkName = process.env.HARDHAT_NETWORK || 'localhost';

	console.log(chalk.blue('🚀 Starting RPC Diamond Deployment via Hardhat...'));
	console.log(chalk.cyan(`📋 Diamond: ${diamondName}`));
	console.log(chalk.cyan(`🌐 Network: ${networkName}`));

	try {
		// Import the deployment module
		const { deployDiamond } = await import('./deploy-rpc-core');

		// Run deployment with options from environment or defaults
		await deployDiamond({
			diamondName,
			networkName,
			force: process.env.FORCE_DEPLOY === 'true',
			skipVerification: process.env.SKIP_VERIFICATION === 'true',
			verbose: process.env.VERBOSE === 'true',
			useHardhatConfig: true,
		});

		console.log(chalk.green('✅ Deployment completed successfully!'));
	} catch (error) {
		console.error(chalk.red('❌ Deployment failed:'), error);
		process.exit(1);
	}
}

// Execute main function
main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
