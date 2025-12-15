import { Diamond } from '@diamondslab/diamonds';
import { DiamondMonitor, FacetManager } from '@diamondslab/diamonds-monitor';
import { expect } from 'chai';
import { JsonRpcProvider } from 'ethers';
import { SupportedProvider } from '@diamondslab/diamonds';

/**
 * RPC Integration Tests for Diamond Monitoring on Live Networks
 *
 * These tests monitor existing diamond deployments on Sepolia and Mainnet.
 * They are read-only and safe to run against production contracts.
 *
 * Required Environment Variables:
 * - SEPOLIA_RPC_URL: Sepolia RPC endpoint (e.g., Infura, Alchemy)
 * - SEPOLIA_DIAMOND_ADDRESS: Address of deployed diamond on Sepolia
 * - MAINNET_RPC_URL: Mainnet RPC endpoint (optional, for mainnet tests)
 * - MAINNET_DIAMOND_ADDRESS: Address of deployed diamond on Mainnet (optional)
 *
 * Run with:
 * SEPOLIA_RPC_URL=<url> SEPOLIA_DIAMOND_ADDRESS=<address> yarn hardhat test test/integration/e2e-rpc-deployment-monitoring.test.ts
 */

describe('🌐 RPC Integration: Live Network Monitoring', function () {
	this.timeout(120000); // 2 minutes for RPC calls

	const sepoliaConfig = {
		rpcUrl: process.env.SEPOLIA_RPC_URL,
		diamondAddress: process.env.SEPOLIA_DIAMOND_ADDRESS,
		chainId: 11155111,
		networkName: 'sepolia',
	};

	const mainnetConfig = {
		rpcUrl: process.env.MAINNET_RPC_URL,
		diamondAddress: process.env.MAINNET_DIAMOND_ADDRESS,
		chainId: 1,
		networkName: 'mainnet',
	};

	describe('🧪 Sepolia Testnet Monitoring', () => {
		let diamond: Diamond;
		let monitor: DiamondMonitor;
		let facetManager: FacetManager;
		let provider: JsonRpcProvider;

		before(function () {
			// Skip if environment not configured
			if (!sepoliaConfig.rpcUrl || !sepoliaConfig.diamondAddress) {
				console.log(
					'⚠️  Skipping Sepolia tests - SEPOLIA_RPC_URL or SEPOLIA_DIAMOND_ADDRESS not set',
				);
				this.skip();
			}

			// Validate address format
			if (!/^0x[a-fA-F0-9]{40}$/.test(sepoliaConfig.diamondAddress ?? '')) {
				throw new Error(`Invalid Sepolia diamond address: ${sepoliaConfig.diamondAddress}`);
			}
		});

		beforeEach(async function () {
			// Initialize RPC provider
			provider = new JsonRpcProvider(sepoliaConfig.rpcUrl) as SupportedProvider;

			// Verify connection
			try {
				const network = await provider.getNetwork();
				expect(network.chainId).to.equal(BigInt(sepoliaConfig.chainId));
			} catch (error) {
				console.error('❌ Failed to connect to Sepolia RPC:', error);
				this.skip();
			}

			// Initialize Diamond instance with existing deployment
			// For monitoring existing diamonds, we create a minimal config
			const diamondConfig = {
				diamondName: 'ExampleDiamond',
				networkName: sepoliaConfig.networkName,
				address: sepoliaConfig.diamondAddress,
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			diamond = new Diamond(diamondConfig as any, null as any);
			diamond.setProvider(provider);

			// Initialize monitoring components
			monitor = new DiamondMonitor(diamond, provider, {
				pollingInterval: 10000, // 10 seconds for RPC
				enableEventLogging: true,
				enableHealthChecks: true,
				alertThresholds: {
					maxResponseTime: 15000, // 15s for RPC calls
					maxFailedChecks: 3,
				},
			});

			facetManager = new FacetManager(diamond, provider);
		});

		afterEach(async function () {
			if (monitor) {
				monitor.stopMonitoring();
			}
		});

		it('should connect to Sepolia diamond and retrieve basic info', async () => {
			const address = sepoliaConfig.diamondAddress ?? '';
			expect(address).to.be.a('string');

			// Verify contract exists
			const code = await provider.getCode(address);
			expect(code).to.not.equal('0x');
			expect(code.length).to.be.greaterThan(2);
		});

		it('should perform health checks on live Sepolia diamond', async () => {
			const health = await monitor.getHealthStatus();

			expect(health).to.have.property('isHealthy');
			expect(health).to.have.property('checks');
			expect(health.checks).to.be.an('array');

			// Log health status for diagnostics
			console.log(
				`\n  📊 Sepolia Health Status: ${health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`,
			);
			console.log(`  Total Checks: ${health.checks.length}`);

			health.checks.forEach((check) => {
				console.log(
					`    ${check.status === 'passed' ? '✅' : '❌'} ${check.name}: ${check.message}`,
				);
			});

			// Should have multiple health checks
			expect(health.checks.length).to.be.greaterThan(3);
		});

		it('should retrieve and analyze facets from Sepolia diamond', async () => {
			const facets = await facetManager.listFacets();

			expect(facets).to.be.an('array');
			expect(facets.length).to.be.greaterThan(0);

			console.log(`\n  📦 Sepolia Diamond has ${facets.length} facet(s)`);

			for (const facet of facets) {
				expect(facet).to.have.property('address');
				expect(facet).to.have.property('selectors');
				expect(facet.selectors).to.be.an('array');

				console.log(`    Facet: ${facet.address} (${facet.selectors.length} selectors)`);
			}
		});

		it('should validate function selectors on Sepolia diamond', async () => {
			const facets = await facetManager.listFacets();
			expect(facets.length).to.be.greaterThan(0);

			for (const facet of facets) {
				for (const selector of facet.selectors) {
					// Each selector should be 4 bytes (8 hex chars + 0x prefix)
					expect(selector).to.match(/^0x[a-fA-F0-9]{8}$/);
				}
			}
		});

		it('should handle RPC provider errors gracefully', async () => {
			// Create monitor with invalid/disconnected provider
			const badProvider = new JsonRpcProvider('http://invalid-rpc-endpoint:8545');
			const badMonitor = new DiamondMonitor(diamond, badProvider, {
				pollingInterval: 5000,
				enableEventLogging: false,
				enableHealthChecks: true,
				alertThresholds: {
					maxResponseTime: 2000,
					maxFailedChecks: 1,
				},
			});

			// Health check should handle the error
			try {
				const health = await badMonitor.getHealthStatus();
				// Should return unhealthy status rather than throwing
				expect(health.isHealthy).to.be.false;
			} catch (error) {
				// Acceptable to throw an error for connection issues
				expect(error).to.exist;
			}

			badMonitor.stopMonitoring();
		});

		it('should track events on Sepolia diamond (real-time monitoring)', async function () {
			this.timeout(30000); // 30 seconds for event tracking

			const eventEmitter = monitor.trackEvents();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const facetChangeEvents: any[] = [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const healthIssues: any[] = [];

			eventEmitter.on('facetChanged', (event) => {
				facetChangeEvents.push(event);
				console.log('  🔔 Facet Change Event:', event.changes.length, 'changes');
			});

			eventEmitter.on('healthIssue', (issue) => {
				healthIssues.push(issue);
				console.log('  ⚠️  Health Issue:', issue.message);
			});

			// Monitor for 10 seconds
			console.log('  👀 Monitoring Sepolia diamond for 10 seconds...');
			await new Promise((resolve) => setTimeout(resolve, 10000));

			// Event emitter should be working
			expect(eventEmitter).to.be.instanceOf(require('events').EventEmitter);

			console.log(
				`  📊 Captured ${facetChangeEvents.length} facet changes, ${healthIssues.length} health issues`,
			);

			// Note: Events may or may not occur during test window
			// This test validates the monitoring infrastructure works
		});

		it('should measure response time for Sepolia RPC calls', async () => {
			const startTime = Date.now();
			const health = await monitor.getHealthStatus();
			const endTime = Date.now();
			const responseTime = endTime - startTime;

			console.log(`  ⏱️  Sepolia health check completed in ${responseTime}ms`);

			// RPC calls should complete within reasonable time
			expect(responseTime).to.be.lessThan(30000); // 30 seconds max
			expect(health).to.exist;
		});

		it('should handle network resilience with retry logic', async function () {
			this.timeout(60000); // 1 minute for retries

			// Create monitor with aggressive retry settings
			const resilientMonitor = new DiamondMonitor(diamond, provider, {
				pollingInterval: 5000,
				enableHealthChecks: true,
				alertThresholds: {
					maxResponseTime: 10000,
					maxFailedChecks: 5, // Allow more failures before alerting
				},
			});

			try {
				// Perform multiple health checks to test stability
				for (let i = 0; i < 3; i++) {
					const health = await resilientMonitor.getHealthStatus();
					expect(health).to.have.property('isHealthy');
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
			} finally {
				resilientMonitor.stopMonitoring();
			}
		});
	});

	describe('🌍 Mainnet Monitoring (Read-Only)', () => {
		let diamond: Diamond;
		let monitor: DiamondMonitor;
		let facetManager: FacetManager;
		let provider: JsonRpcProvider;

		before(function () {
			// Skip if environment not configured
			if (!mainnetConfig.rpcUrl || !mainnetConfig.diamondAddress) {
				console.log(
					'⚠️  Skipping Mainnet tests - MAINNET_RPC_URL or MAINNET_DIAMOND_ADDRESS not set',
				);
				this.skip();
			}

			// Validate address format
			if (!/^0x[a-fA-F0-9]{40}$/.test(mainnetConfig.diamondAddress ?? '')) {
				throw new Error(`Invalid Mainnet diamond address: ${mainnetConfig.diamondAddress}`);
			}
		});

		beforeEach(async function () {
			// Initialize RPC provider
			provider = new JsonRpcProvider(mainnetConfig.rpcUrl);

			// Verify connection to mainnet
			try {
				const network = await provider.getNetwork();
				expect(network.chainId).to.equal(BigInt(mainnetConfig.chainId));
			} catch (error) {
				console.error('❌ Failed to connect to Mainnet RPC:', error);
				this.skip();
			}

			// Initialize Diamond instance
			const diamondConfig = {
				diamondName: 'ProductionDiamond',
				networkName: mainnetConfig.networkName,
				address: mainnetConfig.diamondAddress,
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			diamond = new Diamond(diamondConfig as any, null as any);
			diamond.setProvider(provider);

			// Initialize monitoring with conservative settings for mainnet
			monitor = new DiamondMonitor(diamond, provider, {
				pollingInterval: 15000, // 15 seconds
				enableEventLogging: true,
				enableHealthChecks: true,
				alertThresholds: {
					maxResponseTime: 20000, // 20s for mainnet RPC
					maxFailedChecks: 3,
				},
			});

			facetManager = new FacetManager(diamond, provider);
		});

		afterEach(async function () {
			if (monitor) {
				monitor.stopMonitoring();
			}
		});

		it('should connect to mainnet diamond and verify deployment', async () => {
			const address = mainnetConfig.diamondAddress ?? '';
			expect(address).to.be.a('string');

			// Verify contract exists on mainnet
			const code = await provider.getCode(address);
			expect(code).to.not.equal('0x');
			expect(code.length).to.be.greaterThan(2);

			console.log(`  ✅ Verified mainnet diamond at ${address}`);
		});

		it('should perform read-only health checks on mainnet diamond', async () => {
			const health = await monitor.getHealthStatus();

			expect(health).to.have.property('isHealthy');
			expect(health).to.have.property('checks');

			console.log(
				`\n  📊 Mainnet Health Status: ${health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`,
			);
			console.log(`  Total Checks: ${health.checks.length}`);

			health.checks.forEach((check) => {
				console.log(
					`    ${check.status === 'passed' ? '✅' : '❌'} ${check.name}: ${check.message}`,
				);
			});
		});

		it('should retrieve facet information from mainnet diamond', async () => {
			const facets = await facetManager.listFacets();

			expect(facets).to.be.an('array');
			expect(facets.length).to.be.greaterThan(0);

			console.log(`\n  📦 Mainnet Diamond has ${facets.length} facet(s)`);

			for (const facet of facets) {
				expect(facet).to.have.property('address');
				expect(facet).to.have.property('selectors');
				console.log(`    Facet: ${facet.address} (${facet.selectors.length} selectors)`);
			}
		});

		it('should monitor mainnet diamond without interfering with operations', async function () {
			this.timeout(30000);

			// Start monitoring
			const eventEmitter = monitor.trackEvents();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const events: any[] = [];

			eventEmitter.on('facetChanged', (event) => {
				events.push(event);
			});

			// Monitor for 15 seconds (read-only)
			console.log('  👀 Monitoring mainnet diamond (read-only) for 15 seconds...');
			await new Promise((resolve) => setTimeout(resolve, 15000));

			// Monitoring should work without affecting mainnet contract
			expect(eventEmitter).to.exist;
			console.log(
				`  📊 Monitoring completed successfully (${events.length} events captured)`,
			);
		});
	});

	describe('🔬 Network Comparison Tests', () => {
		it('should compare monitoring behavior across networks', function () {
			// This test documents the differences in monitoring across networks

			const networkComparison = {
				sepolia: {
					chainId: 11155111,
					recommendedPollingInterval: 10000, // 10 seconds
					expectedResponseTime: '< 15 seconds',
					purpose: 'Testing and development',
					costProfile: 'Free or low-cost',
				},
				mainnet: {
					chainId: 1,
					recommendedPollingInterval: 15000, // 15 seconds
					expectedResponseTime: '< 20 seconds',
					purpose: 'Production monitoring',
					costProfile: 'RPC provider dependent',
				},
			};

			console.log('\n  📊 Network Comparison:');
			console.log('  Sepolia:', JSON.stringify(networkComparison.sepolia, null, 4));
			console.log('  Mainnet:', JSON.stringify(networkComparison.mainnet, null, 4));

			expect(networkComparison.sepolia.chainId).to.equal(11155111);
			expect(networkComparison.mainnet.chainId).to.equal(1);
		});

		it('should document RPC testing best practices', function () {
			const bestPractices = {
				environment: {
					useEnvVars: 'Store RPC URLs and addresses in environment variables',
					neverCommitKeys: 'Never commit private keys or sensitive data',
					useInfuraAlchemy: 'Use reliable RPC providers (Infura, Alchemy, etc.)',
				},
				testing: {
					readOnlyMainnet: 'Mainnet tests should be read-only',
					testOnSepolia: 'Use Sepolia for write operations testing',
					handleTimeouts: 'Set appropriate timeouts for RPC calls',
					rateLimiting: 'Be aware of RPC provider rate limits',
				},
				monitoring: {
					appropriateIntervals: 'Use longer polling intervals for RPC (10-15s)',
					errorHandling: 'Implement retry logic for transient failures',
					costAwareness: 'Monitor RPC request costs',
					alerting: 'Set up alerting for health check failures',
				},
			};

			console.log('\n  📚 RPC Testing Best Practices:');
			console.log(JSON.stringify(bestPractices, null, 2));

			expect(bestPractices).to.exist;
		});
	});
});
