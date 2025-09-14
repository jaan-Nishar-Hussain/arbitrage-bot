# DeFi Arbitrage Trading Bot

A sophisticated TypeScript/Node.js backend service that detects and simulates arbitrage opportunities across Uniswap V2-compatible DEXs. Features real-time price monitoring, triangular arbitrage detection, profit calculation, and a REST API for accessing opportunities.

## 🚀 Features

- **Multi-DEX Support**: Monitors Uniswap V2, SushiSwap, and other V2-compatible DEXs
- **Real-time Price Monitoring**: Fetches token prices and reserves in real-time
- **Simple Arbitrage**: Detects price differences between two DEXs for the same token pair
- **Triangular Arbitrage**: Identifies profitable cycles (A→B→C→A) within the same DEX
- **Profit Simulation**: Accurately calculates profits considering swap fees, gas costs, and safety margins
- **Database Storage**: Stores all opportunities in PostgreSQL with detailed metadata
- **REST API**: Comprehensive API to query opportunities, statistics, and system status
- **Production Ready**: Docker containerization, logging, error handling, and graceful shutdown

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DEX Service   │    │   Simulator     │    │ Arbitrage       │
│                 │    │   Service       │    │ Detector        │
│ • Get Reserves  │───▶│                 │───▶│                 │
│ • Token Info    │    │ • getAmountOut  │    │ • Simple Arb    │
│ • Pair Address  │    │ • Price Impact  │    │ • Triangular    │
└─────────────────┘    │ • Multi-hop     │    │ • Optimization  │
                       └─────────────────┘    └─────────────────┘
                                                       │
┌─────────────────┐    ┌─────────────────┐            │
│   Fastify API   │    │   PostgreSQL    │◀───────────┘
│                 │    │   Database      │
│ • /opportunities│    │                 │
│ • /status       │    │ • Opportunities │
│ • /stats        │    │ • System Metrics│
└─────────────────┘    └─────────────────┘
```

## 📊 Mathematical Formulas

### Uniswap V2 getAmountOut Formula
```
amountOut = (amountIn × 997 × reserveOut) / (reserveIn × 1000 + amountIn × 997)
```
- The 997/1000 factor represents the 0.3% trading fee
- `reserveIn`: Reserve of input token
- `reserveOut`: Reserve of output token

### Simple Arbitrage Profit
```
profit = sellAmount - buyAmount - gasCost
profitPercent = (profit / buyAmount) × 100
```

### Price Impact Calculation
```
spotPrice = reserveOut / reserveIn
executionPrice = amountOut / amountIn
priceImpact = ((spotPrice - executionPrice) / spotPrice) × 100
```

### Triangular Arbitrage
For a cycle A→B→C→A:
```
step1: amountB = getAmountOut(amountA, reserveA_AB, reserveB_AB)
step2: amountC = getAmountOut(amountB, reserveB_BC, reserveC_BC)  
step3: finalA = getAmountOut(amountC, reserveC_CA, reserveA_CA)
profit = finalA - amountA - gasCost
```

## 🛠️ Setup Instructions

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Ethereum RPC endpoint (Infura, Alchemy, or local node)

### 1. Clone and Install
```bash
git clone <repository-url>
cd arb-bot
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Required
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
DATABASE_URL=postgresql://postgres:password@localhost:5432/arbitrage_db

# Optional (defaults provided)
MIN_PROFIT_WEI=1000000000000000  # 0.001 ETH
GAS_PRICE_GWEI=20
SAFETY_MARGIN=0.02               # 2%
ARB_DETECTION_CRON=*/10 * * * * * # Every 10 seconds
```

### 3. Database Setup

#### Option A: Docker (Recommended)
```bash
# Start PostgreSQL with Docker Compose
docker-compose up -d postgres

# Generate Prisma client and run migrations
npm run prisma:generate
npm run prisma:migrate
```

#### Option B: Local PostgreSQL
```bash
# Install PostgreSQL locally, then:
createdb arbitrage_db
npm run prisma:generate
npm run prisma:migrate
```

### 4. Development Mode
```bash
# Start in development with hot reload
npm run dev

# Or start the full stack with Docker
docker-compose up
```

### 5. Production Deployment
```bash
# Build and run with Docker
docker-compose up -d

