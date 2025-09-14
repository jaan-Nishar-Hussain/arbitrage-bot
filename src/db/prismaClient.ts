import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

// Singleton pattern for Prisma client
class PrismaService {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaClient({
        log: [
          { level: 'query', emit: 'event' },
          { level: 'error', emit: 'event' },
          { level: 'info', emit: 'event' },
          { level: 'warn', emit: 'event' },
        ],
      });

      // Log database queries in development
      if (process.env.NODE_ENV === 'development') {
        PrismaService.instance.$on('query', (e) => {
          logger.debug(`Query: ${e.query}`);
          logger.debug(`Duration: ${e.duration}ms`);
        });
      }

      PrismaService.instance.$on('error', (e) => {
        logger.error('Database error:', e);
      });
    }

    return PrismaService.instance;
  }

  public static async disconnect(): Promise<void> {
    if (PrismaService.instance) {
      await PrismaService.instance.$disconnect();
    }
  }
}

export const prisma = PrismaService.getInstance();

// Graceful shutdown
process.on('beforeExit', async () => {
  await PrismaService.disconnect();
});

process.on('SIGINT', async () => {
  await PrismaService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await PrismaService.disconnect();
  process.exit(0);
});
