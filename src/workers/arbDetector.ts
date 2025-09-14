import { DEXService, PairInfo } from "@/services/dex";
import { SimulatorService } from "@/services/simulator";
import { prisma } from "@/db/prismaClient";
import { config } from "@/config";
import { logger } from "@/utils/logger";
import { BN, ZERO, parseEther } from "@/utils/bn";
import { ArbitrageType } from "@prisma/client";

export interface ArbitrageOpportunity {
  baseToken: string;
  quoteToken: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string;
  buyDex: string;
  sellDex: string;
  amountIn: string;
  amountOut: string;
  estimatedProfit: string;
  profitPercent: number;
  gasEstimate: string;
  netProfit: string;
  buyPrice: string;
  sellPrice: string;
  priceImpact: number;
  arbitrageType: ArbitrageType;
  intermediateToken?: string;
  tokenPath?: string[];
}

export interface TriangularOpportunity extends ArbitrageOpportunity {
  intermediateToken: string;
  tokenPath: string[];
  amounts: string[];
  priceImpacts: number[];
}

export class ArbitrageDetector {
  private dexService: DEXService;
  private lastProcessedBlock: number = 0;

  constructor() {
    this.dexService = new DEXService();
  }

  /**
   * Main function to detect all types of arbitrage opportunities
   */
  async detectOpportunities(): Promise<void> {
    const startTime = Date.now();
    logger.info("Starting arbitrage detection...");

    try {
      // Get current block number
      const currentBlock = await this.dexService.getCurrentBlockNumber();

      if (currentBlock <= this.lastProcessedBlock) {
        logger.debug("No new blocks to process");
        return;
      }

      // Detect simple arbitrage opportunities
      const simpleOpportunities = await this.detectSimpleArbitrage();
      logger.info(
        `Found ${simpleOpportunities.length} simple arbitrage opportunities`
      );

      // Detect triangular arbitrage opportunities
      const triangularOpportunities = await this.detectTriangularArbitrage();
      logger.info(
        `Found ${triangularOpportunities.length} triangular arbitrage opportunities`
      );

      // Save opportunities to database
      await this.saveOpportunities([
        ...simpleOpportunities,
        ...triangularOpportunities,
      ]);

      // Update system metrics
      await this.updateSystemMetrics(
        simpleOpportunities.length + triangularOpportunities.length,
        Date.now() - startTime,
        currentBlock
      );

      // Log rate limiter stats
      const stats = this.dexService.getRateLimiterStats();
      logger.info(
        `Rate limiter stats - Queue: ${stats.queueLength}, Requests: ${stats.currentRequestCount}, Token cache: ${stats.tokenCacheSize}, Pair cache: ${stats.pairCacheSize}`
      );

      this.lastProcessedBlock = currentBlock;
      logger.info(
        `Arbitrage detection completed in ${Date.now() - startTime}ms`
      );
    } catch (error) {
      logger.error(`Error in arbitrage detection: ${error}`);
      await this.updateErrorCount();
    }
  }

