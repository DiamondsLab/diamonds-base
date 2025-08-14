import { generateDiamondAbi, DiamondAbiGenerationOptions } from './diamond-abi-generator';
import { spawn } from 'child_process';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Generate diamond ABI and regenerate TypeChain types
 */
async function generateDiamondAbiWithTypechain(options: DiamondAbiGenerationOptions) {
  try {
    console.log(chalk.blue(`🚀 Generating Diamond ABI for ${options.diamondName}...`));
    
    const result = await generateDiamondAbi(options);

    console.log(chalk.green(`✅ Diamond ABI generated: ${result.outputPath}`));
    console.log(chalk.blue(`   Functions: ${result.stats.totalFunctions}`));
    console.log(chalk.blue(`   Events: ${result.stats.totalEvents}`));
    console.log(chalk.blue(`   Facets: ${result.stats.facetCount}`));

    // Generate TypeScript types directly using TypeChain
    console.log(chalk.blue('🔧 Regenerating TypeChain types for Diamond...'));
    
    await runCommand('npx', [
      'typechain',
      '--target', 'ethers-v6',
      '--out-dir', 'diamond-typechain-types',
      result.outputPath!
    ], {
      stdio: options.verbose ? 'inherit' : 'pipe'
    });

    console.log(chalk.green('✅ TypeChain types regenerated successfully!'));
    
    return result;
  } catch (error) {
    console.error(chalk.red('❌ Failed to generate diamond ABI:'), error);
    throw error;
  }
}

/**
 * Run a command and return a promise
 */
function runCommand(command: string, args: string[], options: any = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// CLI support
if (require.main === module) {
  const diamondName = process.argv[2] || 'ExampleDiamond';
  const verbose = process.argv.includes('--verbose');
  
  const options: DiamondAbiGenerationOptions = {
          diamondName: diamondName,
          verbose: verbose,
          diamondsPath: 'diamonds'
        };
        
  generateDiamondAbiWithTypechain(options)
    .then(() => {
      console.log(chalk.green('🎉 Complete! Diamond ABI and TypeChain types are ready.'));
      process.exit(0);
    })
    .catch((error) => {
      console.error(chalk.red('❌ Process failed:'), error);
      process.exit(1);
    });
}

export { generateDiamondAbiWithTypechain };
