#!/usr/bin/env npx ts-node

import hre from 'hardhat';

async function testExampleUpgradeFacet() {
	try {
		const artifact = await hre.artifacts.readArtifact('ExampleUpgradeFacet');
		console.log('✅ ExampleUpgradeFacet artifact found:');
		console.log(`   Contract Name: ${artifact.contractName}`);

		const functions = artifact.abi.filter((f: any) => f.type === 'function');
		console.log(`   Functions: ${functions.length}`);

		functions.forEach((func: any) => {
			const signature = `${func.name}(${func.inputs.map((i: any) => i.type).join(',')})`;
			const selector = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(signature)).slice(0, 10);
			console.log(`     - ${signature}: ${selector}`);
		});
	} catch (error: any) {
		console.log('❌ Error loading ExampleUpgradeFacet artifact:', error.message);
	}
}

testExampleUpgradeFacet().catch(console.error);
