#!/usr/bin/env npx ts-node

/**
 * Comprehensive Sepolia Deployment and Monitoring Script
 *
 * This script demonstrates the complete lifecycle of:
 * 1. Deploying ExampleDiamond to Sepolia testnet
 * 2. Real-time monitoring during deployment
 * 3. Post-deployment health checks and diagnostics
 * 4. Event tracking and analysis
 */

import { Diamond } from '@diamondslab/diamonds';
import {
	DiamondMonitor,
	DiamondMonitorConfig,
	EventHandlers,
	FacetManager,
	ParsedDiamondCutEvent,
} from '@diamondslab/diamonds-monitor';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { ethers } from 'ethers';
import { createRPCConfig } from './deploy/rpc/common';
import { RPCDiamondDeployer } from './setup/RPCDiamondDeployer';

// Load environment variables
dotenv.config();

/**
 * Configuration for the monitoring and deployment process
 */
interface MonitoringConfig {
	diamondName: string;
	networkName: string;
	chainId: number;
	rpcUrl: string;
	privateKey: string;
	pollingInterval: number;
	alertThresholds: {
		maxResponseTime: number;
		maxFailedChecks: number;
	};
}

/**
 * Get configuration from environment variables
 */
function getConfig(): MonitoringConfig {
	const config: MonitoringConfig = {
		diamondName: process.env.DIAMOND_NAME || 'ExampleDiamond',
		networkName: process.env.NETWORK_NAME || 'sepolia',
		chainId: parseInt(process.env.CHAIN_ID || '11155111'),
		rpcUrl: process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || '',
		privateKey: process.env.PRIVATE_KEY || '',
		pollingInterval: 5000,
		alertThresholds: {
			maxResponseTime: 2000,
			maxFailedChecks: 3,
		},
	};

	// Validation
	if (!config.rpcUrl) {
		throw new Error('RPC_URL or SEPOLIA_RPC_URL must be set in environment');
	}
	if (!config.privateKey) {
		throw new Error('PRIVATE_KEY must be set in environment');
	}

	return config;
}

/**
 * Initialize provider and validate connection
 */
async function initializeProvider(
	config: MonitoringConfig,
): Promise<ethers.JsonRpcProvider> {
	console.log(chalk.blue('🔗 Initializing provider connection...'));

	const provider = new ethers.JsonRpcProvider(config.rpcUrl);

	try {
		const network = await provider.getNetwork();
		const blockNumber = await provider.getBlockNumber();

		console.log(chalk.green(`✅ Connected to ${network.name} (${network.chainId})`));
		console.log(chalk.green(`📦 Latest block: ${blockNumber}`));

		if (Number(network.chainId) !== config.chainId) {
			throw new Error(
				`Chain ID mismatch: expected ${config.chainId}, got ${network.chainId}`,
			);
		}

		return provider;
	} catch (error) {
		console.error(chalk.red('❌ Failed to connect to provider:'), error);
		throw error;
	}
}

/**
 * Deploy Diamond to Sepolia and return Diamond instance
 */
async function deployDiamond(config: MonitoringConfig): Promise<Diamond> {
	console.log(chalk.blue('🚀 Starting Diamond deployment...'));

	const rpcConfig = createRPCConfig({
		diamondName: config.diamondName,
		networkName: config.networkName,
		rpcUrl: config.rpcUrl,
		privateKey: config.privateKey,
		verbose: true,
	});

	const deployer = await RPCDiamondDeployer.getInstance(rpcConfig);

	console.log(chalk.yellow('📋 Deployment Configuration:'));
	console.log(`   💎 Diamond Name: ${config.diamondName}`);
	console.log(`   🌐 Network: ${config.networkName}`);
	console.log(`   ⛓️  Chain ID: ${config.chainId}`);
	console.log(`   🔗 RPC URL: ${config.rpcUrl.substring(0, 50)}...`);

	const startTime = Date.now();
	const diamond = await deployer.deployDiamond();
	const duration = (Date.now() - startTime) / 1000;

	const deployedData = diamond.getDeployedDiamondData();

	console.log(chalk.green('✅ Diamond deployed successfully!'));
	console.log(`   📍 Address: ${deployedData.DiamondAddress}`);
	console.log(`   ⏱️  Duration: ${duration}s`);
	console.log(`   📈 Status: ${deployer.getDeploymentStatus()}`);

	return diamond;
}

