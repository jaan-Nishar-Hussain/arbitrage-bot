import { ethers } from 'ethers';

/**
 * BigNumber utility functions for handling large numbers in DeFi calculations
 */

export const BN = ethers.getBigInt;

export const ZERO = BN(0);
export const ONE = BN(1);
export const TWO = BN(2);

// Common token decimals
export const ETHER_DECIMALS = 18;
export const USDC_DECIMALS = 6;
export const USDT_DECIMALS = 6;

// Conversion helpers
export const parseUnits = ethers.parseUnits;
export const formatUnits = ethers.formatUnits;
export const parseEther = ethers.parseEther;
export const formatEther = ethers.formatEther;

/**
 * Convert a string/number to BigInt
 */
export function toBigInt(value: string | number | bigint): bigint {
  return BN(value);
}

/**
 * Safely divide two BigInts with proper rounding
 */
export function safeDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator === ZERO) {
    throw new Error('Division by zero');
  }
  return numerator / denominator;
}

/**
 * Calculate percentage with BigInt precision
 */
export function calculatePercentage(value: bigint, total: bigint): number {
  if (total === ZERO) return 0;
  return Number((value * BN(10000)) / total) / 100;
}

/**
 * Format BigInt to readable string with decimals
 */
export function formatTokenAmount(amount: bigint, decimals: number, precision: number = 4): string {
  const formatted = formatUnits(amount, decimals);
  return parseFloat(formatted).toFixed(precision);
}

/**
 * Convert token amount to wei based on decimals
 */
export function toWei(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

/**
 * Check if BigInt is zero
 */
export function isZero(value: bigint): boolean {
  return value === ZERO;
}

/**
 * Get the minimum of two BigInts
 */
export function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * Get the maximum of two BigInts
 */
export function max(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

/**
 * Calculate square root using Newton's method for BigInt
 */
export function sqrt(value: bigint): bigint {
  if (value < ZERO) {
    throw new Error('Cannot calculate square root of negative number');
  }
  if (value === ZERO || value === ONE) {
    return value;
  }

  let x = value;
  let y = (value + ONE) / TWO;

  while (y < x) {
    x = y;
    y = (y + value / y) / TWO;
  }

  return x;
}
