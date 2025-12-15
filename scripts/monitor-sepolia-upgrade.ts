#!/usr/bin/env npx ts-node

/**
 * Comprehensive Sepolia Upgrade and Monitoring Script
 *
 * This script demonstrates the complete lifecycle of:
 * 1. Loading existing ExampleDiamond from Sepolia testnet
 * 2. Real-time monitoring during upgrade process
 * 3. Upgrading with ExampleUpgradeFacet addition
 * 4. Post-upgrade health checks and diagnostics
 * 5. Validation of new facet functionality
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
import { RPCDiamondDeployer, RPCDiamondDeployerConfig } from './setup/RPCDiamondDeployer';

// Load environment variables
dotenv.config();

/**
 * Configuration for the upgrade monitoring process
 * Extends RPCDiamondDeployerConfig to ensure proper configuration hierarchy
 */
interface UpgradeMonitoringConfig extends RPCDiamondDeployerConfig {
	pollingInterval: number;
	alertThresholds: {
		maxResponseTime: number;
		maxFailedChecks: number;
	};
	expectedNewFacets: string[];
	expectedNewSelectors: string[];
	upgradeConfigPath: string;
}

/**
 * Get configuration from environment variables
 */
function getConfig(): UpgradeMonitoringConfig {
	const diamondName = process.env.DIAMOND_NAME || 'ExampleDiamond';
	const networkName = process.env.NETWORK_NAME || 'sepolia';
	const upgradeConfigPath = `diamonds/${diamondName}/examplediamond.config.json`;

	const config: UpgradeMonitoringConfig = {
		diamondName,
		networkName,
		chainId: parseInt(process.env.CHAIN_ID || '11155111'),
		rpcUrl: process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || '',
		privateKey: process.env.PRIVATE_KEY || '',
		verbose: true,
		gasLimitMultiplier: 1.2,
		maxRetries: 3,
		retryDelayMs: 2000,
		writeDeployedDiamondData: true,
		pollingInterval: 5000,
		alertThresholds: {
			maxResponseTime: 2000,
			maxFailedChecks: 3,
		},
		expectedNewFacets: ['ExampleUpgradeFacet'],
		expectedNewSelectors: ['0xc52046de', '0x034899bc', '0xd3ce6863'], // isDeployed, getSelector, getMonitorData
		upgradeConfigPath,
		// Set the configFilePath to point to our upgrade configuration
		configFilePath: upgradeConfigPath,
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
	config: UpgradeMonitoringConfig,
): Promise<{ provider: ethers.JsonRpcProvider; signer: ethers.Wallet }> {
	console.log(chalk.blue('🔗 Initializing provider connection...'));

	const provider = new ethers.JsonRpcProvider(config.rpcUrl);
	const signer = new ethers.Wallet(config.privateKey, provider);

	try {
		const network = await provider.getNetwork();
		const blockNumber = await provider.getBlockNumber();
		const balance = await signer.provider!.getBalance(signer.address);

		console.log(chalk.green(`✅ Connected to ${network.name} (${network.chainId})`));
		console.log(chalk.green(`📦 Latest block: ${blockNumber}`));
		console.log(chalk.green(`💰 Signer balance: ${ethers.formatEther(balance)} ETH`));

		if (Number(network.chainId) !== config.chainId) {
			throw new Error(
				`Chain ID mismatch: expected ${config.chainId}, got ${network.chainId}`,
			);
		}

		return { provider, signer };
	} catch (error) {
		console.error(chalk.red('❌ Failed to connect to provider:'), error);
		throw error;
	}
}

/**
 * Load existing Diamond from deployment data
 */
async function loadExistingDiamond(config: UpgradeMonitoringConfig): Promise<Diamond> {
	console.log(chalk.blue('📋 Loading existing Diamond from deployment...'));

	// Create a copy of config for loading existing diamond (use default config path, not upgrade path)
	const loadConfig: UpgradeMonitoringConfig = {
		...config,
		configFilePath: undefined, // Let it use the default config file for loading existing diamond
	};

	const deployer = await RPCDiamondDeployer.getInstance(loadConfig);
	const diamond = await deployer.getDiamond();

	const deployedData = diamond.getDeployedDiamondData();

	if (!deployedData.DiamondAddress) {
		throw new Error(
			`No deployment found for ${config.diamondName} on ${config.networkName}`,
		);
	}

	console.log(chalk.green('✅ Diamond loaded successfully!'));
	console.log(`   📍 Address: ${deployedData.DiamondAddress}`);
	console.log(
		`   📋 Current Protocol Version: ${deployedData.protocolVersion || 'Unknown'}`,
	);
	console.log(
		`   🔧 Deployed Facets: ${Object.keys(deployedData.DeployedFacets || {}).length}`,
	);

	// Log current facets
	const facets = deployedData.DeployedFacets || {};
	Object.entries(facets).forEach(([name, data]: [string, any]) => {
		console.log(
			`     - ${name}: ${data.address} (${data.funcSelectors?.length || 0} selectors)`,
		);
	});

	return diamond;
}

/**
 * Initialize monitoring for the Diamond
 */
async function initializeMonitoring(
	diamond: Diamond,
	provider: ethers.JsonRpcProvider,
	config: UpgradeMonitoringConfig,
): Promise<{
	monitor: DiamondMonitor;
	facetManager: FacetManager;
	eventHandlers: EventHandlers;
}> {
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
	const eventHandlers = new EventHandlers(console as any);

	console.log(chalk.green('✅ Monitoring initialized'));
	console.log(`   🔄 Polling interval: ${config.pollingInterval}ms`);
	console.log(`   ⚡ Max response time: ${config.alertThresholds.maxResponseTime}ms`);
	console.log(`   🔥 Max failed checks: ${config.alertThresholds.maxFailedChecks}`);

	return { monitor, facetManager, eventHandlers };
}

/**
 * Capture pre-upgrade state for comparison
 */
async function capturePreUpgradeState(
	monitor: DiamondMonitor,
	facetManager: FacetManager,
): Promise<any> {
	console.log(chalk.blue('📸 Capturing pre-upgrade state...'));

	const preState = {
		timestamp: Date.now(),
		healthStatus: await monitor.getHealthStatus(),
		facets: await facetManager.listFacets(),
		analysis: null as any,
	};

	preState.analysis = await facetManager.analyzeFacets(preState.facets);

	console.log(chalk.cyan('📊 Pre-Upgrade State:'));
	console.log(`   💚 Health: ${preState.healthStatus.isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
	console.log(`   🔧 Facets: ${preState.facets.length}`);
	console.log(`   📊 Total Selectors: ${preState.analysis.totalSelectors}`);
	console.log(`   ⚠️  Conflicts: ${preState.analysis.conflicts.length}`);

	return preState;
}

/**
 * Set up real-time event monitoring for upgrade
 */
function setupUpgradeEventMonitoring(
	monitor: DiamondMonitor,
	eventHandlers: EventHandlers,
	config: UpgradeMonitoringConfig,
): Promise<ParsedDiamondCutEvent[]> {
	return new Promise((resolve) => {
		console.log(chalk.blue('👂 Setting up real-time upgrade event monitoring...'));

		const capturedEvents: ParsedDiamondCutEvent[] = [];
		let upgradeDetected = false;

		const eventEmitter = monitor.trackEvents();

		eventEmitter.on('facetChanged', (event: ParsedDiamondCutEvent) => {
			console.log(chalk.magenta('🔄 Diamond Cut Event Detected:'));
			console.log(`   📝 Transaction: ${event.transactionHash}`);
			console.log(`   📦 Block: ${event.blockNumber}`);

			// Capture the event
			capturedEvents.push(event);

			// Analyze the cut impact
			const analysis = eventHandlers.analyzeCutImpact(event);

			console.log(`   📊 Summary: ${analysis.summary}`);
			console.log(`   ⚠️  Severity: ${analysis.severity}`);
			console.log(`   💥 Details: ${analysis.details.join(', ')}`);

			// Check if this includes our expected new facet
			if (event.changes && event.changes.length > 0) {
				console.log(`   🔧 Changes:`);
				event.changes.forEach((change: any, idx: number) => {
					console.log(
						`     ${idx + 1}. ${change.action} - ${change.facetAddress} (${change.functionSelectors?.length || 0} selectors)`,
					);

					// Check for ExampleUpgradeFacet addition
					if (
						change.action === 'Add' &&
						config.expectedNewSelectors.some((selector) =>
							change.functionSelectors?.includes(selector),
						)
					) {
						console.log(chalk.green('🎉 ExampleUpgradeFacet detected in upgrade!'));
						upgradeDetected = true;
					}
				});
			}

			// Resolve after detecting the upgrade
			if (upgradeDetected) {
				setTimeout(() => {
					console.log(chalk.green('✅ Upgrade monitoring completed'));
					resolve(capturedEvents);
				}, 2000);
			}
		});

		eventEmitter.on('healthIssue', (issue: any) => {
			console.log(chalk.red('🚨 Health Issue During Upgrade:'));
			console.log(`   🏷️  Type: ${issue.type}`);
			console.log(`   📋 Message: ${issue.message}`);
			console.log(`   ⚠️  Severity: ${issue.severity}`);
			console.log(`   🕐 Timestamp: ${new Date(issue.timestamp).toISOString()}`);
		});

		eventEmitter.on('error', (error: Error) => {
			console.error(chalk.red('❌ Monitoring Error:'), error);
		});

		console.log(chalk.green('✅ Event monitoring active for upgrade'));
	});
}

/**
 * Execute the upgrade process using the proper RPC upgrade script
 */
async function executeUpgrade(config: UpgradeMonitoringConfig): Promise<void> {
	console.log(chalk.blue('🚀 Executing Diamond upgrade...'));

	// Debug: Log the configuration file path being used
	console.log(chalk.yellow('🐛 Debug: Configuration details:'));
	console.log(`   📄 Config File Path: ${config.configFilePath}`);
	console.log(`   📄 Upgrade Config Path: ${config.upgradeConfigPath}`);

	// Verify the config file exists
	const fs = require('fs');
	if (fs.existsSync(config.configFilePath!)) {
		console.log(chalk.green(`   ✅ Config file exists: ${config.configFilePath}`));
		// Log the config file content
		const configContent = JSON.parse(fs.readFileSync(config.configFilePath!, 'utf8'));
		console.log(`   📋 Protocol Version in config: ${configContent.protocolVersion}`);
		console.log(
			`   🔧 Facets in config: ${Object.keys(configContent.facets || {}).join(', ')}`,
		);
	} else {
		console.log(chalk.red(`   ❌ Config file does NOT exist: ${config.configFilePath}`));
	}

	// Import the upgrade function from the upgrade-rpc script
	const { createRPCConfig } = await import('./deploy/rpc/common');

	// Create RPC config for the upgrade
	const upgradeConfig = createRPCConfig({
		diamondName: config.diamondName,
		networkName: config.networkName,
		rpcUrl: config.rpcUrl,
		privateKey: config.privateKey,
		verbose: true,
		configPath: config.configFilePath, // Use the upgrade config path
	});

	const deployer = await RPCDiamondDeployer.getInstance(upgradeConfig);

	// Get diamond instance for analysis
	const diamond = await deployer.getDiamond();

	// Perform upgrade analysis
	console.log(chalk.blue('\n📊 Analyzing upgrade requirements...'));
	await analyzeUpgrade(diamond);

	console.log(chalk.yellow('📋 Upgrade Configuration:'));
	console.log(`   💎 Diamond Name: ${config.diamondName}`);
	console.log(`   🌐 Network: ${config.networkName}`);
	console.log(`   ⛓️  Chain ID: ${config.chainId}`);
	console.log(`   📄 Config File: ${config.configFilePath}`);
	console.log(`   🔧 Expected New Facets: ${config.expectedNewFacets.join(', ')}`);

	const startTime = Date.now();

	// Execute the upgrade using the proper upgrade logic
	console.log(chalk.blue(`\n🚀 Starting upgrade of diamond "${config.diamondName}"...`));
	const upgradedDiamond = await deployer.deployDiamond();

	const duration = (Date.now() - startTime) / 1000;

	console.log(chalk.green('✅ Upgrade execution completed!'));
	console.log(`   ⏱️  Duration: ${duration}s`);
	console.log(`   📈 Status: ${deployer.getDeploymentStatus()}`);
}

/**
 * Analyzes what will be upgraded (copied from upgrade-rpc.ts)
 */
async function analyzeUpgrade(diamond: any): Promise<void> {
	try {
		const deployedData = diamond.getDeployedDiamondData();
		const currentVersion = deployedData.protocolVersion || 0;
		const config = diamond.getDeployConfig();
		const targetVersion = config.protocolVersion || 0;

		console.log(
			`💎 Diamond Address: ${chalk.white(deployedData.DiamondAddress || 'Not deployed')}`,
		);
		console.log(`📋 Current Protocol Version: ${chalk.white(currentVersion)}`);
		console.log(`🎯 Target Protocol Version: ${chalk.white(targetVersion)}`);

		if (currentVersion === targetVersion) {
			console.log(chalk.yellow('⚠️  No upgrade needed - versions are identical'));
			return;
		}

		const facetsConfig = config.facets || {};
		const deployedFacets = deployedData.DeployedFacets || {};

		let newFacets = 0;
		let updatedFacets = 0;
		let removedFacets = 0;

		const newFacetNames: string[] = [];
		const updatedFacetNames: string[] = [];
		const removedFacetNames: string[] = [];

		// Count new and updated facets
		Object.keys(facetsConfig).forEach((facetName) => {
			if (!deployedFacets[facetName]) {
				newFacets++;
				newFacetNames.push(facetName);
			} else {
				const deployedVersion = deployedFacets[facetName].version || 0;
				const availableVersions = Object.keys(facetsConfig[facetName].versions || {}).map(
					Number,
				);
				const targetFacetVersion = Math.max(...availableVersions, 0);

				if (targetFacetVersion > deployedVersion) {
					updatedFacets++;
					updatedFacetNames.push(facetName);
				}
			}
		});

		// Count removed facets
		Object.keys(deployedFacets).forEach((facetName) => {
			if (!facetsConfig[facetName] && facetName !== 'DiamondCutFacet') {
				removedFacets++;
				removedFacetNames.push(facetName);
			}
		});

		console.log(chalk.blue('\n🔄 Upgrade Plan:'));
		console.log(
			`📦 New Facets: ${chalk.white(newFacets)} ${newFacetNames.length > 0 ? `(${newFacetNames.join(', ')})` : ''}`,
		);
		console.log(
			`🔄 Updated Facets: ${chalk.white(updatedFacets)} ${updatedFacetNames.length > 0 ? `(${updatedFacetNames.join(', ')})` : ''}`,
		);
		console.log(
			`🗑️  Removed Facets: ${chalk.white(removedFacets)} ${removedFacetNames.length > 0 ? `(${removedFacetNames.join(', ')})` : ''}`,
		);
	} catch (error) {
		console.log(
			chalk.yellow(`⚠️  Unable to perform detailed analysis: ${(error as Error).message}`),
		);
	}
}

/**
 * Validate new facet functionality
 */
async function validateNewFacetFunctionality(
	diamond: Diamond,
	provider: ethers.JsonRpcProvider,
	signer: ethers.Wallet,
	config: UpgradeMonitoringConfig,
): Promise<void> {
	console.log(chalk.blue('🧪 Validating ExampleUpgradeFacet functionality...'));

	const deployedData = diamond.getDeployedDiamondData();
	const diamondContract = new ethers.Contract(
		deployedData.DiamondAddress!,
		[
			'function isDeployed() external pure returns (bool)',
			'function getSelector() external pure returns (bytes4)',
			'function getMonitorData() external pure returns (string memory)',
		],
		signer,
	);

	try {
		console.log(chalk.cyan('🔍 Testing ExampleUpgradeFacet functions:'));

		// Test isDeployed()
		console.log('   1. Testing isDeployed()...');
		const isDeployed = await diamondContract.isDeployed();
		console.log(`      ✅ Result: ${isDeployed} (expected: true)`);
		if (!isDeployed) {
			throw new Error('isDeployed() returned false');
		}

		// Test getSelector()
		console.log('   2. Testing getSelector()...');
		const selector = await diamondContract.getSelector();
		console.log(`      ✅ Result: ${selector} (expected: 0x034899bc)`);
		if (selector !== '0x034899bc') {
			console.log(
				chalk.yellow(`      ⚠️  Selector mismatch: got ${selector}, expected 0x034899bc`),
			);
		}

		// Test getMonitorData()
		console.log('   3. Testing getMonitorData()...');
		const monitorData = await diamondContract.getMonitorData();
		console.log(`      ✅ Result: "${monitorData}"`);
		if (!monitorData.includes('ExampleUpgradeFacet')) {
			throw new Error('getMonitorData() did not return expected content');
		}

		console.log(chalk.green('🎉 All ExampleUpgradeFacet functions working correctly!'));
	} catch (error) {
		console.error(chalk.red('❌ Function validation failed:'), error);
		throw error;
	}
}

/**
 * Perform comprehensive post-upgrade health checks
 */
async function performPostUpgradeHealthChecks(
	monitor: DiamondMonitor,
	facetManager: FacetManager,
	preState: any,
	config: UpgradeMonitoringConfig,
): Promise<void> {
	console.log(chalk.blue('🏥 Performing post-upgrade health checks...'));

	try {
		// Get current health status
		const healthStatus = await monitor.getHealthStatus();

		console.log(chalk.cyan('📊 Post-Upgrade Health Check Results:'));
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

		// Get current facet information
		const currentFacets = await facetManager.listFacets();
		console.log(
			chalk.cyan(`🔧 Post-Upgrade Facet Analysis (${currentFacets.length} facets):`),
		);

		currentFacets.forEach((facet, idx: number) => {
			const isNew = !preState.facets.some(
				(preFacet: any) => preFacet.address === facet.address,
			);
			const indicator = isNew ? '🆕' : '   ';
			console.log(
				`   ${indicator}${idx + 1}. ${facet.name || 'Unknown'} (${facet.address})`,
			);
			console.log(`      📋 Selectors: ${facet.selectors.length}`);
		});

		// Perform upgrade-specific analysis
		const currentAnalysis = await facetManager.analyzeFacets(currentFacets);
		console.log(chalk.cyan('🔬 Upgrade Impact Analysis:'));
		console.log(
			`   📊 Total Selectors: ${currentAnalysis.totalSelectors} (+${currentAnalysis.totalSelectors - preState.analysis.totalSelectors})`,
		);
		console.log(
			`   🔧 Total Facets: ${currentAnalysis.totalFacets} (+${currentAnalysis.totalFacets - preState.analysis.totalFacets})`,
		);
		console.log(`   🏷️  Conflicts Found: ${currentAnalysis.conflicts.length}`);

		if (currentAnalysis.details.largestFacet) {
			console.log(
				`   🏆 Largest Facet: ${currentAnalysis.details.largestFacet.name} (${currentAnalysis.details.largestFacet.selectorCount} selectors)`,
			);
		}

		// Validate expected new selectors are present
		const allSelectors = currentFacets.flatMap((facet) => facet.selectors);
		const missingSelectors = config.expectedNewSelectors.filter(
			(selector) => !allSelectors.includes(selector),
		);

		if (missingSelectors.length === 0) {
			console.log(chalk.green('✅ All expected new selectors are present'));
		} else {
			console.log(
				chalk.red(`❌ Missing expected selectors: ${missingSelectors.join(', ')}`),
			);
			throw new Error('Upgrade validation failed: missing expected selectors');
		}

		if (currentAnalysis.conflicts.length > 0) {
			console.log(`   ⚠️  Conflicts:`);
			currentAnalysis.conflicts.forEach((conflict, idx: number) => {
				console.log(
					`     ${idx + 1}. Selector ${conflict.selector} conflicts with ${conflict.existingFacet}`,
				);
			});
		}
	} catch (error) {
		console.error(chalk.red('❌ Post-upgrade health check failed:'), error);
		throw error;
	}
}

/**
 * Main execution function for upgrade monitoring
 */
export async function runSepoliaUpgradeMonitoring(): Promise<void> {
	try {
		console.log(chalk.bold.blue('🔄 Sepolia Diamond Upgrade & Monitoring\n'));

		// Step 1: Get configuration
		const config = getConfig();
		console.log(chalk.green('✅ Configuration loaded'));

		// Step 2: Initialize provider and signer
		const { provider, signer } = await initializeProvider(config);

		// Step 3: Load existing Diamond
		const diamond = await loadExistingDiamond(config);

		// Step 4: Initialize monitoring
		const { monitor, facetManager, eventHandlers } = await initializeMonitoring(
			diamond,
			provider,
			config,
		);

		// Step 5: Capture pre-upgrade state
		const preState = await capturePreUpgradeState(monitor, facetManager);

		// Step 6: Start monitoring and set up event listeners
		console.log(chalk.blue('🚀 Starting upgrade monitoring...'));
		monitor.startMonitoring();

		const upgradeEventPromise = setupUpgradeEventMonitoring(monitor, eventHandlers, config);

		// Step 7: Execute the upgrade
		await executeUpgrade(config);

		// Step 8: Wait for upgrade events to be captured
		console.log(chalk.yellow('⏳ Waiting for upgrade events...'));
		const upgradeEvents = await upgradeEventPromise;

		console.log(chalk.green(`✅ Captured ${upgradeEvents.length} upgrade event(s)`));

		// Step 9: Wait a bit for the upgrade to settle
		console.log(chalk.yellow('⏳ Allowing upgrade to settle...'));
		await new Promise((resolve) => setTimeout(resolve, 10000));

		// Step 10: Validate new facet functionality
		await validateNewFacetFunctionality(diamond, provider, signer, config);

		// Step 11: Perform comprehensive post-upgrade health checks
		await performPostUpgradeHealthChecks(monitor, facetManager, preState, config);

		// Step 12: Keep monitoring for a bit longer
		console.log(chalk.blue('👀 Continuing monitoring for 30 seconds...'));
		await new Promise((resolve) => setTimeout(resolve, 30000));

		console.log(chalk.green('\n✅ Upgrade monitoring completed successfully!'));
		console.log(chalk.yellow('💡 ExampleUpgradeFacet has been added and validated'));

		// Stop monitoring
		monitor.stopMonitoring();
	} catch (error) {
		console.error(chalk.red('\n❌ Error during upgrade monitoring:'), error);
		throw error;
	}
}

// Execute if run directly
if (require.main === module) {
	runSepoliaUpgradeMonitoring().catch(console.error);
}
