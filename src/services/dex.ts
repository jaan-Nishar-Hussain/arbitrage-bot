import { ethers } from 'ethers';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { BN, ZERO } from '@/utils/bn';

// Uniswap V2 Factory ABI (minimal)
const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint) external view returns (address pair)',
  'function allPairsLength() external view returns (uint)',
];

// Uniswap V2 Pair ABI (minimal)
const PAIR_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
];

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

export interface PairReserves {
  reserve0: bigint;
  reserve1: bigint;
  token0: string;
  token1: string;
  blockTimestampLast: number;
}

export interface PairInfo {
  pairAddress: string;
  tokenA: TokenInfo;
  tokenB: TokenInfo;
  reserves: PairReserves;
}

export class DEXService {
  private provider: ethers.Provider;
  private tokenCache: Map<string, TokenInfo> = new Map();

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  /**
   * Get pair address from factory contract
   */
  async getPairAddress(factoryAddress: string, tokenA: string, tokenB: string): Promise<string> {
    try {
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
      const pairAddress = await factory.getPair(tokenA, tokenB);
      
      if (pairAddress === ethers.ZeroAddress) {
        throw new Error(`No pair found for tokens ${tokenA} and ${tokenB}`);
      }
      
      return pairAddress;
    } catch (error) {
      logger.error(`Error getting pair address: ${error}`);
      throw error;
    }
  }

  /**
   * Get reserves from pair contract
   */
  async getReserves(pairAddress: string): Promise<PairReserves> {
    try {
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      
      const [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
      const token0 = await pair.token0();
      const token1 = await pair.token1();
      
      return {
        reserve0: BN(reserve0.toString()),
        reserve1: BN(reserve1.toString()),
        token0,
        token1,
        blockTimestampLast: Number(blockTimestampLast),
      };
    } catch (error) {
      logger.error(`Error getting reserves for pair ${pairAddress}: ${error}`);
      throw error;
    }
  }

  /**
   * Get token information (symbol, decimals)
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    // Check cache first
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress)!;
    }

    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      
      const [symbol, decimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
      ]);

      const tokenInfo: TokenInfo = {
        address: tokenAddress,
        symbol,
        decimals: Number(decimals),
      };

      // Cache the result
      this.tokenCache.set(tokenAddress, tokenInfo);
      
      return tokenInfo;
    } catch (error) {
      logger.error(`Error getting token info for ${tokenAddress}: ${error}`);
      throw error;
    }
  }

  /**
   * Get complete pair information including reserves and token details
   */
  async getPairInfo(factoryAddress: string, tokenA: string, tokenB: string): Promise<PairInfo | null> {
    try {
      const pairAddress = await this.getPairAddress(factoryAddress, tokenA, tokenB);
      if (pairAddress === ethers.ZeroAddress) {
        return null;
      }

      const [reserves, tokenAInfo, tokenBInfo] = await Promise.all([
        this.getReserves(pairAddress),
        this.getTokenInfo(tokenA),
        this.getTokenInfo(tokenB),
      ]);

      return {
        pairAddress,
        tokenA: tokenAInfo,
        tokenB: tokenBInfo,
        reserves,
      };
    } catch (error) {
      logger.error(`Error getting pair info: ${error}`);
      return null;
    }
  }

  /**
   * Calculate price of tokenA in terms of tokenB
   */
  calculatePrice(reserves: PairReserves, tokenA: string, tokenB: string): bigint {
    const { reserve0, reserve1, token0, token1 } = reserves;
    
    if (reserve0 === ZERO || reserve1 === ZERO) {
      return ZERO;
    }

    // Determine which reserve corresponds to which token
    if (tokenA.toLowerCase() === token0.toLowerCase()) {
      // tokenA is token0, tokenB is token1
      // Price of tokenA in tokenB = reserve1 / reserve0
      return (reserve1 * BN(10**18)) / reserve0; // Scale by 1e18 for precision
    } else {
      // tokenA is token1, tokenB is token0
      // Price of tokenA in tokenB = reserve0 / reserve1
      return (reserve0 * BN(10**18)) / reserve1;
    }
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get current gas price
   */
  async getCurrentGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || BN(config.trading.gasPriceGwei * 10**9);
  }

  /**
   * Check if pair exists on DEX
   */
  async pairExists(factoryAddress: string, tokenA: string, tokenB: string): Promise<boolean> {
    try {
      const pairAddress = await this.getPairAddress(factoryAddress, tokenA, tokenB);
      return pairAddress !== ethers.ZeroAddress;
    } catch {
      return false;
    }
  }

  /**
   * Get all pairs for a factory (useful for discovery)
   */
  async getAllPairs(factoryAddress: string, limit: number = 100): Promise<string[]> {
    try {
      const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, this.provider);
      const pairsLength = await factory.allPairsLength();
      const actualLimit = Math.min(limit, Number(pairsLength));
      
      const pairs: string[] = [];
      const promises = [];
      
      for (let i = 0; i < actualLimit; i++) {
        promises.push(factory.allPairs(i));
      }
      
      const results = await Promise.all(promises);
      pairs.push(...results);
      
      return pairs;
    } catch (error) {
      logger.error(`Error getting all pairs: ${error}`);
      return [];
    }
  }
}
