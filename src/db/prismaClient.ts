import { PrismaClient } from "@prisma/client";

// Singleton pattern for Prisma client
class PrismaService {
  private static instance: PrismaClient;

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaClient({
        log: [
          { level: "query", emit: "stdout" },
          { level: "error", emit: "stdout" },
          { level: "info", emit: "stdout" },
          { level: "warn", emit: "stdout" },
        ],
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
process.on("beforeExit", async () => {
  await PrismaService.disconnect();
});

process.on("SIGINT", async () => {
  await PrismaService.disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await PrismaService.disconnect();
  process.exit(0);
});
