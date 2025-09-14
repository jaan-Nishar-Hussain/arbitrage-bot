import { config } from './config';
import { logger } from './utils/logger';
import { ApiServer } from './api/server';
import { ArbitrageDetector } from './workers/arbDetector';
import { prisma } from './db/prismaClient';
import * as cron from 'node-cron';

class ArbitrageBot {
  private apiServer: ApiServer;
  private arbitrageDetector: ArbitrageDetector;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.apiServer = new ApiServer();
    this.arbitrageDetector = new ArbitrageDetector();
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting DeFi Arbitrage Bot...');

      // Test database connection
      await this.testDatabaseConnection();

      // Start API server
      await this.apiServer.start();

      // Start arbitrage detection worker
      this.startArbitrageWorker();

      // Setup graceful shutdown
      this.setupGracefulShutdown();

      logger.info('DeFi Arbitrage Bot started successfully');
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    try {
      await prisma.$connect();
      logger.info('Database connection established');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  private startArbitrageWorker(): void {
    logger.info(`Starting arbitrage detection worker with schedule: ${config.scheduling.arbDetectionCron}`);
    
    // Validate cron expression
    if (!cron.validate(config.scheduling.arbDetectionCron)) {
      throw new Error('Invalid cron expression for arbitrage detection');
    }

    this.cronJob = cron.schedule(config.scheduling.arbDetectionCron, async () => {
      try {
        await this.arbitrageDetector.detectOpportunities();
      } catch (error) {
        logger.error('Error in arbitrage detection worker:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC',
    });

    // Run immediately on startup
    setImmediate(async () => {
      try {
        logger.info('Running initial arbitrage detection...');
        await this.arbitrageDetector.detectOpportunities();
      } catch (error) {
        logger.error('Error in initial arbitrage detection:', error);
      }
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      try {
        // Stop cron job
        if (this.cronJob) {
          this.cronJob.stop();
          logger.info('Stopped arbitrage detection worker');
        }

        // Stop API server
        await this.apiServer.stop();

        // Disconnect from database
        await prisma.$disconnect();
        logger.info('Database connection closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }
}

// Start the bot if this file is run directly
if (require.main === module) {
  const bot = new ArbitrageBot();
  bot.start().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  });
}

export { ArbitrageBot };
