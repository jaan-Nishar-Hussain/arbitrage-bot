import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/utils/logger';

interface OpportunitiesQuery {
  limit?: string;
  offset?: string;
  arbitrageType?: 'SIMPLE' | 'TRIANGULAR';
  minProfit?: string;
  sortBy?: 'createdAt' | 'profitPercent' | 'netProfit';
  sortOrder?: 'asc' | 'desc';
}

interface OpportunityParams {
  id: string;
}

export async function opportunitiesRoutes(fastify: FastifyInstance): Promise<void> {
  // Get all opportunities with filtering and pagination
  fastify.get<{
    Querystring: OpportunitiesQuery;
  }>('/opportunities', async (request: FastifyRequest<{ Querystring: OpportunitiesQuery }>, reply: FastifyReply) => {
    try {
      const { prisma } = await import('@/db/prismaClient');
      
      const {
        limit = '20',
        offset = '0',
        arbitrageType,
        minProfit,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = request.query;

      const limitNum = Math.min(parseInt(limit), 100); // Max 100 results
      const offsetNum = parseInt(offset);

      // Build where clause
      const where: any = {};
      
      if (arbitrageType) {
        where.arbitrageType = arbitrageType;
      }
      
      if (minProfit) {
        where.netProfit = { gte: minProfit };
      }

      // Build order by clause
      const orderBy: any = {};
      orderBy[sortBy] = sortOrder;

      const [opportunities, total] = await Promise.all([
        prisma.opportunity.findMany({
          where,
          orderBy,
          take: limitNum,
          skip: offsetNum,
        }),
        prisma.opportunity.count({ where }),
      ]);

      return {
        opportunities: opportunities.map(opp => ({
          id: opp.id,
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
          intermediateToken: opp.intermediateToken,
          tokenPath: opp.tokenPath ? JSON.parse(opp.tokenPath) : null,
          blockNumber: opp.blockNumber?.toString(),
          gasPrice: opp.gasPrice,
          createdAt: opp.createdAt,
        })),
        pagination: {
          total,
          limit: limitNum,
          offset: offsetNum,
          hasNext: offsetNum + limitNum < total,
          hasPrevious: offsetNum > 0,
        },
      };
    } catch (error) {
      logger.error('Error fetching opportunities:', error);
      return reply.status(500).send({
        error: 'Failed to fetch opportunities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get a specific opportunity by ID
  fastify.get<{
    Params: OpportunityParams;
  }>('/opportunities/:id', async (request: FastifyRequest<{ Params: OpportunityParams }>, reply: FastifyReply) => {
    try {
      const { prisma } = await import('@/db/prismaClient');
      const { id } = request.params;

      const opportunity = await prisma.opportunity.findUnique({
        where: { id },
      });

      if (!opportunity) {
        return reply.status(404).send({
          error: 'Opportunity not found',
          message: `No opportunity found with ID: ${id}`,
        });
      }

      return {
        id: opportunity.id,
        baseToken: opportunity.baseToken,
        quoteToken: opportunity.quoteToken,
        baseTokenSymbol: opportunity.baseTokenSymbol,
        quoteTokenSymbol: opportunity.quoteTokenSymbol,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        amountIn: opportunity.amountIn,
        amountOut: opportunity.amountOut,
        estimatedProfit: opportunity.estimatedProfit,
        profitPercent: opportunity.profitPercent,
        gasEstimate: opportunity.gasEstimate,
        netProfit: opportunity.netProfit,
        buyPrice: opportunity.buyPrice,
        sellPrice: opportunity.sellPrice,
        priceImpact: opportunity.priceImpact,
        arbitrageType: opportunity.arbitrageType,
        intermediateToken: opportunity.intermediateToken,
        tokenPath: opportunity.tokenPath ? JSON.parse(opportunity.tokenPath) : null,
        blockNumber: opportunity.blockNumber?.toString(),
        gasPrice: opportunity.gasPrice,
        createdAt: opportunity.createdAt,
        updatedAt: opportunity.updatedAt,
      };
    } catch (error) {
      logger.error('Error fetching opportunity:', error);
      return reply.status(500).send({
        error: 'Failed to fetch opportunity',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get opportunities statistics
  fastify.get('/opportunities/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { prisma } = await import('@/db/prismaClient');

      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      const [
        total,
        last24hCount,
        lastHourCount,
        profitableCount,
        simpleCount,
        triangularCount,
        avgProfitResult,
      ] = await Promise.all([
        prisma.opportunity.count(),
        prisma.opportunity.count({ where: { createdAt: { gte: last24h } } }),
        prisma.opportunity.count({ where: { createdAt: { gte: lastHour } } }),
        prisma.opportunity.count({ where: { netProfit: { gt: '0' } } }),
        prisma.opportunity.count({ where: { arbitrageType: 'SIMPLE' } }),
        prisma.opportunity.count({ where: { arbitrageType: 'TRIANGULAR' } }),
        prisma.opportunity.aggregate({
          where: { netProfit: { gt: '0' } },
          _avg: { profitPercent: true },
        }),
      ]);

      return {
        total,
        last24h: last24hCount,
        lastHour: lastHourCount,
        profitable: profitableCount,
        byType: {
          simple: simpleCount,
          triangular: triangularCount,
        },
        averageProfitPercent: avgProfitResult._avg.profitPercent || 0,
      };
    } catch (error) {
      logger.error('Error fetching opportunities stats:', error);
      return reply.status(500).send({
        error: 'Failed to fetch opportunities statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Get best opportunities (highest profit)
  fastify.get<{
    Querystring: { limit?: string };
  }>('/opportunities/best', async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply: FastifyReply) => {
    try {
      const { prisma } = await import('@/db/prismaClient');
      const { limit = '10' } = request.query;
      const limitNum = Math.min(parseInt(limit), 50);

      const opportunities = await prisma.opportunity.findMany({
        where: {
          netProfit: { gt: '0' },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
        orderBy: [
          { profitPercent: 'desc' },
          { netProfit: 'desc' },
        ],
        take: limitNum,
      });

      return {
        opportunities: opportunities.map(opp => ({
          id: opp.id,
          baseTokenSymbol: opp.baseTokenSymbol,
          quoteTokenSymbol: opp.quoteTokenSymbol,
          buyDex: opp.buyDex,
          sellDex: opp.sellDex,
          profitPercent: opp.profitPercent,
          netProfit: opp.netProfit,
          arbitrageType: opp.arbitrageType,
          createdAt: opp.createdAt,
        })),
      };
    } catch (error) {
      logger.error('Error fetching best opportunities:', error);
      return reply.status(500).send({
        error: 'Failed to fetch best opportunities',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
