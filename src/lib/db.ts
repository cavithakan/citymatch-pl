import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 connects through a driver adapter rather than its own query engine,
 * so the Postgres adapter is constructed here and shared.
 *
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * pool on every reload until Postgres refuses connections. Stashing the client
 * on globalThis makes reloads reuse it.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env first");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