# Or build manually
npm run build
npm start
```

## 🔧 API Endpoints

### Health & Status
- `GET /health` - Health check
- `GET /status` - System status and metrics

### Opportunities
- `GET /api/opportunities` - List all opportunities with pagination
  - Query params: `limit`, `offset`, `arbitrageType`, `minProfit`, `sortBy`, `sortOrder`
- `GET /api/opportunities/:id` - Get specific opportunity
- `GET /api/opportunities/stats` - Opportunity statistics
- `GET /api/opportunities/best` - Best opportunities (highest profit)

### Example Response
```json
{
  "opportunities": [
    {
      "id": "cm2k8f9x10000...",
      "baseTokenSymbol": "WETH",
      "quoteTokenSymbol": "USDC",
      "buyDex": "Uniswap V2",
      "sellDex": "SushiSwap",
      "profitPercent": 1.25,
      "netProfit": "12500000000000000",
      "arbitrageType": "SIMPLE",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "hasNext": true
  }
}
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage

# Watch mode for development
npm run test:watch
```

Key test files:
- `tests/simulator.test.ts` - Tests for Uniswap V2 formulas and arbitrage simulation
- `tests/setup.ts` - Test configuration

## 📁 Project Structure

```
arb-bot/
├── src/
│   ├── api/
│   │   ├── server.ts              # Fastify server setup
│   │   └── routes/
│   │       └── opportunities.ts   # API routes
│   ├── services/
│   │   ├── dex.ts                 # DEX interaction (reserves, prices)
│   │   └── simulator.ts           # Uniswap V2 formulas & simulation
│   ├── workers/
│   │   └── arbDetector.ts         # Main arbitrage detection logic
│   ├── db/
│   │   └── prismaClient.ts        # Database client
│   ├── utils/
│   │   ├── bn.ts                  # BigNumber utilities
│   │   └── logger.ts              # Logging configuration
│   ├── config.ts                  # Environment configuration
│   └── index.ts                   # Application entrypoint
├── prisma/
│   └── schema.prisma              # Database schema
├── tests/                         # Test files
├── docker/                        # Docker configuration
├── docker-compose.yml             # Multi-service setup
├── Dockerfile                     # App containerization
└── README.md                      # This file
```

## 🔍 How It Works

### 1. Price Monitoring
- The `DEXService` continuously fetches reserves from Uniswap V2 and SushiSwap factory contracts
- Uses multicall for efficient batching of blockchain requests
- Caches token metadata (symbol, decimals) to reduce redundant calls

### 2. Arbitrage Detection

#### Simple Arbitrage
1. Compare prices of the same token pair across different DEXs
2. Calculate potential profit using `SimulatorService.simulateSimpleArbitrage()`
3. Account for gas costs and apply safety margin
4. Store profitable opportunities in database

#### Triangular Arbitrage  
1. Enumerate all possible token triplets (A→B→C→A)
2. For each path, simulate the complete trade cycle
3. Calculate final return amount and subtract gas costs
4. Identify cycles where `finalAmount > initialAmount + gasCosts`

### 3. Profit Optimization
- Binary search algorithm to find optimal trade amounts
- Considers price impact and diminishing returns for larger trades
- Applies configurable safety margins to account for MEV and slippage

### 4. Data Persistence
- All opportunities stored in PostgreSQL with complete metadata
- Tracks block numbers, gas prices, and execution timestamps
- Maintains system metrics for monitoring and analytics

## ⚙️ Configuration Options

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `RPC_URL` | Ethereum RPC endpoint | Required |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `MIN_PROFIT_WEI` | Minimum profit threshold (wei) | 0.001 ETH |
| `GAS_PRICE_GWEI` | Gas price for cost estimation | 20 Gwei |
| `GAS_LIMIT` | Gas limit for arbitrage transactions | 200,000 |
| `SAFETY_MARGIN` | Safety margin percentage | 2% |
| `ARB_DETECTION_CRON` | Cron schedule for detection | Every 10s |
| `PORT` | API server port | 3000 |
| `LOG_LEVEL` | Logging level | info |

## 🚨 Production Considerations

### Security
- **Private Keys**: This bot simulates trades only - no private keys required
- **RPC Limits**: Implement rate limiting for RPC calls to avoid hitting provider limits
- **Database**: Use connection pooling and proper indexes for production loads

### Performance
- **Caching**: Token metadata is cached to reduce redundant blockchain calls
- **Batch Requests**: Use multicall patterns for fetching multiple reserves
- **Database Indexes**: Proper indexing on frequently queried columns

### Monitoring
- **Metrics**: Built-in system metrics tracking via `/status` endpoint
- **Logging**: Structured logging with configurable levels
- **Health Checks**: Docker health checks and API health endpoint

### Scaling
- **Horizontal**: Multiple worker instances can run in parallel
- **Vertical**: Increase detection frequency by adjusting cron schedule
- **Database**: PostgreSQL supports read replicas for scaling queries

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and add tests
4. Ensure tests pass: `npm test`
5. Commit changes: `git commit -am 'Add your feature'`
6. Push to branch: `git push origin feature/your-feature`
7. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes only. It simulates arbitrage opportunities but does not execute real trades. Always verify calculations and thoroughly test before any live trading. The authors are not responsible for any financial losses.

---

**Built with ❤️ using TypeScript, Node.js, Fastify, Prisma, and ethers.js**
