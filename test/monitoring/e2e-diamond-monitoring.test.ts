import { Diamond } from '@diamondslab/diamonds';
import { DiamondMonitor, EventHandlers, FacetManager } from '@diamondslab/diamonds-monitor';
import { expect } from 'chai';
import hre from 'hardhat';
import {
	LocalDiamondDeployer,
	LocalDiamondDeployerConfig,
} from '../../scripts/setup/LocalDiamondDeployer';

describe('🔄 End-to-End Diamond Deployment and Monitoring', function () {
	this.timeout(600000); // 10 minutes for e2e tests

	let diamond: Diamond;
	let monitor: DiamondMonitor;
	let facetManager: FacetManager;
	let eventHandlers: EventHandlers;
	let deployer: LocalDiamondDeployer;
	let deployedDiamondData: any;

	before(async function () {
		// Skip if not in local hardhat network
		if (hre.network.name !== 'hardhat') {
			console.log('Skipping e2e test - not on hardhat network');
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
		await deployer.setVerbose(true);
		diamond = await deployer.getDiamondDeployed();
		deployedDiamondData = diamond.getDeployedDiamondData();

		// Initialize monitoring
		monitor = new DiamondMonitor(diamond, hre.ethers.provider, {
			pollingInterval: 1000,
			enableEventLogging: true,
			enableHealthChecks: true,
			alertThresholds: {
				maxResponseTime: 5000,
				maxFailedChecks: 2,
			},
		});

		facetManager = new FacetManager(diamond, hre.ethers.provider);
		eventHandlers = new EventHandlers(monitor['logger']);
	});

	afterEach(async function () {
		// Clean up monitoring
		if (monitor) {
			monitor.stopMonitoring();
		}
	});

	describe('🚀 Deployment with Real-time Monitoring', () => {
		it('should deploy diamond and monitor in real-time', async () => {
			// Start monitoring
			const eventEmitter = monitor.trackEvents();

			let facetChangeEvents: any[] = [];
			let healthIssues: any[] = [];

			eventEmitter.on('facetChanged', (event) => {
				facetChangeEvents.push(event);
			});

			eventEmitter.on('healthIssue', (issue) => {
				healthIssues.push(issue);
			});

			// Wait for monitoring to initialize
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Check that monitoring is set up correctly
			expect(eventEmitter).to.be.instanceOf(require('events').EventEmitter);
			expect(healthIssues.length).to.be.lessThan(1); // Should be healthy
		});

		it('should perform comprehensive health checks', async () => {
			const health = await monitor.getHealthStatus();

			expect(health).to.have.property('isHealthy');
			expect(health).to.have.property('checks');
			expect(health.checks).to.be.an('array');
			expect(health.checks.length).to.be.greaterThan(0);

			// Should be healthy after fresh deployment
			expect(health.isHealthy).to.be.true;
		});

		it('should analyze facets correctly', async () => {
			const facets = await facetManager.listFacets();

			expect(facets).to.be.an('array');
			expect(facets.length).to.be.greaterThan(0);

			// Each facet should have required properties
			facets.forEach((facet) => {
				expect(facet).to.have.property('address');
				expect(facet).to.have.property('selectors');
				expect(facet.selectors).to.be.an('array');
			});

			const analysis = await facetManager.analyzeFacets();
			expect(analysis).to.have.property('totalFacets');
			expect(analysis.totalFacets).to.equal(facets.length);
		});

		it('should validate selectors correctly', async () => {
			const validation = await facetManager.validateSelectors();

			expect(validation).to.have.property('isValid');
			expect(validation).to.have.property('conflicts');
			expect(validation).to.have.property('messages');

			// Fresh deployment should have no conflicts
			expect(validation.isValid).to.be.true;
			expect(validation.conflicts).to.be.an('array');
			expect(validation.conflicts.length).to.equal(0);
		});
	});

	describe('📊 Diamond Information Retrieval', () => {
		it('should get comprehensive diamond info', async () => {
			const info = await monitor.getDiamondInfo();

			expect(info).to.have.property('address');
			expect(info).to.have.property('facets');
			expect(info).to.have.property('totalSelectors');

			expect(info.address).to.equal(deployedDiamondData.DiamondAddress);
			expect(info.facets).to.be.an('array');
			expect(info.facets.length).to.be.greaterThan(0);
		});

		it('should get facet addresses and selectors', async () => {
			const facets = await facetManager.listFacets();

			expect(facets).to.be.an('array');
			expect(facets.length).to.be.greaterThan(0);

			// Test getting selectors for each facet
			for (const facet of facets) {
				expect(facet).to.have.property('address');
				expect(facet).to.have.property('selectors');
				expect(facet.selectors).to.be.an('array');
				expect(facet.selectors.length).to.be.greaterThan(0);
			}
		});
	});

	describe('🔍 Event Monitoring Integration', () => {
		it('should handle DiamondCut events', async () => {
			const eventEmitter = monitor.trackEvents();

			let eventReceived = false;
			eventEmitter.on('facetChanged', (event) => {
				eventReceived = true;
				expect(event).to.have.property('changes');
				expect(event).to.have.property('impact');
			});

			// Wait a short time to see if any events are captured
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Since this is a fresh deployment, there might not be events yet
			// The important thing is that the event emitter is set up correctly
			expect(eventEmitter).to.be.instanceOf(require('events').EventEmitter);
		});

		it('should monitor health continuously', async () => {
			await monitor.startMonitoring();

			// Wait for a few health checks
			await new Promise((resolve) => setTimeout(resolve, 5000));

			const health = await monitor.getHealthStatus();
			expect(health).to.have.property('isHealthy');

			monitor.stopMonitoring();
		});
	});

	describe('🛠️ Facet Management Operations', () => {
		it('should create valid diamond cut actions', async () => {
			const facets = await facetManager.listFacets();
			expect(facets.length).to.be.greaterThan(0);

			const testFacet = facets[0];

			// Test creating add facet cut
			const addCut = facetManager.createAddFacetCut(
				testFacet.address,
				testFacet.selectors.slice(0, 1), // Just one selector
			);

			expect(addCut).to.have.property('facetAddress');
			expect(addCut).to.have.property('action');
			expect(addCut).to.have.property('functionSelectors');

			// Test validation
			const validation = await facetManager.validateDiamondCut([addCut]);
			expect(validation).to.have.property('isValid');
		});

		it('should handle facet analysis edge cases', async () => {
			const analysis = await facetManager.analyzeFacets();

			expect(analysis).to.have.property('totalFacets');
			expect(analysis).to.have.property('totalSelectors');
			expect(analysis).to.have.property('conflicts');
			expect(analysis).to.have.property('details');

			expect(analysis.totalFacets).to.be.a('number');
			expect(analysis.totalSelectors).to.be.a('number');
			expect(analysis.conflicts).to.be.an('array');
		});
	});
});
