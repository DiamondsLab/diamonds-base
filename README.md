# Diamonds for Hardhat Boilerplate

This is a boilerplate project for building modular and upgradeable smart contracts using the EIP-2535 Diamond Standard with Hardhat.

## Features

- Modular contract architecture
- Upgradeable contracts
- ERC165 interface support
- Ownership management through facets

## Getting Started

To get started with this boilerplate, follow these steps:

1. Clone the repository:

```bash
git clone https://github.com/GeniusVentures/diamonds-base.git
```

2. Install dependencies:

```bash
cd diamonds-base
npm install
```

3. Configure your environment variables:

```bash
cp .env.example .env
```

4. Deploy your contracts:

```bash
npx hardhat run scripts/deploy.ts
```

## License

This project is licensed under the MIT License.
