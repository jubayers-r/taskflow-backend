import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/prisma/generated/client';
import { env } from '../config';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const connectionString = `${env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { prisma };
