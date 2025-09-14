import { BN, ZERO, ONE } from '@/utils/bn';
import { logger } from '@/utils/logger';

/**
 * Uniswap V2 trading simulator
 * Implements the exact same formulas as Uniswap V2 contracts
 */

export class SimulatorService {
  /**
   * Uniswap V2 getAmountOut formula
   * Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
   * Formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
   * The 0.3% fee is applied (997/1000 = 99.7%)
   */
  static getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (amountIn <= ZERO) {
      throw new Error('UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
    }
    if (reserveIn <= ZERO || reserveOut <= ZERO) {
      throw new Error('UniswapV2Library: INSUFFICIENT_LIQUIDITY');
    }

    const amountInWithFee = amountIn * BN(997);
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * BN(1000) + amountInWithFee;
    
    return numerator / denominator;
  }

  /**
   * Uniswap V2 getAmountIn formula
   * Given an output amount of an asset and pair reserves, returns the required input amount of the other asset
   * Formula: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
   */
  static getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
    if (amountOut <= ZERO) {
      throw new Error('UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT');
    }
    if (reserveIn <= ZERO || reserveOut <= ZERO) {
      throw new Error('UniswapV2Library: INSUFFICIENT_LIQUIDITY');
    }
    if (amountOut >= reserveOut) {
      throw new Error('UniswapV2Library: INSUFFICIENT_LIQUIDITY');
    }

    const numerator = reserveIn * amountOut * BN(1000);
    const denominator = (reserveOut - amountOut) * BN(997);
    
