import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
export const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }),
});
export default {
    async connect(): Promise<void> {
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        console.log('Connected to PostgreSQL');
    },
    disconnect: () => prisma.$disconnect(),
};
