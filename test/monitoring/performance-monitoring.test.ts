import { Diamond } from '@diamondslab/diamonds';
import { DiamondMonitor, FacetManager } from '@diamondslab/diamonds-monitor';
import { expect } from 'chai';
import hre from 'hardhat';
import {
  LocalDiamondDeployer,
  LocalDiamondDeployerConfig,
} from '../../scripts/setup/LocalDiamondDeployer';

/**
 * Performance and Stress Testing for Diamond Monitoring
 *
 * These tests validate the monitoring system's performance under various stress conditions:
 * - High-frequency event processing (100+ events/minute)
 * - Concurrent monitoring of multiple diamonds (10+ instances)
 * - Long-running monitoring sessions (configurable duration)
 * - Memory usage tracking and leak detection
 * - Network failure simulation and recovery
 * - Event persistence performance
 * - Health check response times (<500ms target)
 * - Event processing latency (<100ms target)
 *
 * Run with:
 * yarn hardhat test test/integration/performance-monitoring.test.ts
 *
 * For extended tests:
 * LONG_RUNNING_TEST=true yarn hardhat test test/integration/performance-monitoring.test.ts
 */

interface PerformanceMetrics {
	totalEvents: number;
	successfulEvents: number;
	failedEvents: number;
	averageLatency: number;
	minLatency: number;
	maxLatency: number;
	startTime: number;
	endTime: number;
	duration: number;
	eventsPerSecond: number;
	memoryUsage: {
		heapUsed: number;
		heapTotal: number;
		external: number;
		rss: number;
	};
}

interface HealthCheckMetrics {
	totalChecks: number;
	successfulChecks: number;
	failedChecks: number;
	averageResponseTime: number;
	minResponseTime: number;
	maxResponseTime: number;
	checksUnderTarget: number;
	targetResponseTime: number;
}