    return (numerator / denominator) + ONE;
  }

  /**
   * Calculate amounts out for a multi-hop trade (e.g., A -> B -> C)
   * @param amountIn Initial input amount
   * @param reserves Array of [reserveIn, reserveOut] for each hop
   * @returns Final output amount after all hops
   */
  static getAmountsOut(amountIn: bigint, reserves: [bigint, bigint][]): bigint[] {
    if (reserves.length === 0) {
      throw new Error('Invalid reserves array');
    }

    const amounts: bigint[] = [amountIn];
    
    for (let i = 0; i < reserves.length; i++) {
      const [reserveIn, reserveOut] = reserves[i];
      const amountOut = this.getAmountOut(amounts[i], reserveIn, reserveOut);
      amounts.push(amountOut);
    }
    
    return amounts;
  }

  /**
   * Calculate amounts in for a multi-hop trade (working backwards)
   * @param amountOut Final desired output amount
   * @param reserves Array of [reserveIn, reserveOut] for each hop (in reverse order)
   * @returns Array of input amounts for each hop
   */
  static getAmountsIn(amountOut: bigint, reserves: [bigint, bigint][]): bigint[] {
    if (reserves.length === 0) {
      throw new Error('Invalid reserves array');
    }

    const amounts: bigint[] = new Array(reserves.length + 1);
    amounts[amounts.length - 1] = amountOut;
    
    for (let i = reserves.length - 1; i >= 0; i--) {
      const [reserveIn, reserveOut] = reserves[i];
      const amountIn = this.getAmountIn(amounts[i + 1], reserveIn, reserveOut);
      amounts[i] = amountIn;
    }
    
    return amounts;
  }

  /**
   * Calculate price impact for a trade
   * Price impact = (spotPrice - executionPrice) / spotPrice
   */
  static calculatePriceImpact(
    amountIn: bigint,
    amountOut: bigint,
    reserveIn: bigint,
    reserveOut: bigint
  ): number {
    if (reserveIn <= ZERO || reserveOut <= ZERO || amountIn <= ZERO) {
      return 0;
    }

    // Spot price (without trade)
    const spotPrice = (reserveOut * BN(10**18)) / reserveIn;
    
    // Execution price (after trade)
    const executionPrice = (amountOut * BN(10**18)) / amountIn;
    
    if (spotPrice <= ZERO) {
      return 0;
    }

    const priceImpact = ((spotPrice - executionPrice) * BN(10000)) / spotPrice;
    return Number(priceImpact) / 100; // Convert to percentage
  }

  /**
   * Simulate a simple arbitrage trade (buy on DEX A, sell on DEX B)
   */
  static simulateSimpleArbitrage(
    amountIn: bigint,
    reservesA: [bigint, bigint], // [tokenA_reserve, tokenB_reserve] on DEX A
    reservesB: [bigint, bigint], // [tokenB_reserve, tokenA_reserve] on DEX B
    gasEstimate: bigint
  ): {
    amountOut: bigint;
    profit: bigint;
    profitPercent: number;
    priceImpactA: number;
    priceImpactB: number;
    isProfitable: boolean;
  } {
    try {
      // Step 1: Buy tokenB on DEX A with tokenA
      const amountB = this.getAmountOut(amountIn, reservesA[0], reservesA[1]);
      
      // Step 2: Sell tokenB on DEX B for tokenA
      const amountOut = this.getAmountOut(amountB, reservesB[0], reservesB[1]);
      
      // Calculate profit (subtract gas costs)
      const grossProfit = amountOut - amountIn;
      const netProfit = grossProfit - gasEstimate;
      
      // Calculate price impacts
      const priceImpactA = this.calculatePriceImpact(amountIn, amountB, reservesA[0], reservesA[1]);
      const priceImpactB = this.calculatePriceImpact(amountB, amountOut, reservesB[0], reservesB[1]);
      
      // Calculate profit percentage
      const profitPercent = amountIn > ZERO ? (Number(netProfit) / Number(amountIn)) * 100 : 0;
      
      return {
        amountOut,
        profit: netProfit,
        profitPercent,
        priceImpactA,
        priceImpactB,
        isProfitable: netProfit > ZERO,
      };
    } catch (error) {
      logger.error(`Error simulating simple arbitrage: ${error}`);
      throw error;
    }
  }

  /**
   * Simulate triangular arbitrage (A -> B -> C -> A)
   */
  static simulateTriangularArbitrage(
    amountIn: bigint,
    reservesAB: [bigint, bigint], // A -> B
    reservesBC: [bigint, bigint], // B -> C
    reservesCA: [bigint, bigint], // C -> A
    gasEstimate: bigint
  ): {
    amountOut: bigint;
    profit: bigint;
    profitPercent: number;
    amounts: bigint[];
    priceImpacts: number[];
    isProfitable: boolean;
  } {
    try {
      // Step 1: A -> B
      const amountB = this.getAmountOut(amountIn, reservesAB[0], reservesAB[1]);
      
      // Step 2: B -> C
      const amountC = this.getAmountOut(amountB, reservesBC[0], reservesBC[1]);
      
      // Step 3: C -> A
      const amountOut = this.getAmountOut(amountC, reservesCA[0], reservesCA[1]);
      
      // Calculate profit
      const grossProfit = amountOut - amountIn;
      const netProfit = grossProfit - gasEstimate;
      
      // Calculate price impacts for each hop
      const priceImpacts = [
        this.calculatePriceImpact(amountIn, amountB, reservesAB[0], reservesAB[1]),
        this.calculatePriceImpact(amountB, amountC, reservesBC[0], reservesBC[1]),
        this.calculatePriceImpact(amountC, amountOut, reservesCA[0], reservesCA[1]),
      ];
      
      const profitPercent = amountIn > ZERO ? (Number(netProfit) / Number(amountIn)) * 100 : 0;
      
      return {
        amountOut,
        profit: netProfit,
        profitPercent,
        amounts: [amountIn, amountB, amountC, amountOut],
        priceImpacts,
        isProfitable: netProfit > ZERO,
      };
    } catch (error) {
      logger.error(`Error simulating triangular arbitrage: ${error}`);
      throw error;
    }
  }

  /**
   * Find optimal input amount for arbitrage by binary search
   */
  static findOptimalAmount(
    minAmount: bigint,
    maxAmount: bigint,
    reservesA: [bigint, bigint],
    reservesB: [bigint, bigint],
    gasEstimate: bigint,
    iterations: number = 20
  ): bigint {
    let left = minAmount;
    let right = maxAmount;
    let bestAmount = minAmount;
    let bestProfit = BN(-1);

    for (let i = 0; i < iterations; i++) {
      const mid = (left + right) / BN(2);
      
      try {
        const result = this.simulateSimpleArbitrage(mid, reservesA, reservesB, gasEstimate);
        
        if (result.profit > bestProfit) {
          bestProfit = result.profit;
          bestAmount = mid;
        }
        
        // Binary search logic - try larger amounts if profitable
        if (result.isProfitable) {
          left = mid + ONE;
        } else {
          right = mid - ONE;
        }
      } catch {
        right = mid - ONE;
      }
      
      if (left >= right) break;
    }
    
    return bestAmount;
  }
}
