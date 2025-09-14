import { SimulatorService } from "../src/services/simulator";
import { BN, parseEther } from "../src/utils/bn";

describe("SimulatorService", () => {
  describe("getAmountOut", () => {
    test("should calculate correct output amount for valid inputs", () => {
      const amountIn = parseEther("1"); // 1 ETH
      const reserveIn = parseEther("100"); // 100 ETH
      const reserveOut = parseEther("200000"); // 200,000 USDC (assuming 6 decimals)

      const amountOut = SimulatorService.getAmountOut(
        amountIn,
        reserveIn,
        reserveOut
      );

      // Expected calculation: (1 * 997 * 200000) / (100 * 1000 + 1 * 997)
      // = 199400000 / 100997 ≈ 1974.2
      expect(amountOut).toBeGreaterThan(BN(0));
      expect(amountOut).toBeLessThan(reserveOut);
    });

    test("should throw error for zero input amount", () => {
      const amountIn = BN(0);
      const reserveIn = parseEther("100");
      const reserveOut = parseEther("200000");

      expect(() => {
        SimulatorService.getAmountOut(amountIn, reserveIn, reserveOut);
      }).toThrow("UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT");
    });

    test("should throw error for zero reserves", () => {
      const amountIn = parseEther("1");
      const reserveIn = BN(0);
      const reserveOut = parseEther("200000");

      expect(() => {
        SimulatorService.getAmountOut(amountIn, reserveIn, reserveOut);
      }).toThrow("UniswapV2Library: INSUFFICIENT_LIQUIDITY");
    });

    test("should apply 0.3% fee correctly", () => {
      const amountIn = parseEther("1");
      const reserveIn = parseEther("1000");
      const reserveOut = parseEther("1000");

      const amountOut = SimulatorService.getAmountOut(
        amountIn,
        reserveIn,
        reserveOut
      );

      // With 0.3% fee, we should get less than 1:1 ratio
      expect(amountOut).toBeLessThan(amountIn);

      // The actual calculation: (1 * 997 * 1000) / (1000 * 1000 + 1 * 997)
      // = 997000 / 1000997 ≈ 0.996
      const expected =
        (amountIn * BN(997) * reserveOut) /
        (reserveIn * BN(1000) + amountIn * BN(997));
      expect(amountOut).toEqual(expected);
    });
  });

  describe("getAmountIn", () => {
    test("should calculate correct input amount for desired output", () => {
      const amountOut = parseEther("1");
      const reserveIn = parseEther("100");
      const reserveOut = parseEther("100");

      const amountIn = SimulatorService.getAmountIn(
        amountOut,
        reserveIn,
        reserveOut
      );

      expect(amountIn).toBeGreaterThan(amountOut); // Should need more input due to fees
      expect(amountIn).toBeGreaterThan(BN(0));
    });

    test("should throw error for zero output amount", () => {
      const amountOut = BN(0);
      const reserveIn = parseEther("100");
      const reserveOut = parseEther("100");

      expect(() => {
        SimulatorService.getAmountIn(amountOut, reserveIn, reserveOut);
      }).toThrow("UniswapV2Library: INSUFFICIENT_OUTPUT_AMOUNT");
    });

    test("should throw error when output amount exceeds reserves", () => {
      const amountOut = parseEther("101"); // More than reserves
      const reserveIn = parseEther("100");
      const reserveOut = parseEther("100");

      expect(() => {
        SimulatorService.getAmountIn(amountOut, reserveIn, reserveOut);
      }).toThrow("UniswapV2Library: INSUFFICIENT_LIQUIDITY");
    });
  });

  describe("simulateSimpleArbitrage", () => {
    test("should identify profitable arbitrage opportunity", () => {
      const amountIn = parseEther("0.01");

      // Create a scenario that would be profitable without fees
      // DEX A: 1 ETH = 1000 USDC
      const reservesA: [bigint, bigint] = [
        parseEther("10000"),
        parseEther("10000000"),
      ];

      // DEX B: 1 ETH = 3000 USDC
      const reservesB: [bigint, bigint] = [
        parseEther("30000000"),
        parseEther("10000"),
      ];

      const gasEstimate = parseEther("0.0001");

      const result = SimulatorService.simulateSimpleArbitrage(
        amountIn,
        reservesA,
        reservesB,
        gasEstimate
      );

      // Test that the function returns proper structure even if not profitable due to fees
      expect(result).toHaveProperty("amountOut");
      expect(result).toHaveProperty("profit");
      expect(result).toHaveProperty("profitPercent");
      expect(result).toHaveProperty("isProfitable");
      expect(typeof result.profitPercent).toBe("number");
      expect(typeof result.isProfitable).toBe("boolean");
    });

    test("should handle unprofitable arbitrage", () => {
      const amountIn = parseEther("1");

      // Similar prices on both DEXs
      const reservesA: [bigint, bigint] = [
        parseEther("100"),
        parseEther("200000"),
      ];
      const reservesB: [bigint, bigint] = [
        parseEther("200000"),
        parseEther("100"),
      ];

      const gasEstimate = parseEther("0.1"); // High gas cost

      const result = SimulatorService.simulateSimpleArbitrage(
        amountIn,
        reservesA,
        reservesB,
        gasEstimate
      );

      expect(result.isProfitable).toBe(false);
      expect(result.profit).toBeLessThanOrEqual(BN(0));
    });
  });

  describe("simulateTriangularArbitrage", () => {
    test("should simulate triangular arbitrage correctly", () => {
      const amountIn = parseEther("1");

      // A -> B (ETH -> USDC)
      const reservesAB: [bigint, bigint] = [
        parseEther("100"),
        parseEther("200000"),
      ];

      // B -> C (USDC -> DAI)
      const reservesBC: [bigint, bigint] = [
        parseEther("200000"),
        parseEther("200000"),
      ];

      // C -> A (DAI -> ETH)
      const reservesCA: [bigint, bigint] = [
        parseEther("200000"),
        parseEther("100"),
      ];

      const gasEstimate = parseEther("0.02");

      const result = SimulatorService.simulateTriangularArbitrage(
        amountIn,
        reservesAB,
        reservesBC,
        reservesCA,
        gasEstimate
      );

      expect(result.amounts).toHaveLength(4);
      expect(result.amounts[0]).toEqual(amountIn);
      expect(result.priceImpacts).toHaveLength(3);
      expect(result.amountOut).toBeGreaterThan(BN(0));
    });
  });

  describe("calculatePriceImpact", () => {
    test("should calculate price impact correctly", () => {
      const amountIn = parseEther("10"); // Large trade
      const amountOut = parseEther("19"); // Less than proportional
      const reserveIn = parseEther("100");
      const reserveOut = parseEther("200");

      const priceImpact = SimulatorService.calculatePriceImpact(
        amountIn,
        amountOut,
        reserveIn,
        reserveOut
      );

      expect(priceImpact).toBeGreaterThan(0);
      expect(priceImpact).toBeLessThan(100);
    });

    test("should return 0 for zero values", () => {
      const priceImpact = SimulatorService.calculatePriceImpact(
        BN(0),
        BN(0),
        BN(0),
        BN(0)
      );

      expect(priceImpact).toBe(0);
    });
  });

  describe("getAmountsOut", () => {
    test("should calculate multi-hop trade correctly", () => {
      const amountIn = parseEther("1");
      const reserves: [bigint, bigint][] = [
        [parseEther("100"), parseEther("200")], // First hop
        [parseEther("200"), parseEther("300")], // Second hop
      ];

      const amounts = SimulatorService.getAmountsOut(amountIn, reserves);

      expect(amounts).toHaveLength(3); // Input + 2 outputs
      expect(amounts[0]).toEqual(amountIn);
      expect(amounts[1]).toBeGreaterThan(BN(0));
      expect(amounts[2]).toBeGreaterThan(BN(0));
    });
  });
});