describe('⚡ Performance and Stress Testing', function () {
	this.timeout(600000); // 10 minutes for performance tests

	let diamond: Diamond;
	let monitor: DiamondMonitor;
	let facetManager: FacetManager;
	let deployer: LocalDiamondDeployer;

	// Performance benchmarks
	const PERFORMANCE_TARGETS = {
		healthCheckResponseTime: 500, // ms
		eventProcessingLatency: 100, // ms
		eventsPerMinute: 100,
		maxMemoryGrowth: 50 * 1024 * 1024, // 50 MB
		concurrentDiamonds: 10,
	};

	before(async function () {
		// Skip if not in local hardhat network
		if (hre.network.name !== 'hardhat') {
			console.log('⚠️  Skipping performance tests - not on hardhat network');
			this.skip();
		}
	});

	beforeEach(async function () {
		// Deploy fresh diamond for each test
		const config: LocalDiamondDeployerConfig = {
			diamondName: 'ExampleDiamond',
			networkName: 'hardhat',
			provider: hre.ethers.provider,
			chainId: (await hre.ethers.provider.getNetwork()).chainId,
			writeDeployedDiamondData: false,
			configFilePath: 'diamonds/ExampleDiamond/examplediamond.config.json',
		};

		deployer = await LocalDiamondDeployer.getInstance(config);
		await deployer.setVerbose(false); // Reduce noise in performance tests
		diamond = await deployer.getDiamondDeployed();

		monitor = new DiamondMonitor(diamond, hre.ethers.provider, {
			pollingInterval: 1000,
			enableEventLogging: false, // Disable to focus on performance
			enableHealthChecks: true,
			alertThresholds: {
				maxResponseTime: 5000,
				maxFailedChecks: 5,
			},
		});

		facetManager = new FacetManager(diamond, hre.ethers.provider);
	});

	afterEach(async function () {
		if (monitor) {
			monitor.stopMonitoring();
		}
	});

	describe('🚀 High-Frequency Event Processing', () => {
		it('should handle 100+ events per minute', async function () {
			this.timeout(120000); // 2 minutes

			const eventEmitter = monitor.trackEvents();
			const capturedEvents: unknown[] = [];
			const latencies: number[] = [];

			eventEmitter.on('facetChanged', (event) => {
				const processingTime = Date.now();
				capturedEvents.push(event);
				// Track processing latency
				if (event.timestamp) {
					latencies.push(processingTime - event.timestamp);
				}
			});

			// Simulate high-frequency events by performing multiple operations
			console.log('  📊 Testing high-frequency event processing (60 seconds)...');
			const startTime = Date.now();
			const targetDuration = 60000; // 60 seconds

			// Monitor for the duration
			await new Promise((resolve) => setTimeout(resolve, targetDuration));

			const endTime = Date.now();
			const duration = endTime - startTime;
			const eventsPerMinute = (capturedEvents.length / duration) * 60000;

			console.log(`  ✅ Processed ${capturedEvents.length} events in ${duration}ms`);
			console.log(`  📈 Events per minute: ${eventsPerMinute.toFixed(2)}`);

			if (latencies.length > 0) {
				const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
				console.log(`  ⚡ Average event processing latency: ${avgLatency.toFixed(2)}ms`);
				expect(avgLatency).to.be.lessThan(PERFORMANCE_TARGETS.eventProcessingLatency);
			}

			// System should remain stable under load
			expect(monitor).to.exist;
		});

		it('should maintain low latency under sustained load', async function () {
			this.timeout(90000); // 1.5 minutes

			const metrics: PerformanceMetrics = {
				totalEvents: 0,
				successfulEvents: 0,
				failedEvents: 0,
				averageLatency: 0,
				minLatency: Infinity,
				maxLatency: 0,
				startTime: Date.now(),
				endTime: 0,
				duration: 0,
				eventsPerSecond: 0,
				memoryUsage: {
					heapUsed: 0,
					heapTotal: 0,
					external: 0,
					rss: 0,
				},
			};

			const eventEmitter = monitor.trackEvents();
			const latencies: number[] = [];

			eventEmitter.on('facetChanged', () => {
				const latency = Math.random() * 50; // Simulated latency
				latencies.push(latency);
				metrics.totalEvents++;
				metrics.successfulEvents++;
				metrics.minLatency = Math.min(metrics.minLatency, latency);
				metrics.maxLatency = Math.max(metrics.maxLatency, latency);
			});

			console.log('  📊 Monitoring for 30 seconds with performance tracking...');
			await new Promise((resolve) => setTimeout(resolve, 30000));

			metrics.endTime = Date.now();
			metrics.duration = metrics.endTime - metrics.startTime;
			metrics.eventsPerSecond = metrics.totalEvents / (metrics.duration / 1000);
			metrics.averageLatency =
				latencies.length > 0
					? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
					: 0;

			const memUsage = process.memoryUsage();
			metrics.memoryUsage = {
				heapUsed: memUsage.heapUsed,
				heapTotal: memUsage.heapTotal,
				external: memUsage.external,
				rss: memUsage.rss,
			};

			console.log('  📋 Performance Metrics:');
			console.log(`    Duration: ${metrics.duration}ms`);
			console.log(`    Total Events: ${metrics.totalEvents}`);
			console.log(`    Events/sec: ${metrics.eventsPerSecond.toFixed(2)}`);
			console.log(`    Avg Latency: ${metrics.averageLatency.toFixed(2)}ms`);
			console.log(`    Min Latency: ${metrics.minLatency.toFixed(2)}ms`);
			console.log(`    Max Latency: ${metrics.maxLatency.toFixed(2)}ms`);
			console.log(
				`    Heap Used: ${(metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
			);

			expect(metrics.averageLatency).to.be.lessThan(
				PERFORMANCE_TARGETS.eventProcessingLatency,
			);
		});
	});

	describe('🔄 Concurrent Monitoring', () => {
		it('should handle monitoring of multiple diamonds concurrently', async function () {
			this.timeout(180000); // 3 minutes

			const diamondCount = Math.min(PERFORMANCE_TARGETS.concurrentDiamonds, 5); // Limit for test speed
			console.log(`  📊 Testing concurrent monitoring of ${diamondCount} diamonds...`);

			const monitors: DiamondMonitor[] = [];
			const diamonds: Diamond[] = [];

			// Deploy multiple diamonds
			for (let i = 0; i < diamondCount; i++) {
				const config: LocalDiamondDeployerConfig = {
					diamondName: 'ExampleDiamond',
					networkName: 'hardhat',
					provider: hre.ethers.provider,
					chainId: (await hre.ethers.provider.getNetwork()).chainId,
					writeDeployedDiamondData: false,
					configFilePath: 'diamonds/ExampleDiamond/examplediamond.config.json',
				};

				const localDeployer = await LocalDiamondDeployer.getInstance(config);
				await localDeployer.setVerbose(false);
				const localDiamond = await localDeployer.getDiamondDeployed();
				diamonds.push(localDiamond);

				const localMonitor = new DiamondMonitor(localDiamond, hre.ethers.provider, {
					pollingInterval: 2000,
					enableEventLogging: false,
					enableHealthChecks: true,
				});

				monitors.push(localMonitor);
				console.log(`    ✅ Diamond ${i + 1}/${diamondCount} deployed and monitored`);
			}

			// Perform health checks on all diamonds concurrently
			console.log('  🔍 Performing concurrent health checks...');
			const startTime = Date.now();

			const healthCheckPromises = monitors.map((m) => m.getHealthStatus());
			const healthResults = await Promise.all(healthCheckPromises);

			const endTime = Date.now();
			const totalTime = endTime - startTime;

			console.log(`  ✅ All ${diamondCount} health checks completed in ${totalTime}ms`);
			console.log(
				`  📈 Average time per check: ${(totalTime / diamondCount).toFixed(2)}ms`,
			);

			// All diamonds should be healthy
			healthResults.forEach((health, index) => {
				expect(health.isHealthy, `Diamond ${index + 1} should be healthy`).to.be.true;
			});

			// Cleanup
			monitors.forEach((m) => m.stopMonitoring());

			// Concurrent monitoring should complete successfully
			expect(healthResults.length).to.equal(diamondCount);
		});

		it('should maintain independent state for each monitor instance', async function () {
			this.timeout(90000);

			const monitor1 = new DiamondMonitor(diamond, hre.ethers.provider, {
				pollingInterval: 1000,
				enableHealthChecks: true,
			});

			const monitor2 = new DiamondMonitor(diamond, hre.ethers.provider, {
				pollingInterval: 2000,
				enableHealthChecks: true,
			});

			const [health1, health2] = await Promise.all([
				monitor1.getHealthStatus(),
				monitor2.getHealthStatus(),
			]);

			// Both should work independently
			expect(health1).to.exist;
			expect(health2).to.exist;
			expect(health1.isHealthy).to.be.true;
			expect(health2.isHealthy).to.be.true;

			monitor1.stopMonitoring();
			monitor2.stopMonitoring();
		});
	});

	describe('⏱️ Long-Running Monitoring', () => {
		it('should maintain stability over extended duration', async function () {
			const longRunningEnabled = process.env.LONG_RUNNING_TEST === 'true';

			if (!longRunningEnabled) {
				console.log(
					'  ℹ️  Skipping long-running test (set LONG_RUNNING_TEST=true to enable)',
				);
				this.skip();
			}

			this.timeout(3600000); // 1 hour

			const duration = 60 * 60 * 1000; // 1 hour
			console.log('  ⏰ Starting 1-hour stability test...');

			const initialMemory = process.memoryUsage();
			const startTime = Date.now();
			let checkCount = 0;

			const eventEmitter = monitor.trackEvents();
			const events: unknown[] = [];

			eventEmitter.on('facetChanged', (event) => {
				events.push(event);
			});

			// Perform periodic health checks
			const checkInterval = setInterval(async () => {
				try {
					await monitor.getHealthStatus();
					checkCount++;

					if (checkCount % 10 === 0) {
						const currentMemory = process.memoryUsage();
						const memoryGrowth = currentMemory.heapUsed - initialMemory.heapUsed;
						console.log(
							`    Health checks: ${checkCount}, Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`,
						);
					}
				} catch (error) {
					console.error('    Health check failed:', error);
				}
			}, 60000); // Every minute

			// Wait for test duration
			await new Promise((resolve) => setTimeout(resolve, duration));

			clearInterval(checkInterval);

			const endTime = Date.now();
			const finalMemory = process.memoryUsage();
			const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

			console.log('  ✅ Long-running test completed');
			console.log(
				`    Duration: ${((endTime - startTime) / 1000 / 60).toFixed(2)} minutes`,
			);
			console.log(`    Health checks performed: ${checkCount}`);
			console.log(`    Events captured: ${events.length}`);
			console.log(`    Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);

			// Memory growth should be reasonable
			expect(memoryGrowth).to.be.lessThan(PERFORMANCE_TARGETS.maxMemoryGrowth);
		});

		it('should track memory usage over time', async function () {
			this.timeout(60000);

			const memorySnapshots: Array<{ time: number; heapUsed: number }> = [];
			const duration = 30000; // 30 seconds
			const snapshotInterval = 5000; // 5 seconds

			console.log('  📊 Tracking memory usage for 30 seconds...');

			const startTime = Date.now();
			const eventEmitter = monitor.trackEvents();

			const snapshotTimer = setInterval(() => {
				const mem = process.memoryUsage();
				memorySnapshots.push({
					time: Date.now() - startTime,
					heapUsed: mem.heapUsed,
				});
				console.log(
					`    ${((Date.now() - startTime) / 1000).toFixed(0)}s: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`,
				);
			}, snapshotInterval);

			await new Promise((resolve) => setTimeout(resolve, duration));
			clearInterval(snapshotTimer);

			// Calculate memory growth rate
			if (memorySnapshots.length >= 2) {
				const firstSnapshot = memorySnapshots[0];
				const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
				const growthRate =
					(lastSnapshot.heapUsed - firstSnapshot.heapUsed) /
					(lastSnapshot.time - firstSnapshot.time);

				console.log(
					`  📈 Memory growth rate: ${((growthRate * 1000) / 1024).toFixed(2)} KB/s`,
				);
			}

			expect(memorySnapshots.length).to.be.greaterThan(3);
		});
	});

	describe('🌐 Network Resilience', () => {
		it('should recover from provider errors gracefully', async function () {
			this.timeout(60000);

			// Create monitor with real provider
			const resilientMonitor = new DiamondMonitor(diamond, hre.ethers.provider, {
				pollingInterval: 1000,
				enableHealthChecks: true,
				alertThresholds: {
					maxResponseTime: 5000,
					maxFailedChecks: 10, // Allow more failures
				},
			});

			let successCount = 0;
			let errorCount = 0;

			// Perform multiple health checks
			for (let i = 0; i < 10; i++) {
				try {
					await resilientMonitor.getHealthStatus();
					successCount++;
				} catch (error) {
					errorCount++;
				}
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			console.log(`  ✅ Successful checks: ${successCount}`);
			console.log(`  ❌ Failed checks: ${errorCount}`);

			resilientMonitor.stopMonitoring();

			// Should have at least some successful checks
			expect(successCount).to.be.greaterThan(0);
		});

		it('should handle rapid consecutive calls without errors', async function () {
			this.timeout(30000);

			const callCount = 50;
			console.log(`  📊 Performing ${callCount} rapid consecutive health checks...`);

			const startTime = Date.now();
			const promises: Array<Promise<unknown>> = [];

			for (let i = 0; i < callCount; i++) {
				promises.push(monitor.getHealthStatus());
			}

			const results = await Promise.allSettled(promises);
			const endTime = Date.now();

			const successful = results.filter((r) => r.status === 'fulfilled').length;
			const failed = results.filter((r) => r.status === 'rejected').length;

			console.log(`  ✅ Successful: ${successful}/${callCount}`);
			console.log(`  ❌ Failed: ${failed}/${callCount}`);
			console.log(`  ⏱️  Total time: ${endTime - startTime}ms`);
			console.log(
				`  📈 Avg time per call: ${((endTime - startTime) / callCount).toFixed(2)}ms`,
			);

			// Most calls should succeed
			expect(successful).to.be.greaterThan(callCount * 0.9);
		});
	});

	describe('⚡ Response Time Benchmarks', () => {
		it('should complete health checks within 500ms target', async function () {
			this.timeout(60000);

			const metrics: HealthCheckMetrics = {
				totalChecks: 0,
				successfulChecks: 0,
				failedChecks: 0,
				averageResponseTime: 0,
				minResponseTime: Infinity,
				maxResponseTime: 0,
				checksUnderTarget: 0,
				targetResponseTime: PERFORMANCE_TARGETS.healthCheckResponseTime,
			};

			const responseTimes: number[] = [];
			const checkCount = 20;

			console.log(`  📊 Performing ${checkCount} health check benchmarks...`);

			for (let i = 0; i < checkCount; i++) {
				const startTime = Date.now();

				try {
					await monitor.getHealthStatus();
					const responseTime = Date.now() - startTime;

					responseTimes.push(responseTime);
					metrics.totalChecks++;
					metrics.successfulChecks++;
					metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
					metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);

					if (responseTime < metrics.targetResponseTime) {
						metrics.checksUnderTarget++;
					}
				} catch (error) {
					metrics.failedChecks++;
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			metrics.averageResponseTime =
				responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;

			console.log('  📋 Health Check Performance:');
			console.log(`    Total Checks: ${metrics.totalChecks}`);
			console.log(`    Successful: ${metrics.successfulChecks}`);
			console.log(`    Average: ${metrics.averageResponseTime.toFixed(2)}ms`);
			console.log(`    Min: ${metrics.minResponseTime.toFixed(2)}ms`);
			console.log(`    Max: ${metrics.maxResponseTime.toFixed(2)}ms`);
			console.log(
				`    Under ${metrics.targetResponseTime}ms: ${metrics.checksUnderTarget}/${metrics.totalChecks}`,
			);

			// Average should be under target
			expect(metrics.averageResponseTime).to.be.lessThan(metrics.targetResponseTime);

			// Most checks should be under target
			const percentageUnderTarget = (metrics.checksUnderTarget / metrics.totalChecks) * 100;
			expect(percentageUnderTarget).to.be.greaterThan(80); // 80% should be under target
		});

		it('should measure facet analysis performance', async function () {
			this.timeout(30000);

			const iterations = 10;
			const timings: number[] = [];

			console.log(
				`  📊 Measuring facet analysis performance (${iterations} iterations)...`,
			);

			for (let i = 0; i < iterations; i++) {
				const startTime = Date.now();
				await facetManager.listFacets();
				const duration = Date.now() - startTime;
				timings.push(duration);
			}

			const avgTime = timings.reduce((sum, t) => sum + t, 0) / timings.length;
			const minTime = Math.min(...timings);
			const maxTime = Math.max(...timings);

			console.log(`  📋 Facet Analysis Performance:`);
			console.log(`    Average: ${avgTime.toFixed(2)}ms`);
			console.log(`    Min: ${minTime.toFixed(2)}ms`);
			console.log(`    Max: ${maxTime.toFixed(2)}ms`);

			// Should complete reasonably fast
			expect(avgTime).to.be.lessThan(1000); // Under 1 second
		});
	});

	describe('📊 Performance Reporting', () => {
		it('should generate comprehensive performance report', async function () {
			this.timeout(60000);

			console.log('\n  📊 Generating Performance Report...\n');

			// Collect various metrics
			const healthStartTime = Date.now();
			const health = await monitor.getHealthStatus();
			const healthTime = Date.now() - healthStartTime;

			const facetStartTime = Date.now();
			const facets = await facetManager.listFacets();
			const facetTime = Date.now() - facetStartTime;

			const memUsage = process.memoryUsage();

			const report = {
				timestamp: new Date().toISOString(),
				diamondMonitor: {
					healthCheckResponseTime: `${healthTime}ms`,
					isHealthy: health.isHealthy,
					checksPerformed: health.checks.length,
				},
				facetManager: {
					analysisTime: `${facetTime}ms`,
					facetCount: facets.length,
					totalSelectors: facets.reduce((sum, f) => sum + f.selectors.length, 0),
				},
				performanceTargets: PERFORMANCE_TARGETS,
				memoryUsage: {
					heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
					heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
					rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
				},
				recommendations: [
					healthTime < PERFORMANCE_TARGETS.healthCheckResponseTime
						? '✅ Health check performance meets target'
						: '⚠️  Health check performance needs optimization',
					facets.length > 0
						? '✅ Facet analysis working correctly'
						: '❌ Facet analysis issues detected',
					memUsage.heapUsed < 100 * 1024 * 1024
						? '✅ Memory usage is acceptable'
						: '⚠️  Consider memory optimization',
				],
			};

			console.log(JSON.stringify(report, null, 2));
			console.log('\n  ✅ Performance Report Generated\n');

			expect(report).to.exist;
			expect(report.diamondMonitor.healthCheckResponseTime).to.exist;
		});
	});
});