/**
 * Initialize monitoring for a deployed Diamond
 */
async function initializeMonitoring(
	diamond: Diamond,
	provider: ethers.JsonRpcProvider,
	config: MonitoringConfig,
): Promise<{ monitor: DiamondMonitor; facetManager: FacetManager }> {
	console.log(chalk.blue('📊 Initializing Diamond monitoring...'));

	const monitorConfig: DiamondMonitorConfig = {
		pollingInterval: config.pollingInterval,
		alertThresholds: config.alertThresholds,
		enableEventLogging: true,
		enableHealthChecks: true,
		fromBlock: 'latest',
	};

	const monitor = new DiamondMonitor(diamond, provider, monitorConfig);
	const facetManager = new FacetManager(diamond, provider);

	console.log(chalk.green('✅ Monitoring initialized'));
	console.log(`   🔄 Polling interval: ${config.pollingInterval}ms`);
	console.log(`   ⚡ Max response time: ${config.alertThresholds.maxResponseTime}ms`);
	console.log(`   🔥 Max failed checks: ${config.alertThresholds.maxFailedChecks}`);

	return { monitor, facetManager };
}

/**
 * Set up real-time event monitoring
 */
function setupEventMonitoring(monitor: DiamondMonitor): void {
	console.log(chalk.blue('👂 Setting up real-time event monitoring...'));

	const eventEmitter = monitor.trackEvents();

	eventEmitter.on('facetChanged', (event: ParsedDiamondCutEvent) => {
		console.log(chalk.magenta('🔄 Facet Changed Event:'));
		console.log(`   📝 Transaction: ${event.transactionHash}`);
		console.log(`   📦 Block: ${event.blockNumber}`);

		// Analyze the cut impact
		const eventHandlers = new EventHandlers(console as any); // Simplified logger for demo
		const analysis = eventHandlers.analyzeCutImpact(event);

		console.log(`   📊 Summary: ${analysis.summary}`);
		console.log(`   ⚠️  Severity: ${analysis.severity}`);
		console.log(`   💥 Details: ${analysis.details.join(', ')}`);

		if (event.changes && event.changes.length > 0) {
			console.log(`   🔧 Changes:`);
			event.changes.forEach((change: any, idx: number) => {
				console.log(
					`     ${idx + 1}. ${change.action} - ${change.facetAddress} (${change.functionSelectors.length} selectors)`,
				);
			});
		}
	});

	eventEmitter.on('healthIssue', (issue: any) => {
		console.log(chalk.red('🚨 Health Issue Detected:'));
		console.log(`   🏷️  Type: ${issue.type}`);
		console.log(`   📋 Message: ${issue.message}`);
		console.log(`   ⚠️  Severity: ${issue.severity}`);
		console.log(`   🕐 Timestamp: ${new Date(issue.timestamp).toISOString()}`);
	});

	eventEmitter.on('error', (error: Error) => {
		console.error(chalk.red('❌ Monitoring Error:'), error);
	});

	console.log(chalk.green('✅ Event monitoring active'));
}

/**
 * Perform comprehensive health checks
 */
