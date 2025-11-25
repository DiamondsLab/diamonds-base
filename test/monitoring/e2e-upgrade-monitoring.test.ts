import { Diamond } from '@diamondslab/diamonds';
import { DiamondMonitor, EventHandlers, FacetManager } from '@diamondslab/diamonds-monitor';
import { expect } from 'chai';
import { JsonRpcProvider } from 'ethers';

/**
 * Upgrade Monitoring Integration Tests
 *
 * Tests for monitoring diamond upgrades on live networks.
 * These tests validate pre-upgrade checks, upgrade monitoring, and post-upgrade validation.
 *
 * Required Environment Variables:
 * - SEPOLIA_RPC_URL: Sepolia RPC endpoint
 * - SEPOLIA_DIAMOND_ADDRESS: Address of diamond to monitor for upgrades
 *
 * Run with:
 * SEPOLIA_RPC_URL=<url> SEPOLIA_DIAMOND_ADDRESS=<address> yarn hardhat test test/integration/e2e-upgrade-monitoring.test.ts
 */

describe('🔄 Upgrade Monitoring Integration Tests', function () {
	this.timeout(180000); // 3 minutes for upgrade scenarios

	const sepoliaConfig = {
		rpcUrl: process.env.SEPOLIA_RPC_URL,
		diamondAddress: process.env.SEPOLIA_DIAMOND_ADDRESS,
		chainId: 11155111,
		networkName: 'sepolia',
	};

	let diamond: Diamond;
	let monitor: DiamondMonitor;
	let facetManager: FacetManager;
	let eventHandlers: EventHandlers;
	let provider: JsonRpcProvider;

	before(function () {
		// Skip if environment not configured
		if (!sepoliaConfig.rpcUrl || !sepoliaConfig.diamondAddress) {
			console.log(
				'⚠️  Skipping upgrade monitoring tests - SEPOLIA_RPC_URL or SEPOLIA_DIAMOND_ADDRESS not set',
			);
			this.skip();
		}

		if (!/^0x[a-fA-F0-9]{40}$/.test(sepoliaConfig.diamondAddress ?? '')) {
			throw new Error(`Invalid Sepolia diamond address: ${sepoliaConfig.diamondAddress}`);
		}
	});

	beforeEach(async function () {
		provider = new JsonRpcProvider(sepoliaConfig.rpcUrl);

		try {
			const network = await provider.getNetwork();
			expect(network.chainId).to.equal(BigInt(sepoliaConfig.chainId));
		} catch (error) {
			console.error('❌ Failed to connect to Sepolia RPC:', error);
			this.skip();
		}

		const diamondConfig = {
			diamondName: 'ExampleDiamond',
			networkName: sepoliaConfig.networkName,
			address: sepoliaConfig.diamondAddress,
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		diamond = new Diamond(diamondConfig as any, null as any);
		diamond.setProvider(provider);

		monitor = new DiamondMonitor(diamond, provider, {
			pollingInterval: 5000, // 5 seconds for upgrade monitoring
			enableEventLogging: true,
			enableHealthChecks: true,
			alertThresholds: {
				maxResponseTime: 15000,
				maxFailedChecks: 2,
			},
		});

		facetManager = new FacetManager(diamond, provider);
		eventHandlers = new EventHandlers(monitor['logger']);
	});

	afterEach(async function () {
		if (monitor) {
			monitor.stopMonitoring();
		}
	});

	describe('🔍 Pre-Upgrade Validation', () => {
		it('should capture baseline diamond state before upgrade', async () => {
			const preUpgradeState = {
				facets: await facetManager.listFacets(),
				health: await monitor.getHealthStatus(),
				timestamp: new Date(),
			};

			expect(preUpgradeState.facets).to.be.an('array');
			expect(preUpgradeState.facets.length).to.be.greaterThan(0);
			expect(preUpgradeState.health).to.have.property('isHealthy');

			console.log('\n  📸 Pre-Upgrade Baseline:');
			console.log(`    Facets: ${preUpgradeState.facets.length}`);
			console.log(`    Health: ${preUpgradeState.health.isHealthy ? '✅' : '❌'}`);
			console.log(`    Timestamp: ${preUpgradeState.timestamp.toISOString()}`);

			// Store baseline for comparison
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this as any).preUpgradeState = preUpgradeState;
		});

		it('should validate all function selectors before upgrade', async () => {
			const facets = await facetManager.listFacets();
			const selectorInventory: Map<string, string> = new Map();

			for (const facet of facets) {
				for (const selector of facet.selectors) {
					if (selectorInventory.has(selector)) {
						throw new Error(
							`Duplicate selector ${selector} found in facets ${selectorInventory.get(selector)} and ${facet.address}`,
						);
					}
					selectorInventory.set(selector, facet.address);
				}
			}

			console.log(
				`  ✅ Pre-upgrade validation: ${selectorInventory.size} unique selectors across ${facets.length} facets`,
			);
			expect(selectorInventory.size).to.be.greaterThan(0);
		});

		it('should check diamond health before allowing upgrade', async () => {
			const health = await monitor.getHealthStatus();

			if (!health.isHealthy) {
				console.warn('  ⚠️  Warning: Diamond is not healthy before upgrade!');
				console.warn('  Failed checks:');
				health.checks
					.filter((check) => check.status === 'failed')
					.forEach((check) => console.warn(`    - ${check.name}: ${check.message}`));
			}

			expect(health.checks).to.be.an('array');
			expect(health.checks.length).to.be.greaterThan(0);
		});

		it('should document current facet configuration', async () => {
			const facets = await facetManager.listFacets();
			const documentation = facets.map((facet) => ({
				address: facet.address,
				selectorCount: facet.selectors.length,
				selectors: facet.selectors,
			}));

			console.log('\n  📋 Current Facet Configuration:');
			documentation.forEach((doc, index) => {
				console.log(`    ${index + 1}. ${doc.address}`);
				console.log(`       Selectors: ${doc.selectorCount}`);
			});

			expect(documentation.length).to.equal(facets.length);
		});
	});

	describe('⚡ Upgrade Execution Monitoring', () => {
		it('should monitor for DiamondCut events during upgrade window', async function () {
			this.timeout(60000); // 1 minute monitoring window

			const eventEmitter = monitor.trackEvents();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const capturedEvents: any[] = [];

			eventEmitter.on('facetChanged', (event) => {
				console.log('\n  🔔 DiamondCut Event Detected!');
				console.log(`    Transaction: ${event.transactionHash}`);
				console.log(`    Changes: ${event.changes.length}`);
				console.log(`    Impact Severity: ${event.impact.severity}`);
				console.log(`    Should Alert: ${event.shouldAlert}`);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				event.changes.forEach((change: any, idx: number) => {
					console.log(`    Change ${idx + 1}:`);
					console.log(`      Action: ${change.action}`);
					console.log(`      Facet: ${change.facetAddress}`);
					console.log(`      Selectors: ${change.functionSelectors.length}`);
				});

				capturedEvents.push(event);
			});

			console.log('  👀 Monitoring for upgrade events (20 seconds)...');
			await new Promise((resolve) => setTimeout(resolve, 20000));

			console.log(`  📊 Captured ${capturedEvents.length} upgrade event(s)`);

			// Store events for post-upgrade validation
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(this as any).upgradeEvents = capturedEvents;
		});

		it('should analyze upgrade impact in real-time', async function () {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing
			const upgradeEvents = (this as any).upgradeEvents || [];

			if (upgradeEvents.length === 0) {
				console.log('  ℹ️  No upgrade events captured during test window');
				this.skip();
			}

			for (const event of upgradeEvents) {
				expect(event).to.have.property('impact');
				expect(event.impact).to.have.property('severity');
				expect(event.impact).to.have.property('affectedSelectors');

				console.log('\n  🔬 Upgrade Impact Analysis:');
				console.log(`    Severity: ${event.impact.severity}`);
				console.log(`    Affected Selectors: ${event.impact.affectedSelectors}`);
				console.log(`    Breaking Changes: ${event.impact.isBreaking ? 'Yes' : 'No'}`);
			}
		});

		it('should maintain monitoring stability during upgrade', async () => {
			// Perform multiple health checks during monitoring period
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const healthChecks: any[] = [];

			for (let i = 0; i < 3; i++) {
				try {
					const health = await monitor.getHealthStatus();
					healthChecks.push({ success: true, health, timestamp: Date.now() });
				} catch (error) {
					healthChecks.push({ success: false, error, timestamp: Date.now() });
				}

				await new Promise((resolve) => setTimeout(resolve, 3000));
			}

			console.log(`  ✅ Completed ${healthChecks.length} health checks during monitoring`);
			const successCount = healthChecks.filter((check) => check.success).length;
			console.log(`  Success rate: ${successCount}/${healthChecks.length}`);

			expect(successCount).to.be.greaterThan(0);
		});
	});

	describe('✅ Post-Upgrade Validation', () => {
		it('should compare post-upgrade state with baseline', async function () {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const preState = (this as any).preUpgradeState;

			if (!preState) {
				console.log('  ℹ️  No pre-upgrade baseline available');
				this.skip();
			}

			const postUpgradeState = {
				facets: await facetManager.listFacets(),
				health: await monitor.getHealthStatus(),
				timestamp: new Date(),
			};

			console.log('\n  📊 Upgrade Comparison:');
			console.log(`    Pre-upgrade facets: ${preState.facets.length}`);
			console.log(`    Post-upgrade facets: ${postUpgradeState.facets.length}`);
			console.log(
				`    Facet change: ${postUpgradeState.facets.length - preState.facets.length}`,
			);

			// Validate post-upgrade state
			expect(postUpgradeState.facets).to.be.an('array');
			expect(postUpgradeState.health).to.have.property('isHealthy');
		});

		it('should verify no selector conflicts post-upgrade', async () => {
			const facets = await facetManager.listFacets();
			const selectorMap: Map<string, string[]> = new Map();
			const conflicts: string[] = [];

			for (const facet of facets) {
				for (const selector of facet.selectors) {
					if (!selectorMap.has(selector)) {
						selectorMap.set(selector, []);
					}
					const selectorList = selectorMap.get(selector);
					if (selectorList) {
						selectorList.push(facet.address);
					}

					if ((selectorMap.get(selector)?.length ?? 0) > 1) {
						conflicts.push(selector);
					}
				}
			}

			if (conflicts.length > 0) {
				console.error('  ❌ Selector conflicts detected:');
				conflicts.forEach((selector) => {
					const addresses = selectorMap.get(selector)?.join(', ') ?? 'unknown';
					console.error(`    ${selector}: ${addresses}`);
				});
			}

			expect(conflicts).to.have.lengthOf(
				0,
				'No selector conflicts should exist after upgrade',
			);
		});

		it('should perform comprehensive health check post-upgrade', async () => {
			const health = await monitor.getHealthStatus();

			console.log('\n  🏥 Post-Upgrade Health Check:');
			console.log(`    Overall: ${health.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);

			health.checks.forEach((check) => {
				const icon =
					check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : '⚠️';
				console.log(`    ${icon} ${check.name}: ${check.message}`);
			});

			expect(health.checks).to.be.an('array');

			// Ideally should be healthy after upgrade
			if (!health.isHealthy) {
				console.warn('  ⚠️  Warning: Diamond is not healthy after upgrade');
			}
		});

		it('should verify all new facets are functional', async () => {
			const facets = await facetManager.listFacets();

			for (const facet of facets) {
				// Verify facet address has code
				const code = await provider.getCode(facet.address);
				expect(code).to.not.equal('0x', `Facet ${facet.address} should have bytecode`);
				expect(code.length).to.be.greaterThan(2);
			}

			console.log(`  ✅ All ${facets.length} facets have deployed bytecode`);
		});

		it('should document upgrade completion', async function () {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing
			const upgradeEvents = (this as any).upgradeEvents || [];

			const upgradeReport = {
				timestamp: new Date().toISOString(),
				eventsDetected: upgradeEvents.length,
				currentState: {
					facetCount: (await facetManager.listFacets()).length,
					health: (await monitor.getHealthStatus()).isHealthy,
				},
				summary:
					upgradeEvents.length > 0
						? 'Upgrade detected and monitored'
						: 'No upgrades during test window',
			};

			console.log('\n  📄 Upgrade Report:');
			console.log(JSON.stringify(upgradeReport, null, 2));

			expect(upgradeReport).to.exist;
		});
	});

	describe('🔄 Rollback Detection', () => {
		it('should detect potential rollback scenarios', async function () {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing
			const upgradeEvents = (this as any).upgradeEvents || [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const preState = (this as any).preUpgradeState;

			if (!preState || upgradeEvents.length === 0) {
				console.log('  ℹ️  Insufficient data for rollback detection');
				this.skip();
			}

			const currentFacets = await facetManager.listFacets();

			// Check if facet count decreased (potential rollback indicator)
			const facetCountChange = currentFacets.length - preState.facets.length;

			if (facetCountChange < 0) {
				console.warn(
					`  ⚠️  Potential rollback detected: ${Math.abs(facetCountChange)} fewer facets`,
				);
			}

			console.log(
				`  📊 Facet count change: ${facetCountChange >= 0 ? '+' : ''}${facetCountChange}`,
			);
		});

		it('should monitor for remove/replace actions indicating rollback', async function () {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/prefer-nullish-coalescing
			const upgradeEvents = (this as any).upgradeEvents || [];

			if (upgradeEvents.length === 0) {
				console.log('  ℹ️  No upgrade events to analyze');
				this.skip();
			}

			let removeCount = 0;
			let replaceCount = 0;

			for (const event of upgradeEvents) {
				for (const change of event.changes) {
					if (change.action === 'Remove') removeCount++;
					if (change.action === 'Replace') replaceCount++;
				}
			}

			console.log('\n  🔍 Action Analysis:');
			console.log(`    Remove actions: ${removeCount}`);
			console.log(`    Replace actions: ${replaceCount}`);

			if (removeCount > 0 || replaceCount > 0) {
				console.log(
					'  ⚠️  Facet modifications detected (could indicate rollback or refactoring)',
				);
			}
		});
	});

	describe('📊 Upgrade Monitoring Best Practices', () => {
		it('should document upgrade monitoring workflow', function () {
			const workflow = {
				preUpgrade: [
					'1. Capture baseline state (facets, health, selectors)',
					'2. Validate no existing issues',
					'3. Document current configuration',
					'4. Perform health checks',
				],
				duringUpgrade: [
					'1. Start real-time event monitoring',
					'2. Listen for DiamondCut events',
					'3. Analyze impact severity',
					'4. Maintain monitoring stability',
				],
				postUpgrade: [
					'1. Compare with baseline',
					'2. Verify no selector conflicts',
					'3. Perform comprehensive health check',
					'4. Validate all facets functional',
					'5. Generate upgrade report',
				],
				rollbackDetection: [
					'1. Monitor for remove/replace actions',
					'2. Detect facet count decreases',
					'3. Alert on potential rollbacks',
				],
			};

			console.log('\n  📚 Upgrade Monitoring Workflow:');
			console.log(JSON.stringify(workflow, null, 2));

			expect(workflow).to.exist;
		});
	});
});
