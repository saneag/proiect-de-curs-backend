import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
    // Schema generation/diff needs a datasource even when it makes no connection.
    datasource: { url: process.env.DATABASE_URL || 'postgresql://localhost/socialmedia' },
});