async function performHealthChecks(
	monitor: DiamondMonitor,
	facetManager: FacetManager,
): Promise<void> {
	console.log(chalk.blue('🏥 Performing health checks...'));

	try {
		// Get overall health status
		const healthStatus = await monitor.getHealthStatus();

		console.log(chalk.cyan('📊 Health Check Results:'));
		console.log(
			`   💚 Overall Status: ${healthStatus.isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`,
		);
		console.log(`   🕐 Timestamp: ${new Date(healthStatus.timestamp).toISOString()}`);
		console.log(`   ⏱️  Total Time: ${healthStatus.totalTime}ms`);

		if (healthStatus.checks && healthStatus.checks.length > 0) {
			console.log(`   🔍 Individual Checks:`);
			healthStatus.checks.forEach((check, idx: number) => {
				const status =
					check.status === 'passed' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
				console.log(`     ${idx + 1}. ${status} ${check.name}: ${check.message}`);
				if (check.duration) {
					console.log(`        ⏱️ Duration: ${check.duration}ms`);
				}
			});
		}

		// Get facet information using listFacets method
		const facets = await facetManager.listFacets();
		console.log(chalk.cyan(`🔧 Facet Analysis (${facets.length} facets):`));

		facets.forEach((facet, idx: number) => {
			console.log(`   ${idx + 1}. ${facet.name || 'Unknown'} (${facet.address})`);
			console.log(`      📋 Selectors: ${facet.selectors.length}`);
		});

		// Perform analysis using analyzeFacets method
		const analysis = await facetManager.analyzeFacets(facets);
		console.log(chalk.cyan('🔬 Facet Analysis Results:'));
		console.log(`   🏷️  Conflicts Found: ${analysis.conflicts.length}`);
		console.log(`   📊 Total Selectors: ${analysis.totalSelectors}`);
		console.log(`   🔧 Total Facets: ${analysis.totalFacets}`);
		console.log(
			`   📈 Avg Selectors/Facet: ${analysis.averageSelectorsPerFacet.toFixed(2)}`,
		);

		if (analysis.details.largestFacet) {
			console.log(
				`   🏆 Largest Facet: ${analysis.details.largestFacet.name} (${analysis.details.largestFacet.selectorCount} selectors)`,
			);
		}

		if (analysis.conflicts.length > 0) {
			console.log(`   ⚠️  Conflicts:`);
			analysis.conflicts.forEach((conflict, idx: number) => {
				console.log(
					`     ${idx + 1}. Selector ${conflict.selector} conflicts with ${conflict.existingFacet}`,
				);
			});
		}

		if (analysis.details.emptyFacets.length > 0) {
			console.log(`   � Empty Facets: ${analysis.details.emptyFacets.join(', ')}`);
		}
	} catch (error) {
		console.error(chalk.red('❌ Health check failed:'), error);
	}
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
	try {
		console.log(chalk.bold.blue('🎯 Sepolia Diamond Deployment & Monitoring\n'));

		// Step 1: Get configuration
		const config = getConfig();
		console.log(chalk.green('✅ Configuration loaded'));

		// Step 2: Initialize provider
		const provider = await initializeProvider(config);

		// Step 3: Deploy Diamond
		const diamond = await deployDiamond(config);

		// Step 4: Initialize monitoring
		const { monitor, facetManager } = await initializeMonitoring(diamond, provider, config);

		// Step 5: Set up event monitoring
		setupEventMonitoring(monitor);

		// Step 6: Start monitoring
		console.log(chalk.blue('🚀 Starting monitoring...'));
		monitor.startMonitoring();

		// Step 7: Wait a bit for any initial events
		console.log(chalk.yellow('⏳ Waiting for initial events...'));
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// Step 8: Perform health checks
		await performHealthChecks(monitor, facetManager);

		// Step 9: Keep monitoring for a while
		console.log(chalk.blue('👀 Continuing monitoring for 30 seconds...'));
		await new Promise((resolve) => setTimeout(resolve, 30000));

		console.log(chalk.green('\n✅ Monitoring demonstration complete!'));
		console.log(chalk.yellow('💡 Diamond is deployed and ready for use'));
	} catch (error) {
		console.error(chalk.red('\n❌ Error during execution:'), error);
		process.exit(1);
	}
}

// Execute if run directly
if (require.main === module) {
	main().catch(console.error);
}

export { main as runSepoliaMonitoring };
