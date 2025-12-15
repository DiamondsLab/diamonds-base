/**
 * Core deployment function for RPC-based Diamond deployment
 * Can be called from either CLI or Hardhat runtime
 */

import { RPCDiamondDeployer } from '../../setup/RPCDiamondDeployer';
import {
	DeploymentOptions,
	createRPCConfig,
	showOperationSummary,
	showPreOperationInfo,
} from './common';

/**
 * Main deployment function
 */
export async function deployDiamond(options: DeploymentOptions): Promise<void> {
	const config = createRPCConfig(options);
	const startTime = Date.now();

	await showPreOperationInfo(config, 'Diamond Deployment', {
		'🔧 Force Deploy': options.force ? 'Yes' : 'No',
		'✅ Skip Verification': options.skipVerification ? 'Yes' : 'No',
	});

	const deployer = await RPCDiamondDeployer.getInstance(config);

	console.log(`🏁 Starting deployment of diamond "${config.diamondName}"...`);

	const diamond = await deployer.deployDiamond();

	const duration = (Date.now() - startTime) / 1000;
	const deployedData = diamond.getDeployedDiamondData();
	const deploymentStatus = deployer.getDeploymentStatus();

	showOperationSummary('Diamond Deployment', duration, {
		'💎 Diamond Address': deployedData.DiamondAddress,
		'📈 Status': deploymentStatus,
		'🎯 Network': config.networkName,
		'⛽ Chain ID': config.chainId,
	});
}