  /**
   * Detect simple arbitrage opportunities between two DEXs
   */
  private async detectSimpleArbitrage(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const tokenPairs = await this.getTokenPairs();

    // Process pairs in smaller batches to avoid overwhelming the rate limiter
    const batchSize = 5;
    for (let i = 0; i < tokenPairs.length; i += batchSize) {
      const batch = tokenPairs.slice(i, i + batchSize);

      const batchPromises = batch.map(async ({ tokenA, tokenB }) => {
        try {
          // Get pair info from both DEXs sequentially to reduce load
          const uniswapPair = await this.dexService.getPairInfo(
            config.dexes.uniswapV2.factory,
            tokenA,
            tokenB
          );

          if (!uniswapPair) {
            return []; // Skip if pair doesn't exist on Uniswap
          }

          const sushiPair = await this.dexService.getPairInfo(
            config.dexes.sushiswap.factory,
            tokenA,
            tokenB
          );

          if (!sushiPair) {
            return []; // Skip if pair doesn't exist on SushiSwap
          }

          // Check arbitrage in both directions
          const opportunities1 = await this.checkSimpleArbitrageDirection(
            uniswapPair,
            sushiPair,
            config.dexes.uniswapV2.name,
            config.dexes.sushiswap.name
          );

          const opportunities2 = await this.checkSimpleArbitrageDirection(
            sushiPair,
            uniswapPair,
            config.dexes.sushiswap.name,
            config.dexes.uniswapV2.name
          );

          return [...opportunities1, ...opportunities2];
        } catch (error) {
          logger.debug(`Error checking pair ${tokenA}/${tokenB}: ${error}`);
          return [];
        }
      });

      // Wait for batch to complete before processing next batch
      const batchResults = await Promise.all(batchPromises);
      opportunities.push(...batchResults.flat());

      // Log progress
      logger.debug(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          tokenPairs.length / batchSize
        )}`
      );
    }

    return opportunities;
  }

  /**
   * Check arbitrage opportunity in one direction
   */
  private async checkSimpleArbitrageDirection(
    buyDexPair: PairInfo,
    sellDexPair: PairInfo,
    buyDexName: string,
    sellDexName: string
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    // Get gas estimate
    const gasPrice = await this.dexService.getCurrentGasPrice();
    const gasEstimate = gasPrice * BN(config.trading.gasLimit);

    // Try different amounts to find optimal
    const amounts = [
      parseEther("0.1"),
      parseEther("0.5"),
      parseEther("1"),
      parseEther("5"),
      parseEther("10"),
    ];

    for (const amountIn of amounts) {
      try {
        // For tokenA -> tokenB direction
        const resultAB = await this.simulateArbitrage(
          amountIn,
          buyDexPair,
          sellDexPair,
          true, // tokenA -> tokenB
          buyDexName,
          sellDexName,
          gasEstimate
        );

        if (resultAB && BN(resultAB.netProfit) > config.trading.minProfitWei) {
          opportunities.push(resultAB);
        }

        // For tokenB -> tokenA direction
        const resultBA = await this.simulateArbitrage(
          amountIn,
          buyDexPair,
          sellDexPair,
          false, // tokenB -> tokenA
          buyDexName,
          sellDexName,
          gasEstimate
        );

        if (resultBA && BN(resultBA.netProfit) > config.trading.minProfitWei) {
          opportunities.push(resultBA);
        }
      } catch (error) {
        logger.debug(`Error simulating arbitrage: ${error}`);
      }
    }

    return opportunities;
  }

  /**
   * Simulate arbitrage between two pairs
   */
  private async simulateArbitrage(
    amountIn: bigint,
    buyDexPair: PairInfo,
    sellDexPair: PairInfo,
    isTokenAToB: boolean,
    buyDexName: string,
    sellDexName: string,
    gasEstimate: bigint
  ): Promise<ArbitrageOpportunity | null> {
    try {
      let reservesA: [bigint, bigint];
      let reservesB: [bigint, bigint];
      let baseToken: string;
      let quoteToken: string;
      let baseTokenSymbol: string;
      let quoteTokenSymbol: string;

      if (isTokenAToB) {
        // TokenA -> TokenB
        baseToken = buyDexPair.tokenA.address;
        quoteToken = buyDexPair.tokenB.address;
        baseTokenSymbol = buyDexPair.tokenA.symbol;
        quoteTokenSymbol = buyDexPair.tokenB.symbol;

        // Buy DEX: tokenA -> tokenB
        if (
          buyDexPair.reserves.token0.toLowerCase() === baseToken.toLowerCase()
        ) {
          reservesA = [
            buyDexPair.reserves.reserve0,
            buyDexPair.reserves.reserve1,
          ];
        } else {
          reservesA = [
            buyDexPair.reserves.reserve1,
            buyDexPair.reserves.reserve0,
          ];
        }

        // Sell DEX: tokenB -> tokenA
        if (
          sellDexPair.reserves.token0.toLowerCase() === quoteToken.toLowerCase()
        ) {
          reservesB = [
            sellDexPair.reserves.reserve0,
            sellDexPair.reserves.reserve1,
          ];
        } else {
          reservesB = [
            sellDexPair.reserves.reserve1,
            sellDexPair.reserves.reserve0,
          ];
        }
      } else {
        // TokenB -> TokenA
        baseToken = buyDexPair.tokenB.address;
        quoteToken = buyDexPair.tokenA.address;
        baseTokenSymbol = buyDexPair.tokenB.symbol;
        quoteTokenSymbol = buyDexPair.tokenA.symbol;

        // Buy DEX: tokenB -> tokenA
        if (
          buyDexPair.reserves.token0.toLowerCase() === baseToken.toLowerCase()
        ) {
          reservesA = [
            buyDexPair.reserves.reserve0,
            buyDexPair.reserves.reserve1,
          ];
        } else {
          reservesA = [
            buyDexPair.reserves.reserve1,
            buyDexPair.reserves.reserve0,
          ];
        }

        // Sell DEX: tokenA -> tokenB
        if (
          sellDexPair.reserves.token0.toLowerCase() === quoteToken.toLowerCase()
        ) {
          reservesB = [
            sellDexPair.reserves.reserve0,
            sellDexPair.reserves.reserve1,
          ];
        } else {
          reservesB = [
            sellDexPair.reserves.reserve1,
            sellDexPair.reserves.reserve0,
          ];
        }
      }

      const result = SimulatorService.simulateSimpleArbitrage(
        amountIn,
        reservesA,
        reservesB,
        gasEstimate
      );

      if (!result.isProfitable) {
        return null;
      }

      // Apply safety margin
      const adjustedProfit =
        (result.profit *
          BN(Math.floor((1 - config.trading.safetyMargin) * 1000))) /
        BN(1000);

      if (adjustedProfit <= ZERO) {
        return null;
      }

      // Calculate prices
      const buyPrice = this.dexService.calculatePrice(
        buyDexPair.reserves,
        baseToken,
        quoteToken
      );
      const sellPrice = this.dexService.calculatePrice(
        sellDexPair.reserves,
        baseToken,
        quoteToken
      );

      return {
        baseToken,
        quoteToken,
        baseTokenSymbol,
        quoteTokenSymbol,
        buyDex: buyDexName,
        sellDex: sellDexName,
        amountIn: amountIn.toString(),
        amountOut: result.amountOut.toString(),
        estimatedProfit: result.profit.toString(),
        profitPercent: result.profitPercent,
        gasEstimate: gasEstimate.toString(),
        netProfit: adjustedProfit.toString(),
        buyPrice: buyPrice.toString(),
        sellPrice: sellPrice.toString(),
        priceImpact: Math.max(result.priceImpactA, result.priceImpactB),
        arbitrageType: ArbitrageType.SIMPLE,
      };
    } catch (error) {
      logger.debug(`Error in arbitrage simulation: ${error}`);
      return null;
    }
  }

  /**
   * Detect triangular arbitrage opportunities (A -> B -> C -> A)
   */
  private async detectTriangularArbitrage(): Promise<TriangularOpportunity[]> {
    const opportunities: TriangularOpportunity[] = [];
    const tokens = [
      config.tokens.weth,
      config.tokens.usdc,
      config.tokens.usdt,
      config.tokens.dai,
    ];

    // Check all possible triangular paths
    for (let i = 0; i < tokens.length; i++) {
      for (let j = 0; j < tokens.length; j++) {
        for (let k = 0; k < tokens.length; k++) {
          if (i !== j && j !== k && k !== i) {
            const tokenA = tokens[i];
            const tokenB = tokens[j];
            const tokenC = tokens[k];

            try {
              const opportunity = await this.checkTriangularArbitrage(
                tokenA,
                tokenB,
                tokenC
              );
              if (opportunity) {
                opportunities.push(opportunity);
              }
            } catch (error) {
              logger.debug(
                `Error checking triangular arbitrage ${tokenA}/${tokenB}/${tokenC}: ${error}`
              );
            }
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Check triangular arbitrage for a specific token triplet
   */
  private async checkTriangularArbitrage(
    tokenA: string,
    tokenB: string,
    tokenC: string
  ): Promise<TriangularOpportunity | null> {
    try {
      // Get all three pairs (we'll use Uniswap for simplicity, but this can be extended)
      const [pairAB, pairBC, pairCA] = await Promise.all([
        this.dexService.getPairInfo(
          config.dexes.uniswapV2.factory,
          tokenA,
          tokenB
        ),
        this.dexService.getPairInfo(
          config.dexes.uniswapV2.factory,
          tokenB,
          tokenC
        ),
        this.dexService.getPairInfo(
          config.dexes.uniswapV2.factory,
          tokenC,
          tokenA
        ),
      ]);

      if (!pairAB || !pairBC || !pairCA) {
        return null;
      }

      const gasPrice = await this.dexService.getCurrentGasPrice();
      const gasEstimate = gasPrice * BN(config.trading.gasLimit * 3); // 3x gas for triangular

      const amounts = [parseEther("0.1"), parseEther("1"), parseEther("10")];

      for (const amountIn of amounts) {
        try {
          // Get reserves for A -> B -> C -> A path
          const reservesAB = this.getDirectionalReserves(
            pairAB,
            tokenA,
            tokenB
          );
          const reservesBC = this.getDirectionalReserves(
            pairBC,
            tokenB,
            tokenC
          );
          const reservesCA = this.getDirectionalReserves(
            pairCA,
            tokenC,
            tokenA
          );

          const result = SimulatorService.simulateTriangularArbitrage(
            amountIn,
            reservesAB,
            reservesBC,
            reservesCA,
            gasEstimate
          );

          if (result.isProfitable) {
            const adjustedProfit =
              (result.profit *
                BN(Math.floor((1 - config.trading.safetyMargin) * 1000))) /
              BN(1000);

            if (adjustedProfit > config.trading.minProfitWei) {
              const [tokenAInfo] = await Promise.all([
                this.dexService.getTokenInfo(tokenA),
                this.dexService.getTokenInfo(tokenB),
                this.dexService.getTokenInfo(tokenC),
              ]);

              return {
                baseToken: tokenA,
                quoteToken: tokenA, // Same as base for triangular
                baseTokenSymbol: tokenAInfo.symbol,
                quoteTokenSymbol: tokenAInfo.symbol,
                buyDex: config.dexes.uniswapV2.name,
                sellDex: config.dexes.uniswapV2.name,
                amountIn: amountIn.toString(),
                amountOut: result.amountOut.toString(),
                estimatedProfit: result.profit.toString(),
                profitPercent: result.profitPercent,
                gasEstimate: gasEstimate.toString(),
                netProfit: adjustedProfit.toString(),
                buyPrice: "0", // Not applicable for triangular
                sellPrice: "0", // Not applicable for triangular
                priceImpact: Math.max(...result.priceImpacts),
                arbitrageType: ArbitrageType.TRIANGULAR,
                intermediateToken: tokenB,
                tokenPath: [tokenA, tokenB, tokenC, tokenA],
                amounts: result.amounts.map((a) => a.toString()),
                priceImpacts: result.priceImpacts,
              };
            }
          }
        } catch (error) {
          logger.debug(`Error in triangular simulation: ${error}`);
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error checking triangular arbitrage: ${error}`);
      return null;
    }
  }

  /**
   * Get reserves in the correct direction for trading
   */
  private getDirectionalReserves(
    pairInfo: PairInfo,
    tokenIn: string,
    _tokenOut: string
  ): [bigint, bigint] {
    if (pairInfo.reserves.token0.toLowerCase() === tokenIn.toLowerCase()) {
      return [pairInfo.reserves.reserve0, pairInfo.reserves.reserve1];
    } else {
      return [pairInfo.reserves.reserve1, pairInfo.reserves.reserve0];
    }
  }

  /**
   * Get token pairs to check for arbitrage
   */
  private async getTokenPairs(): Promise<{ tokenA: string; tokenB: string }[]> {
    // For now, return a hardcoded list of popular pairs
    const tokens = [
      config.tokens.weth,
      config.tokens.usdc,
      config.tokens.usdt,
      config.tokens.dai,
    ];
    const pairs: { tokenA: string; tokenB: string }[] = [];

    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        pairs.push({ tokenA: tokens[i], tokenB: tokens[j] });
      }
    }

    return pairs;
  }

  /**
   * Save opportunities to database
   */
  private async saveOpportunities(
    opportunities: ArbitrageOpportunity[]
  ): Promise<void> {
    if (opportunities.length === 0) return;

    try {
      const currentBlock = await this.dexService.getCurrentBlockNumber();
      const gasPrice = await this.dexService.getCurrentGasPrice();

      await prisma.opportunity.createMany({
        data: opportunities.map((opp) => ({
          baseToken: opp.baseToken,
          quoteToken: opp.quoteToken,
          baseTokenSymbol: opp.baseTokenSymbol,
          quoteTokenSymbol: opp.quoteTokenSymbol,
          buyDex: opp.buyDex,
          sellDex: opp.sellDex,
          amountIn: opp.amountIn,
          amountOut: opp.amountOut,
          estimatedProfit: opp.estimatedProfit,
          profitPercent: opp.profitPercent,
          gasEstimate: opp.gasEstimate,
          netProfit: opp.netProfit,
          buyPrice: opp.buyPrice,
          sellPrice: opp.sellPrice,
          priceImpact: opp.priceImpact,
          arbitrageType: opp.arbitrageType,
          intermediateToken: opp.intermediateToken || null,
          tokenPath: opp.tokenPath ? JSON.stringify(opp.tokenPath) : null,
          blockNumber: BigInt(currentBlock),
          gasPrice: gasPrice.toString(),
        })),
        skipDuplicates: true,
      });

      logger.info(`Saved ${opportunities.length} opportunities to database`);
    } catch (error) {
      logger.error(`Error saving opportunities: ${error}`);
    }
  }

  /**
   * Update system metrics
   */
  private async updateSystemMetrics(
    opportunitiesCount: number,
    runtime: number,
    blockNumber: number
  ): Promise<void> {
    try {
      const profitableCount = await prisma.opportunity.count({
        where: {
          netProfit: { gt: "0" },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
      });

      await prisma.systemMetrics.upsert({
        where: { id: "main" },
        update: {
          totalOpportunities: { increment: opportunitiesCount },
          profitableOpportunities: { set: profitableCount },
          lastArbitrageRun: new Date(),
          averageRuntime: runtime,
          lastProcessedBlock: BigInt(blockNumber),
        },
        create: {
          id: "main",
          totalOpportunities: opportunitiesCount,
          profitableOpportunities: profitableCount,
          lastArbitrageRun: new Date(),
          averageRuntime: runtime,
          lastProcessedBlock: BigInt(blockNumber),
        },
      });
    } catch (error) {
      logger.error(`Error updating system metrics: ${error}`);
    }
  }

  /**
   * Update error count
   */
  private async updateErrorCount(): Promise<void> {
    try {
      await prisma.systemMetrics.upsert({
        where: { id: "main" },
        update: {
          errorCount: { increment: 1 },
        },
        create: {
          id: "main",
          errorCount: 1,
        },
      });
    } catch (error) {
      logger.error(`Error updating error count: ${error}`);
    }
  }
}
