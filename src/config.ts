import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  // Network configuration
  rpcUrl: string;
  
  // Database
  databaseUrl: string;
  
  // DEX addresses
  dexes: {
    uniswapV2: {
      factory: string;
      router: string;
      name: string;
    };
    sushiswap: {
      factory: string;
      router: string;
      name: string;
    };
  };
  
  // Token addresses
  tokens: {
    weth: string;
    usdc: string;
    usdt: string;
    dai: string;
  };
  
  // Trading parameters
  trading: {
    minProfitWei: bigint;
    gasPriceGwei: number;
    gasLimit: number;
    safetyMargin: number;
  };
  
  // API configuration
  api: {
    port: number;
    logLevel: string;
  };
  
  // Scheduling
  scheduling: {
    arbDetectionCron: string;
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  rpcUrl: getRequiredEnv('RPC_URL'),
  databaseUrl: getRequiredEnv('DATABASE_URL'),
  
  dexes: {
    uniswapV2: {
      factory: getOptionalEnv('UNISWAP_V2_FACTORY', '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'),
      router: getOptionalEnv('UNISWAP_V2_ROUTER', '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
      name: 'Uniswap V2',
    },
    sushiswap: {
      factory: getOptionalEnv('SUSHISWAP_FACTORY', '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'),
      router: getOptionalEnv('SUSHISWAP_ROUTER', '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'),
      name: 'SushiSwap',
    },
  },
  
  tokens: {
    weth: getOptionalEnv('WETH_ADDRESS', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    usdc: getOptionalEnv('USDC_ADDRESS', '0xA0b86a33E6417c58C0FB8c9CF9e3b8b6DCB476D1'),
    usdt: getOptionalEnv('USDT_ADDRESS', '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    dai: getOptionalEnv('DAI_ADDRESS', '0x6B175474E89094C44Da98b954EedeAC495271d0F'),
  },
  
  trading: {
    minProfitWei: BigInt(getOptionalEnv('MIN_PROFIT_WEI', '1000000000000000')), // 0.001 ETH
    gasPriceGwei: parseInt(getOptionalEnv('GAS_PRICE_GWEI', '20')),
    gasLimit: parseInt(getOptionalEnv('GAS_LIMIT', '200000')),
    safetyMargin: parseFloat(getOptionalEnv('SAFETY_MARGIN', '0.02')), // 2%
  },
  
  api: {
    port: parseInt(getOptionalEnv('PORT', '3000')),
    logLevel: getOptionalEnv('LOG_LEVEL', 'info'),
  },
  
  scheduling: {
    arbDetectionCron: getOptionalEnv('ARB_DETECTION_CRON', '*/10 * * * * *'), // Every 10 seconds
  },
};
