import fastify, { FastifyInstance } from 'fastify';
import { config } from '@/config';
import { logger } from '@/utils/logger';
import { opportunitiesRoutes } from './routes/opportunities';

export class ApiServer {
  private app: FastifyInstance;

  constructor() {
    this.app = fastify({
      logger: {
        level: config.api.logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      },
    });

    this.setupRoutes();
    this.setupErrorHandlers();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // API status
    this.app.get('/status', async (request, reply) => {
      try {
        const { prisma } = await import('@/db/prismaClient');
        
        // Get latest system metrics
        const metrics = await prisma.systemMetrics.findFirst({
          where: { id: 'main' },
        });

        // Get recent opportunities count
        const recentOpportunities = await prisma.opportunity.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
          },
        });

        // Get profitable opportunities count
        const profitableOpportunities = await prisma.opportunity.count({
          where: {
            netProfit: { gt: '0' },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          },
        });

        return {
          status: 'operational',
          timestamp: new Date().toISOString(),
          metrics: {
            totalOpportunities: metrics?.totalOpportunities || 0,
            profitableOpportunities,
            recentOpportunities,
            lastArbitrageRun: metrics?.lastArbitrageRun,
            averageRuntime: metrics?.averageRuntime,
            errorCount: metrics?.errorCount || 0,
            lastProcessedBlock: metrics?.lastProcessedBlock?.toString(),
          },
        };
      } catch (error) {
        logger.error('Error fetching status:', error);
        return reply.status(500).send({
          status: 'error',
          message: 'Failed to fetch system status',
        });
      }
    });

    // Register opportunities routes
    this.app.register(opportunitiesRoutes, { prefix: '/api' });
  }

  private setupErrorHandlers(): void {
    this.app.setErrorHandler(async (error, request, reply) => {
      logger.error('API Error:', error);
      
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    });

    this.app.setNotFoundHandler(async (request, reply) => {
      return reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  async start(): Promise<void> {
    try {
      await this.app.listen({
        port: config.api.port,
        host: '0.0.0.0',
      });
      
      logger.info(`API server started on port ${config.api.port}`);
    } catch (error) {
      logger.error('Error starting server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.app.close();
      logger.info('API server stopped');
    } catch (error) {
      logger.error('Error stopping server:', error);
    }
  }

  get instance(): FastifyInstance {
    return this.app;
  }
}

// For testing purposes
export const createTestServer = (): FastifyInstance => {
  const server = new ApiServer();
  return server.instance;
};
