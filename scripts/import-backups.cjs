require('dotenv/config');
const fs = require('node:fs');
const { counts } = require('./convert-backups.cjs');

const tables = { users: 'user', posts: 'post', comments: 'comment', reactions: 'reaction',
    follows: 'follow', followRequests: 'followRequest' };

async function importData(prisma, data) {
    if (data.version !== 1 || Object.keys(tables).some(key => !Array.isArray(data[key]))) {
        throw new Error('Unsupported backup format');
    }
    return prisma.$transaction(async tx => {
        // Prevent simultaneous importers or application writes during the empty-target check.
        await tx.$executeRawUnsafe('LOCK TABLE users, posts, comments, reactions, follows, follow_requests IN EXCLUSIVE MODE');
        for (const model of Object.values(tables)) {
            if (await tx[model].count()) throw new Error('Target database is not empty; import cancelled');
        }
        for (const [key, model] of Object.entries(tables)) {
            if (data[key].length) await tx[model].createMany({ data: data[key] });
            if (await tx[model].count() !== data[key].length) throw new Error(`Count mismatch: ${key}`);
        }
        return counts(data);
    }, { timeout: 60000 });
}

async function main() {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    const data = JSON.parse(fs.readFileSync(process.argv[2] || 'backups/postgresql/data.json', 'utf8'));
    const { PrismaClient } = require('../build/generated/prisma/client.js');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    try { console.log('Imported and verified:', await importData(prisma, data)); }
    finally { await prisma.$disconnect(); }
}

if (require.main === module) main().catch(() => {
    // Database errors may contain private row values. Keep CLI output safe.
    console.error('Import failed. Check backup format, empty target, schema migrations and DATABASE_URL. Transaction rolled back.');
    process.exitCode = 1;
});
module.exports = { importData };
