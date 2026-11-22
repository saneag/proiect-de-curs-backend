import 'dotenv/config';
import { defineConfig } from 'prisma/config';

if (!process.env.DATABASE_URL && process.argv.includes('deploy')) {
    throw new Error('DATABASE_URL is required for migrations');
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    // Only generation, validation and schema diff can run without a database URL.
    datasource: {
        url: process.env.DATABASE_URL || 'postgresql://localhost/socialmedia',
    },
});
