#!/usr/bin/env npx ts-node

/**
 * Main deployment script for RPC-based Diamond deployment
 * Deploys example Diamond contracts using RPCDiamondDeployer
 *
 * IMPORTANT: This script requires Hardhat's runtime context.
 * Use one of these methods:
 *
 * 1. Via Hardhat runtime (Recommended):
 *    DIAMOND_NAME=ExampleDiamond npx hardhat run scripts/deploy/rpc/hardhat-run-deploy-rpc.ts --network sepolia
 *
 * 2. Via CLI with --no-use-hardhat-config (Legacy mode, requires explicit RPC URL):
 *    npx ts-node scripts/deploy/rpc/deploy-rpc.ts ExampleDiamond sepolia --no-use-hardhat-config --rpc-url <RPC_URL>
 */

import { RPCDiamondDeployer } from '../../setup/RPCDiamondDeployer';
import {
	DeploymentOptions,
	setupProgram,
	addDeploymentOptions,
	createMainCommand,
	createLegacyCommand,
	createQuickCommand,
	showPreOperationInfo,
	showOperationSummary,
} from './common';
import { deployDiamond } from './deploy-rpc-core';

// Set up CLI program
const program = setupProgram(
	'deploy-rpc',
	'Deploy diamonds using direct RPC communication',
);

// Main command: deploy <diamond-name> <network-name>
createMainCommand(
	program,
	'deploy',
	'Deploy a diamond contract with specified name and network',
	'<diamond-name> <network-name>',
	deployDiamond,
	addDeploymentOptions,
);

// Legacy command: deploy-legacy
createLegacyCommand(
	program,
	'deploy',
	'Deploy a diamond contract',
	deployDiamond,
	addDeploymentOptions,
);

// Quick command: quick
createQuickCommand(
	program,
	'quick',
	'Quick deployment using environment variables',
	async (config, options: DeploymentOptions) => {
		const startTime = Date.now();

		await showPreOperationInfo(config, 'Quick Diamond Deployment');

		const deployer = await RPCDiamondDeployer.getInstance(config);
		const diamond = await deployer.deployDiamond();

		const duration = (Date.now() - startTime) / 1000;
		const deployedData = diamond.getDeployedDiamondData();

		showOperationSummary('Quick Diamond Deployment', duration, {
			'💎 Diamond Address': deployedData.DiamondAddress,
			'📈 Status': deployer.getDeploymentStatus(),
		});
	},
	addDeploymentOptions,
);

// Parse and execute
program.parse(process.argv);
