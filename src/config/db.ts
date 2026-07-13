import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { env } from './env';

// Khởi tạo adapter cho PostgreSQL với Prisma 7
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// Khởi tạo PrismaClient singleton cho toàn ứng dụng
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
