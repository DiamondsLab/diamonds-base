# Diamonds Base Project

A modular, upgradeable smart contract system built on the ERC-2535 Diamond Proxy Standard, providing a flexible foundation for decentralized autonomous organization (DAO) functionality.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Hardhat](https://img.shields.io/badge/Built%20with-Hardhat-FFDB1C.svg)](https://hardhat.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Solidity](https://img.shields.io/badge/Solidity-%23363636.svg?logo=solidity&logoColor=white)](https://soliditylang.org/)

## 🌟 Features

- **💎 Diamond Proxy Architecture**: Implements ERC-2535 for unlimited contract size and modularity
- **🔄 Seamless Upgrades**: Add, replace, or remove functionality without changing the main contract address
- **🏗️ Modular Design**: Organized facet system for clear separation of concerns
- **🛡️ Enterprise Security**: OpenZeppelin Defender integration for production deployments
- **🧪 Comprehensive Testing**: Multi-chain testing environment with extensive test coverage
- **⚡ TypeScript Integration**: Full type safety with auto-generated TypeScript bindings
- **🌐 Multi-Network Support**: Deploy across multiple EVM-compatible networks
- **📊 Advanced Monitoring**: Real-time deployment tracking and status monitoring

## 🏗️ Architecture

### Diamond Proxy Pattern (ERC-2535)

```bash
┌─────────────────┐
│   Diamond       │  ← Main contract (never changes address)
│   (Proxy)       │
└─────────┬───────┘
          │
    ┌─────▼─────┐
    │ Diamond   │
    │ Storage   │
    └─────┬─────┘
          │
    ┌─────▼─────────────────────────────┐
    │           Facets                  │
    ├─────────────┬─────────────────────┤
    │ Ownership   │ Access Control      │
    │ Facet       │ Facet               │
    ├─────────────┼─────────────────────┤
    │ Diamond     │ Diamond             │
    │ Cut Facet   │ Loupe Facet         │
    ├─────────────┼─────────────────────┤
    │ Init        │ Custom              │
    │ Facet       │ Facets              │
    └─────────────┴─────────────────────┘
```

### Core Facets

- **DiamondCutFacet**: Handles diamond upgrades (add/replace/remove facets)
- **DiamondLoupeFacet**: Inspection functions for facets and selectors
- **ExampleOwnershipFacet**: Ownership management and access control
- **ExampleAccessControlFacet**: Role-based access control system
- **ExampleInitFacet**: Initialization and upgrade logic

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Yarn (recommended) or npm
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/GeniusVentures/diamonds-base.git
cd diamonds-base

# Install dependencies
yarn install

# Copy environment template
cp .env.example .env
```

### Configuration

Set up your environment variables in `.env`:

```bash
# Network Configuration
MAINNET_RPC=https://mainnet.infura.io/v3/your-key
SEPOLIA_RPC=https://sepolia.infura.io/v3/your-key
POLYGON_RPC=https://polygon-mainnet.g.alchemy.com/v2/your-key

# Deployment Keys
PRIVATE_KEY=your_private_key_here
TEST_PRIVATE_KEY=your_test_private_key_here

# API Keys for Verification
ETHERSCAN_API_KEY=your_etherscan_api_key
POLYGONSCAN_API_KEY=your_polygonscan_api_key
```

### Compile Contracts

```bash
# Compile all contracts and generate Diamond ABI with TypeScript types
yarn compile

# Build TypeScript and compile contracts with Diamond ABI generation
yarn build

# Clean compiled artifacts
yarn clean
```

### Run Tests

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn coverage

# Run specific test file
yarn test test/unit/diamond-abi-generator.test.ts
```

## 📦 Deployment

### Available Scripts

The project includes the following yarn scripts defined in `package.json`:

```bash
# Development Scripts
yarn clean              # Clean compiled artifacts
yarn compile            # Compile contracts and generate Diamond ABI
yarn build              # Build TypeScript, compile contracts, and generate ABI (⚠️ currently has TypeScript errors)
yarn test               # Run all tests
yarn coverage           # Run tests with coverage report

# ABI Generation Scripts  
yarn generate-diamond-abi           # Generate Diamond ABI
yarn generate-diamond-abi-typechain # Generate Diamond ABI with TypeChain types
```

> **Note**: The `yarn build` command currently has TypeScript compilation errors that need to be resolved. For development, use `yarn compile` which works correctly.

### Custom Deployment

For deployment, you'll need to use the deployment scripts directly:

```bash
# Example: Deploy using TypeScript scripts
npx ts-node scripts/deploy/rpc/deploy-rpc.ts ExampleDiamond sepolia

# Example: Deploy using Defender
npx ts-node scripts/deploy/defender/deploy-defender.ts ExampleDiamond mainnet
```

### Deployment Scripts

The project includes several deployment strategies using TypeScript scripts:

#### RPC Deployment (Direct)

```bash
# Basic deployment
npx ts-node scripts/deploy/rpc/deploy-rpc.ts ExampleDiamond sepolia

# With custom options (if supported by script)
npx ts-node scripts/deploy/rpc/deploy-rpc.ts ExampleDiamond sepolia --verbose

# Manual step-by-step deployment
npx ts-node scripts/deploy/rpc/deploy-rpc-manual.ts ExampleDiamond sepolia
```

#### Defender Deployment (Recommended for Production)

```bash
# Deploy via OpenZeppelin Defender
npx ts-node scripts/deploy/defender/deploy-defender.ts ExampleDiamond mainnet

# Check deployment status
npx ts-node scripts/deploy/defender/status-defender.ts ExampleDiamond mainnet
```

## 🔧 Development Tools

### Diamond Management

```bash
# Check deployment status
npx ts-node scripts/deploy/rpc/status-rpc.ts ExampleDiamond sepolia --detailed

# Verify deployment integrity
npx ts-node scripts/deploy/rpc/verify-rpc.ts ExampleDiamond sepolia --etherscan

# Upgrade diamond (add new facets or update existing ones)
npx ts-node scripts/deploy/rpc/upgrade-rpc.ts ExampleDiamond sepolia
```

### ABI Generation

The project automatically generates a combined Diamond ABI with TypeScript types:

```bash
# Generate Diamond ABI
yarn generate-diamond-abi

# Generate with TypeChain types  
yarn generate-diamond-abi-typechain

# Build everything (compile + generate ABI)
yarn build
```

### Testing

```bash
# Run all tests
yarn test

# Run tests with coverage
yarn coverage

# Run specific test files
yarn test test/unit/diamond-abi-generator.test.ts
yarn test test/integration/defender/DefenderDeployment.test.ts
```

## 📁 Project Structure

```bash
diamonds-base/
├── contracts/                    # Solidity smart contracts
│   └── examplediamond/           # Diamond facet contracts
│       ├── facets/               # Individual facet implementations
│       ├── interfaces/           # Solidity interfaces
│       ├── libraries/            # Shared libraries
│       └── upgradeInitializers/  # Upgrade initialization contracts
├── diamonds/                     # Diamond configuration
│   └── ExampleDiamond/          # Diamond-specific config
│       ├── deployments/          # Deployment records
│       ├── callbacks/            # Post-deployment callbacks
│       └── examplediamond.config.json  # Facet configuration
├── scripts/                      # Deployment and utility scripts
│   ├── deploy/                   # Deployment strategies
│   │   ├── rpc/                  # Direct RPC deployment
│   │   └── defender/             # OpenZeppelin Defender deployment
│   ├── setup/                    # Deployment infrastructure
│   └── utils/                    # Utility functions
├── test/                         # Test suite
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── deployment/               # Deployment tests
├── typechain-types/              # Generated TypeScript types
├── diamond-typechain-types/      # Diamond-specific TypeScript types
└── diamond-abi/                  # Generated Diamond ABI artifacts
```

## 🔧 Configuration

### Diamond Configuration

The diamond configuration is defined in `diamonds/ExampleDiamond/examplediamond.config.json`:

```json
{
  "protocolVersion": 1.0,
  "protocolInitFacet": "ExampleInitFacet",
  "facets": {
    "DiamondCutFacet": {
      "priority": 10,
      "versions": { "0.0": {} }
    },
    "DiamondLoupeFacet": {
      "priority": 20,
      "versions": { "0.0": {} }
    },
    "ExampleOwnershipFacet": {
      "priority": 30,
      "versions": { "0.0": {} }
    }
  }
}
```

### Hardhat Configuration

Key configurations in `hardhat.config.ts`:

- **Multi-chain support** via `hardhat-multichain`
- **Diamond configuration** via `hardhat-diamonds`
- **Network settings** for multiple EVM chains
- **Compiler optimization** for gas efficiency

## 🧪 Testing Strategy

### Test Categories

1. **Unit Tests**: Individual facet testing
2. **Integration Tests**: Cross-facet functionality
3. **Deployment Tests**: End-to-end deployment validation
4. **Multi-chain Tests**: Cross-network compatibility

### Test Environment

```bash
# Run tests with Hardhat
yarn test

# Test with coverage
yarn coverage

# Test specific files
yarn test test/specific-test-file.test.ts
```

### Test Utilities

- **Diamond test helpers**: Load and interact with deployed diamonds
- **Network utilities**: Multi-chain test orchestration
- **Mock contracts**: Isolated testing environments

## 🔒 Security

### Security Features

- **Multi-signature support** via OpenZeppelin Defender
- **Role-based access control** with granular permissions
- **Upgrade authorization** with ownership verification
- **Function selector collision prevention**
- **Comprehensive test coverage** including edge cases

### Security Tools

- **Slither**: Static analysis for vulnerability detection
- **OpenZeppelin Defender**: Production-grade security monitoring
- **Coverage reports**: Ensure comprehensive testing
- **Gas optimization**: Efficient contract execution

## 🚀 Deployment Strategies

### 1. Local Development

- Instant deployment and testing
- Full upgrade simulation
- Development-focused tooling

### 2. RPC Deployment

- Direct blockchain interaction
- Custom gas strategies
- Retry mechanisms for reliability

### 3. OpenZeppelin Defender

- Multi-signature workflow
- Automated monitoring
- Enterprise security features

## 📚 Advanced Usage

### Custom Facet Development

```solidity
// Example: Create a new facet
pragma solidity ^0.8.9;

import "../libraries/LibDiamond.sol";

contract CustomFacet {
    function customFunction() external {
        LibDiamond.enforceIsContractOwner();
        // Your logic here
    }
}
```

### Diamond Upgrades

```bash
# Add new facet
npx ts-node scripts/deploy/rpc/upgrade-rpc.ts ExampleDiamond sepolia

# Dry run upgrade (see what will change, if supported by script)
npx ts-node scripts/deploy/rpc/upgrade-rpc.ts ExampleDiamond sepolia --dry-run
```

### TypeScript Integration

```typescript
import { ExampleDiamond } from '../diamond-typechain-types';
import { ethers } from 'hardhat';

// Type-safe contract interaction
const diamond = await ethers.getContractAt(
  'ExampleDiamond',
  diamondAddress
) as ExampleDiamond;

// All functions are typed and auto-completed
await diamond.transferOwnership(newOwner);
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Run the test suite: `yarn test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Standards

- **Solidity**: Follow official style guide
- **TypeScript**: ESLint + Prettier configuration
- **Testing**: Minimum 80% coverage required
- **Documentation**: Comprehensive inline documentation

## 📖 Documentation

- [Diamond Standard (EIP-2535)](https://eips.ethereum.org/EIPS/eip-2535)
- [OpenZeppelin Defender Docs](https://docs.openzeppelin.com/defender/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [TypeChain Documentation](https://github.com/dethcrypto/TypeChain)

## 🐛 Troubleshooting

### Common Issues

#### TypeScript build errors

```bash
# The yarn build command currently has TypeScript compilation errors
# Use yarn compile instead for development:
yarn clean
yarn compile
```

#### Diamond ABI generation fails

```bash
# Clean and regenerate
yarn clean
yarn compile
# OR
yarn build
```

#### Compilation errors

```bash
# Clean all artifacts and rebuild
yarn clean
yarn compile
```

#### Test failures related to missing artifacts

```bash
# Some tests may fail due to missing contract artifacts
# Ensure contracts are compiled first:
yarn compile
yarn test
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [EIP-2535 Diamond Standard](https://eips.ethereum.org/EIPS/eip-2535) by Nick Mudge
- [OpenZeppelin](https://openzeppelin.com/) for security standards
- [Hardhat](https://hardhat.org/) for development framework
- [TypeChain](https://github.com/dethcrypto/TypeChain) for TypeScript integration
