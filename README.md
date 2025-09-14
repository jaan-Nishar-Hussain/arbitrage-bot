# DeFi Arbitrage Bot

A backend service that finds arbitrage opportunities between Uniswap V2-compatible decentralized exchanges. The bot monitors real-time token prices, detects price differences, calculates potential profits, and simulates trades without executing them on-chain.

## What it does

The bot continuously scans multiple DEXs looking for the same token pairs with different prices. When it finds a profitable opportunity (after accounting for swap fees and gas costs), it simulates the trade and saves the result to a database. You can then query these opportunities through a REST API.

The bot supports two types of arbitrage:

- **Simple arbitrage**: Buy low on one DEX, sell high on another
- **Triangular arbitrage**: Find profitable cycles like ETH → USDC → DAI → ETH on the same DEX

## Features

- Monitors Uniswap V2 and SushiSwap (easily extensible to other V2 forks)
- Real-time price fetching using blockchain RPC calls
- Accurate profit calculations including 0.3% swap fees and gas costs
- Trade simulation using actual Uniswap V2 formulas
- PostgreSQL database for storing opportunities
- REST API for querying results
- Configurable profit thresholds and safety margins
- Docker setup for easy deployment

## How it works

### Price monitoring

The bot fetches token reserves from DEX factory contracts and calculates current prices. It uses efficient batching to minimize RPC calls and caches token metadata.

### Arbitrage detection

For simple arbitrage, it compares prices of the same token pair across different DEXs. For triangular arbitrage, it tests all possible three-token cycles within a single DEX.

### Profit calculation

Using the Uniswap V2 formula: `amountOut = (amountIn × 997 × reserveOut) / (reserveIn × 1000 + amountIn × 997)`

The bot accounts for:

- 0.3% trading fees (0.6% total for round-trip)
- Gas costs for trade execution
- Price impact from large trades
- Configurable safety margins

### Trade simulation

All trades are simulated only - no real money is at risk. The bot calculates what would happen if the trade were executed, including slippage and fees.

## Setup

You'll need Node.js 18+, PostgreSQL, and an Ethereum RPC endpoint.

### Quick start with Docker

```bash
git clone <repo-url>
cd arbitrage-bot
cp .env.example .env
# Edit .env with your RPC URL and database settings
docker-compose up
```

### Manual setup

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables in `.env`:

```env
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
DATABASE_URL=postgresql://user:password@localhost:5432/arbitrage_db
MIN_PROFIT_WEI=1000000000000000
GAS_PRICE_GWEI=20
SAFETY_MARGIN=0.02
```

3. Start PostgreSQL and run migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Start the bot:

```bash
npm run dev
```

## API endpoints

### Get opportunities

`GET /api/opportunities`

Query parameters:

- `limit` - Number of results (max 100, default 20)
- `offset` - Pagination offset
- `arbitrageType` - Filter by SIMPLE or TRIANGULAR
- `minProfit` - Minimum profit threshold in wei
- `sortBy` - Sort by createdAt, profitPercent, or netProfit
- `sortOrder` - asc or desc

### Get opportunity details

`GET /api/opportunities/:id`

### Get statistics

`GET /api/opportunities/stats`

### Health check

`GET /health`

## Configuration

Key environment variables:

| Variable             | Description                         | Default          |
| -------------------- | ----------------------------------- | ---------------- |
| `MIN_PROFIT_WEI`     | Minimum profit threshold            | 0.001 ETH        |
| `GAS_PRICE_GWEI`     | Gas price for cost estimation       | 20 Gwei          |
| `SAFETY_MARGIN`      | Safety margin percentage            | 2%               |
| `ARB_DETECTION_CRON` | How often to scan for opportunities | Every 10 seconds |

## Testing

```bash
npm test
```

The test suite includes unit tests for the Uniswap V2 formulas, arbitrage simulation, and profit calculations.

## Project structure

```
src/
├── api/           # REST API routes and server setup
├── services/      # Core business logic
│   ├── dex.ts     # DEX interactions and price fetching
│   └── simulator.ts # Trade simulation and profit calculation
├── workers/       # Background job for opportunity detection
├── db/            # Database client and models
├── utils/         # Helper functions and utilities
└── config.ts      # Environment configuration

prisma/            # Database schema and migrations
tests/             # Unit and integration tests
docker/            # Docker configuration
```

## Important notes

- This bot only simulates trades - it never executes real transactions
- Arbitrage opportunities are rare and often tiny due to MEV bots and high gas costs
- The bot is primarily educational and for understanding DeFi mechanics
- Always verify calculations before using any results for actual trading

## Technical details

The bot uses ethers.js to interact with Ethereum, Fastify for the web server, Prisma for database access, and Jest for testing. It's designed to be stateless and horizontally scalable.

The core arbitrage detection runs on a configurable schedule (default every 10 seconds). Each scan fetches current reserves from multiple DEXs, calculates potential profits for various trade sizes, and stores profitable opportunities.

Price impact is calculated as the difference between spot price and execution price. The bot applies safety margins to account for changing market conditions between detection and execution.

For triangular arbitrage, the bot enumerates common token triangles (like ETH-USDC-DAI-ETH) and calculates if completing the full cycle would be profitable after fees.

## License

MIT

MIT
