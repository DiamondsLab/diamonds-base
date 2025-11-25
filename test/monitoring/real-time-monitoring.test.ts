import { DiamondMonitor, EventHandlers } from '@diamondslab/diamonds-monitor';
import { expect } from 'chai';
import { EventLog } from 'ethers';
import { EventEmitter } from 'events';
import { MockProvider } from '../../packages/diamonds-monitor/test/helpers/MockProvider';

describe('🔄 DiamondMonitor Real-Time Event Monitoring', () => {
	let monitor: DiamondMonitor;
	let mockProvider: MockProvider;
	let mockDiamond: any;
	let eventHandlers: EventHandlers;

	beforeEach(async () => {
		// Create mock provider
		mockProvider = new MockProvider();

		// Create mock diamond instance
		mockDiamond = {
			getDeployedDiamondData: () => ({
				DiamondAddress: '0x1234567890123456789012345678901234567890',
				DeployedFacets: {
					DiamondLoupeFacet: {
						address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
						funcSelectors: ['0x7a0ed627', '0xadfca15e', '0x52ef6b2c', '0xcdffacc6'],
					},
				},
			}),
			isDiamondDeployed: () => true,
			getDiamondAddress: () => '0x1234567890123456789012345678901234567890',
			getContract: () => ({
				address: '0x1234567890123456789012345678901234567890',
				interface: {
					encodeFunctionData: () => '0x',
					parseLog: () => null,
				},
			}),
		};

		// Create monitor instance with alert thresholds
		monitor = new DiamondMonitor(mockDiamond, mockProvider, {
			pollingInterval: 1000,
			enableEventLogging: true,
			enableHealthChecks: true,
			alertThresholds: {
				maxResponseTime: 2000,
				maxFailedChecks: 2,
			},
		});

		eventHandlers = new EventHandlers(monitor['logger']);
	});

	describe('🎯 EventEmitter Integration', () => {
		it('should return EventEmitter from trackEvents', () => {
			const eventEmitter = monitor.trackEvents();
			expect(eventEmitter).to.be.instanceOf(EventEmitter);
		});

		it('should emit facetChanged events when DiamondCut occurs', (done) => {
			const eventEmitter = monitor.trackEvents();

			// Mock DiamondCut event
			const mockEvent = {
				args: [
					[
						{
							facetAddress: '0x1234567890123456789012345678901234567890',
							action: 0, // Add
							functionSelectors: ['0x12345678', '0x87654321'],
						},
					],
					'0x0000000000000000000000000000000000000000',
					'0x',
				],
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
			} as unknown as EventLog;

			eventEmitter.on('facetChanged', (event) => {
				expect(event).to.have.property('changes');
				expect(event.changes).to.have.length(1);
				expect(event.changes[0].action).to.equal('Add');
				expect(event.changes[0].facetAddress).to.equal(
					'0x1234567890123456789012345678901234567890',
				);
				expect(event.changes[0].functionSelectors).to.deep.equal([
					'0x12345678',
					'0x87654321',
				]);
				expect(event).to.have.property('impact');
				expect(event).to.have.property('shouldAlert');
				done();
			});

			// Simulate DiamondCut event
			setTimeout(() => {
				monitor['handleCutEvent'](mockEvent, eventEmitter);
			}, 100);
		});

		it('should emit healthIssue events for high-impact changes', (done) => {
			const eventEmitter = monitor.trackEvents();

			// Mock high-impact DiamondCut event (remove action)
			const mockEvent = {
				args: [
					[
						{
							facetAddress: '0x1234567890123456789012345678901234567890',
							action: 2, // Remove
							functionSelectors: ['0x12345678'],
						},
					],
					'0x0000000000000000000000000000000000000000',
					'0x',
				],
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
			} as unknown as EventLog;

			eventEmitter.on('healthIssue', (issue) => {
				expect(issue).to.have.property('issue');
				expect(issue.issue).to.equal('High-impact facet change detected');
				expect(issue).to.have.property('severity');
				expect(issue.severity).to.equal('high');
				expect(issue).to.have.property('details');
				done();
			});

			// Simulate high-impact DiamondCut event
			setTimeout(() => {
				monitor['handleCutEvent'](mockEvent, eventEmitter);
			}, 100);
		});

		it('should handle event processing errors gracefully', (done) => {
			const eventEmitter = monitor.trackEvents();

			// Mock invalid event that will cause parsing error
			const mockEvent = {
				args: null, // Invalid args
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
			} as unknown as EventLog;

			eventEmitter.on('healthIssue', (issue) => {
				expect(issue).to.have.property('issue');
				expect(issue.issue).to.equal('Failed to parse DiamondCut event');
				expect(issue).to.have.property('error');
				done();
			});

			// Simulate invalid event
			setTimeout(() => {
				monitor['handleCutEvent'](mockEvent, eventEmitter);
			}, 100);
		});
	});

	describe('🔍 Enhanced Health Checks', () => {
		it('should include loupe function checks in health status', async () => {
			// Mock successful loupe responses
			mockProvider.setMockResponse('facets', [
				{
					facetAddress: '0x1234567890123456789012345678901234567890',
					functionSelectors: ['0x12345678', '0x87654321'],
				},
			]);

			mockProvider.setMockResponse('facetFunctionSelectors', ['0x12345678', '0x87654321']);
			mockProvider.setMockResponse('facetAddresses', [
				'0x1234567890123456789012345678901234567890',
			]);

			const healthStatus = await monitor.getHealthStatus();

			expect(healthStatus.isHealthy).to.be.true;
			expect(healthStatus.checks).to.have.length.greaterThan(3); // Should include loupe checks

			// Find loupe-specific checks
			const loupeChecks = healthStatus.checks.filter((check) =>
				check.name.startsWith('loupe_'),
			);
			expect(loupeChecks).to.have.length(3); // facets, selectors, addresses

			loupeChecks.forEach((check) => {
				expect(check.status).to.equal('passed');
			});
		});

		it('should include response time check using alert thresholds', async () => {
			const healthStatus = await monitor.getHealthStatus();

			const responseTimeCheck = healthStatus.checks.find(
				(check) => check.name === 'response_time',
			);

			expect(responseTimeCheck).to.exist;
			expect(responseTimeCheck!.status).to.be.oneOf(['passed', 'warning']);
			expect(responseTimeCheck!.details).to.have.property('responseTime');
			expect(responseTimeCheck!.details).to.have.property('threshold');
			expect(responseTimeCheck!.details.threshold).to.equal(2000); // From config
		});

		it('should include enhanced metadata in health results', async () => {
			const healthStatus = await monitor.getHealthStatus();

			expect(healthStatus).to.have.property('metadata');
			expect(healthStatus.metadata).to.have.property('totalChecks');
			expect(healthStatus.metadata).to.have.property('passedChecks');
			expect(healthStatus.metadata).to.have.property('warningChecks');
			expect(healthStatus.metadata).to.have.property('failedChecks');

			const { totalChecks, passedChecks, warningChecks, failedChecks } =
				healthStatus.metadata!;
			expect(totalChecks).to.equal(passedChecks + warningChecks + failedChecks);
		});

		it('should detect loupe function inconsistencies', async () => {
			// Mock inconsistent loupe responses
			mockProvider.setMockResponse('facets', [
				{
					facetAddress: '0x1234567890123456789012345678901234567890',
					functionSelectors: ['0x12345678', '0x87654321'],
				},
			]);

			// Mock different selectors from facetFunctionSelectors
			mockProvider.setMockResponse('facetFunctionSelectors', ['0x12345678']); // Missing one selector
			mockProvider.setMockResponse('facetAddresses', [
				'0x1234567890123456789012345678901234567890',
			]);

			const healthStatus = await monitor.getHealthStatus();

			const selectorsCheck = healthStatus.checks.find(
				(check) => check.name === 'loupe_selectors',
			);

			expect(selectorsCheck).to.exist;
			expect(selectorsCheck!.status).to.equal('warning');
			expect(selectorsCheck!.message).to.include('Selector mismatch');
		});
	});

	describe('🛠️ EventHandlers Utility', () => {
		it('should parse DiamondCut events correctly', () => {
			const mockEvent = {
				args: [
					[
						{
							facetAddress: '0x1234567890123456789012345678901234567890',
							action: 1, // Replace
							functionSelectors: ['0x12345678', '0x87654321', '0xabcdefab'],
						},
					],
					'0x1111111111111111111111111111111111111111',
					'0x1234',
				],
				blockNumber: 12345,
				blockHash: '0xabcdef123456',
				transactionHash: '0x123abc456def',
			} as unknown as EventLog;

			const parsed = eventHandlers.parseDiamondCutEvent(mockEvent);

			expect(parsed.changes).to.have.length(1);
			expect(parsed.changes[0].action).to.equal('Replace');
			expect(parsed.changes[0].facetAddress).to.equal(
				'0x1234567890123456789012345678901234567890',
			);
			expect(parsed.changes[0].functionSelectors).to.have.length(3);
			expect(parsed.init).to.equal('0x1111111111111111111111111111111111111111');
			expect(parsed.calldata).to.equal('0x1234');
			expect(parsed.blockNumber).to.equal(12345);
			expect(parsed.transactionHash).to.equal('0x123abc456def');
		});

		it('should analyze cut impact correctly', () => {
			const parsedEvent = {
				changes: [
					{
						facetAddress: '0x1234567890123456789012345678901234567890',
						action: 'Remove' as const,
						functionSelectors: ['0x12345678', '0x87654321'],
					},
					{
						facetAddress: '0x9876543210987654321098765432109876543210',
						action: 'Add' as const,
						functionSelectors: ['0xabcdefab'],
					},
				],
				init: '0x0000000000000000000000000000000000000000',
				calldata: '0x',
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
				timestamp: new Date().toISOString(),
			};

			const impact = eventHandlers.analyzeCutImpact(parsedEvent);

			expect(impact.severity).to.equal('high'); // Remove action = high severity
			expect(impact.summary).to.include('1 Remove');
			expect(impact.summary).to.include('1 Add');
			expect(impact.summary).to.include('3 function(s)');
			expect(impact.details).to.include('1 facet(s) removed');
			expect(impact.details).to.include('1 new facet(s) added');
		});

		it('should determine alert conditions correctly', () => {
			const parsedEvent = {
				changes: [
					{
						facetAddress: '0x1234567890123456789012345678901234567890',
						action: 'Remove' as const,
						functionSelectors: ['0x12345678'],
					},
				],
				init: '0x0000000000000000000000000000000000000000',
				calldata: '0x',
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
				timestamp: new Date().toISOString(),
			};

			// Should alert on remove
			const shouldAlert1 = eventHandlers.shouldAlert(parsedEvent, {
				alertOnRemove: true,
			});
			expect(shouldAlert1).to.be.true;

			// Should not alert when remove alerting is disabled
			const shouldAlert2 = eventHandlers.shouldAlert(parsedEvent, {
				alertOnRemove: false,
			});
			expect(shouldAlert2).to.be.false;

			// Test threshold-based alerting
			const largeChangeEvent = {
				...parsedEvent,
				changes: [
					{
						facetAddress: '0x1234567890123456789012345678901234567890',
						action: 'Add' as const,
						functionSelectors: Array.from(
							{ length: 25 },
							(_, i) => `0x${i.toString(16).padStart(8, '0')}`,
						),
					},
				],
			};

			const shouldAlert3 = eventHandlers.shouldAlert(largeChangeEvent, {
				maxSelectorChanges: 20,
				alertOnRemove: false,
			});
			expect(shouldAlert3).to.be.true; // Exceeds selector threshold
		});

		it('should format events for logging appropriately', () => {
			const parsedEvent = {
				changes: [
					{
						facetAddress: '0x1234567890123456789012345678901234567890',
						action: 'Add' as const,
						functionSelectors: [
							'0x12345678',
							'0x87654321',
							'0xabcdefab',
							'0x11111111',
							'0x22222222',
						],
					},
				],
				init: '0x1111111111111111111111111111111111111111',
				calldata: '0x1234',
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
				timestamp: '2023-01-01T00:00:00.000Z',
			};

			const formatted = eventHandlers.formatEventForLog(parsedEvent);

			expect(formatted).to.have.property('timestamp');
			expect(formatted).to.have.property('blockNumber', 12345);
			expect(formatted).to.have.property('transactionHash', '0x123abc');
			expect(formatted).to.have.property('summary', '1 facet change(s)');
			expect(formatted).to.have.property('changes');
			expect(formatted).to.have.property('hasInit', true);
			expect(formatted).to.have.property('hasCalldata', true);

			const change = (formatted as any).changes[0];
			expect(change.action).to.equal('Add');
			expect(change.selectorCount).to.equal(5);
			expect(change.selectors).to.have.length(3); // First 3 selectors
			expect(change.truncated).to.be.true; // Should be truncated
		});
	});

	describe('🚨 Alert Threshold Integration', () => {
		it('should use configured alert thresholds in health checks', async () => {
			// Create monitor with strict thresholds
			const strictMonitor = new DiamondMonitor(mockDiamond, mockProvider, {
				alertThresholds: {
					maxResponseTime: 100, // Very strict
					maxFailedChecks: 1,
				},
			});

			// Mock slow response
			mockProvider.setDelay(200); // Slower than threshold

			const healthStatus = await strictMonitor.getHealthStatus();

			const responseTimeCheck = healthStatus.checks.find(
				(check) => check.name === 'response_time',
			);

			expect(responseTimeCheck).to.exist;
			expect(responseTimeCheck!.status).to.equal('warning');
			expect(responseTimeCheck!.message).to.include('exceeds threshold');
		});

		it('should integrate alert thresholds with event monitoring', (done) => {
			const eventEmitter = monitor.trackEvents();

			// Mock event with many selectors (should trigger alert based on scaled threshold)
			const mockEvent = {
				args: [
					[
						{
							facetAddress: '0x1234567890123456789012345678901234567890',
							action: 0, // Add
							functionSelectors: Array.from(
								{ length: 30 },
								(_, i) => `0x${i.toString(16).padStart(8, '0')}`,
							),
						},
					],
					'0x0000000000000000000000000000000000000000',
					'0x',
				],
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
			} as unknown as EventLog;

			eventEmitter.on('facetChanged', (event) => {
				expect(event.shouldAlert).to.be.true; // Should alert due to many selectors
				done();
			});

			setTimeout(() => {
				monitor['handleCutEvent'](mockEvent, eventEmitter);
			}, 100);
		});
	});

	describe('🔧 Real-Time Monitoring Integration', () => {
		it('should start monitoring without errors', () => {
			expect(() => {
				const eventEmitter = monitor.trackEvents();
				expect(eventEmitter).to.be.instanceOf(EventEmitter);
			}).to.not.throw();
		});

		it('should handle provider errors during monitoring', (done) => {
			const eventEmitter = monitor.trackEvents();

			eventEmitter.on('healthIssue', (issue) => {
				if (issue.issue === 'Provider error') {
					expect(issue).to.have.property('error');
					done();
				}
			});

			// Simulate provider error
			setTimeout(() => {
				mockProvider.emitSync('error', new Error('Test provider error'));
			}, 100);
		});

		it('should continue monitoring after handling events', (done) => {
			const eventEmitter = monitor.trackEvents();
			let eventCount = 0;

			eventEmitter.on('facetChanged', () => {
				eventCount++;
				if (eventCount === 2) {
					done(); // Successfully handled multiple events
				}
			});

			// Simulate multiple events
			const mockEvent = {
				args: [
					[
						{
							facetAddress: '0x1234567890123456789012345678901234567890',
							action: 0,
							functionSelectors: ['0x12345678'],
						},
					],
					'0x0000000000000000000000000000000000000000',
					'0x',
				],
				blockNumber: 12345,
				blockHash: '0xabcdef',
				transactionHash: '0x123abc',
			} as unknown as EventLog;

			setTimeout(() => monitor['handleCutEvent'](mockEvent, eventEmitter), 100);
			setTimeout(() => monitor['handleCutEvent'](mockEvent, eventEmitter), 200);
		});
	});
});
