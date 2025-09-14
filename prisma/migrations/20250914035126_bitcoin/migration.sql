-- CreateEnum
CREATE TYPE "ArbitrageType" AS ENUM ('SIMPLE', 'TRIANGULAR');

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "baseToken" TEXT NOT NULL,
    "quoteToken" TEXT NOT NULL,
    "baseTokenSymbol" TEXT,
    "quoteTokenSymbol" TEXT,
    "buyDex" TEXT NOT NULL,
    "sellDex" TEXT NOT NULL,
    "amountIn" TEXT NOT NULL,
    "amountOut" TEXT NOT NULL,
    "estimatedProfit" TEXT NOT NULL,
    "profitPercent" DOUBLE PRECISION NOT NULL,
    "gasEstimate" TEXT NOT NULL,
    "netProfit" TEXT NOT NULL,
    "buyPrice" TEXT NOT NULL,
    "sellPrice" TEXT NOT NULL,
    "priceImpact" DOUBLE PRECISION NOT NULL,
    "arbitrageType" "ArbitrageType" NOT NULL DEFAULT 'SIMPLE',
    "intermediateToken" TEXT,
    "tokenPath" TEXT,
    "blockNumber" BIGINT,
    "gasPrice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_pairs" (
    "id" TEXT NOT NULL,
    "tokenA" TEXT NOT NULL,
    "tokenB" TEXT NOT NULL,
    "uniswapPair" TEXT,
    "sushiPair" TEXT,
    "tokenASymbol" TEXT,
    "tokenBSymbol" TEXT,
    "tokenADecimals" INTEGER,
    "tokenBDecimals" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics" (
    "id" TEXT NOT NULL,
    "totalOpportunities" INTEGER NOT NULL DEFAULT 0,
    "profitableOpportunities" INTEGER NOT NULL DEFAULT 0,
    "totalPotentialProfit" TEXT NOT NULL DEFAULT '0',
    "lastArbitrageRun" TIMESTAMP(3),
    "averageRuntime" DOUBLE PRECISION,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedBlock" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opportunities_createdAt_idx" ON "opportunities"("createdAt");

-- CreateIndex
CREATE INDEX "opportunities_baseToken_quoteToken_idx" ON "opportunities"("baseToken", "quoteToken");

-- CreateIndex
CREATE INDEX "opportunities_arbitrageType_idx" ON "opportunities"("arbitrageType");

-- CreateIndex
CREATE INDEX "opportunities_netProfit_idx" ON "opportunities"("netProfit");

-- CreateIndex
CREATE UNIQUE INDEX "token_pairs_tokenA_tokenB_key" ON "token_pairs"("tokenA", "tokenB");
