const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { isDeepStrictEqual } = require('node:util');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('../.prisma-build/prisma/client.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { convert } = require('../scripts/convert-backups.cjs');
const { importData } = require('../scripts/import-backups.cjs');

test('Prisma migrations and atomic backup import on isolated PostgreSQL', { timeout: 180000 }, async t => {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const port = await new Promise(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
    });
    const databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-backup-test-'));
    const pg = new EmbeddedPostgres({ databaseDir, user: 'postgres', password: 'test-only-password',
        port, persistent: false, autoRehydrateSymlinks: true,
        initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog() {}, onError() {} });
    let prisma;
    try {
        await pg.initialise();
        await pg.start();
        await pg.createDatabase('backup_test');
        const url = `postgresql://postgres:test-only-password@127.0.0.1:${port}/backup_test`;
        const migrate = () => execFileSync(process.execPath,
            [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
            { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
        migrate();
        migrate();
        prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
        const fixture = require('./backup-fixture.cjs');
        const data = convert(fixture.users, fixture.posts);
        const broken = structuredClone(data);
        broken.comments[0].creatorId = 'missing';
        await assert.rejects(importData(prisma, broken));
        assert.equal(await prisma.user.count(), 0, 'Failed import must roll back users too');
        await importData(prisma, data);
        assert.equal(await prisma.comment.count(), 1);
        assert.equal(await prisma.follow.count(), 1);
        assert.equal((await prisma.post.findUnique({ where: { id: 'post-1' } })).title, fixture.posts[0].title);
        await assert.rejects(importData(prisma, data), /not empty/);
        await assert.rejects(prisma.reaction.create({ data: { postId: 'post-1', userId: 'user-1', type: 'DISLIKE' } }));
        await prisma.post.delete({ where: { id: 'post-1' } });
        assert.equal(await prisma.comment.count(), 0);
        assert.equal(await prisma.reaction.count(), 0);
        await prisma.follow.deleteMany();
        await prisma.user.deleteMany();

        const privateFile = path.resolve('backups/postgresql/data.json');
        if (fs.existsSync(privateFile)) {
            const actual = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
            await importData(prisma, actual);
            for (const [key, model] of Object.entries({ users: 'user', posts: 'post', comments: 'comment',
                reactions: 'reaction', follows: 'follow', followRequests: 'followRequest' })) {
                const rows = await prisma[model].findMany();
                assert.equal(rows.length, actual[key].length, `${key} count`);
                // Compare every imported field without printing private values on failure.
                for (const source of actual[key]) {
                    const row = rows.find(row => source.id ? row.id === source.id :
                        Object.keys(source).every(key => row[key] === source[key]));
                    assert.ok(row, `${key}: missing row`);
                    for (const [field, value] of Object.entries(source)) {
                        const saved = row[field] instanceof Date ? row[field].toISOString() : row[field];
                        assert.ok(isDeepStrictEqual(saved, value), `${key}.${field} mismatch`);
                    }
                }
            }
            t.diagnostic('Private backup imported and all fields reconciled');
        }
    } finally {
        if (prisma) await prisma.$disconnect();
        await pg.stop();
    }
});
