const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { PrismaClient } = require('../build/generated/prisma/client.js');
const { PrismaPg } = require('@prisma/adapter-pg');

let postgres;
let databaseDir;
let prisma;
let server;
let origin;
let tokens;
let otherTokens;
let postId;
let output = '';
const alice = { firstName: 'Alice', lastName: 'Tester', email: 'alice@example.com', password: 'TestPassword123!' };
const bob = { ...alice, firstName: 'Bobby', email: 'bob@example.com' };

async function request(method, route, body, accessToken) {
    const headers = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + '/api/hf' + route, {
        method, headers,
        body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
}

before(async () => {
    // A fresh temporary database; this never connects to the deployment database.
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    const dbSocket = net.createServer();
    dbSocket.listen(0, '127.0.0.1');
    await once(dbSocket, 'listening');
    const dbPort = dbSocket.address().port;
    await new Promise(resolve => dbSocket.close(resolve));
    databaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-api-test-'));
    postgres = new EmbeddedPostgres({ databaseDir,
        user: 'postgres', password: 'test-only-password', port: dbPort, persistent: true,
        autoRehydrateSymlinks: true, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog() {}, onError() {} });
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('integrity');
    const databaseUrl = `postgresql://postgres:test-only-password@127.0.0.1:${dbPort}/integrity`;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    origin = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['build/index.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(port),
            DATABASE_URL: databaseUrl,
            JWTSECRET: randomBytes(32).toString('hex'),
            JWTREFRESHSECRET: randomBytes(32).toString('hex'),
            FRONTEND_ORIGIN: origin,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    server.stdout.on('data', (data) => { output += data; });
    server.stderr.on('data', (data) => { output += data; });
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('API startup timeout: ' + output)), 15000);
        server.on('error', (error) => { clearTimeout(timeout); reject(error); });
        server.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`API exited (${code}): ${output}`)); });
        server.stdout.on('data', () => {
            if (output.includes('Server running')) { clearTimeout(timeout); resolve(); }
        });
    });
}, { timeout: 180000 });

after(async () => {
    if (server && server.exitCode === null) {
        const stopped = once(server, 'exit');
        server.kill();
        await stopped;
    }
    if (prisma) await prisma.$disconnect();
    if (postgres) await postgres.stop();
    if (databaseDir) {
        assert.equal(path.dirname(path.resolve(databaseDir)), path.resolve(os.tmpdir()));
        fs.rmSync(databaseDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    }
});

test('API rejects unauthenticated access', async () => {
    assert.equal((await request('GET', '/get-posts')).status, 403);
    assert.equal((await request('GET', '/user')).status, 403);
});

test('registration validates passwords and rejects duplicate accounts', async () => {
    assert.equal((await request('POST', '/user/register', { ...alice, password: 'short' })).status, 400);
    const created = await request('POST', '/user/register', alice);
    assert.equal(created.status, 201);
    assert.equal(created.data.passwordHash, undefined);
    assert.equal(typeof created.data.id, 'string');
    assert.equal(created.data._id, undefined);
    assert.equal((await request('POST', '/user/register', alice)).status, 409);
    assert.equal((await request('POST', '/user/register', bob)).status, 201);
});

test('login and profile retrieval work without exposing credentials', async () => {
    assert.equal((await request('POST', '/user/login', { email: alice.email, password: 'wrong' })).status, 401);
    const login = await request('POST', '/user/login', alice);
    assert.equal(login.status, 200);
    tokens = login.data;
    otherTokens = (await request('POST', '/user/login', bob)).data;
    const profile = await request('GET', '/user', null, tokens.accessToken);
    assert.equal(profile.status, 200);
    assert.equal(profile.data.email, alice.email);
    assert.equal(profile.data.passwordHash, undefined);
    assert.equal(profile.data.refreshToken, undefined);
});

test('refresh accepts the current token and rejects invalid tokens as HTTP 401', async () => {
    const refreshed = await request('POST', '/user/refreshAccessToken', { refreshToken: tokens.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.equal(typeof refreshed.data.accessToken, 'string');
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: 'invalid' })).status, 401);
    assert.equal((await request('POST', '/user/refreshAccessToken', {})).status, 401);
});

test('post creation, listing, and literal search work', async () => {
    assert.equal((await request('POST', '/create-post', { title: 'Integrity post', content: '<p>Hello <strong>world</strong></p>' }, tokens.accessToken)).status, 201);
    const list = await request('GET', '/get-posts?limit=10&page=1', null, tokens.accessToken);
    assert.equal(list.status, 200);
    assert.equal(list.data.totalPostsNumber, 1);
    assert.equal(list.data.posts[0].title, 'Integrity post');
    assert.match(list.data.posts[0].content, /world/);
    postId = list.data.posts[0].id;
    assert.equal(typeof postId, 'string');
    assert.equal(list.data.posts[0]._id, undefined);
    assert(!JSON.stringify(list.data).includes('passwordHash'));
    const search = await request('GET', '/get-posts?search=' + encodeURIComponent('.*'), null, tokens.accessToken);
    assert.equal(search.data.totalPostsNumber, 0);
});

test('only the author can update or delete a post', async () => {
    assert.equal((await request('PATCH', `/update-post/${postId}`, { title: 'Stolen' }, otherTokens.accessToken)).status, 404);
    assert.equal((await request('DELETE', `/delete-post/${postId}`, null, otherTokens.accessToken)).status, 404);
    assert.equal((await request('PATCH', `/update-post/${postId}`, { title: 'Updated post' }, tokens.accessToken)).status, 200);
    assert.equal((await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).data.post.title, 'Updated post');
});

test('reactions and comments use the authenticated identity', async () => {
    assert.equal((await request('PATCH', `/react-to-post/${postId}/like`, { email: bob.email }, tokens.accessToken)).status, 200);
    assert.equal((await request('PATCH', `/react-to-post/${postId}/comment`, { email: bob.email, content: 'Hello comment' }, tokens.accessToken)).status, 200);
    const post = (await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).data.post;
    assert.equal(post.numberOfLikes, 1);
    assert.equal(post.numberOfComments, 1);
    assert.equal(post.reactions[0].email, alice.email);
    assert.equal(post.comments[0].creator.email, alice.email);
    assert.equal((await request('PATCH', `/react-to-post/${postId}/invalid`, {}, tokens.accessToken)).status, 400);
});

test('avatar upload, profile update, image retrieval, and deletion work', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGq0AAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.set('avatar', new Blob([png], { type: 'image/png' }), 'avatar.png');
    const upload = await request('POST', '/user/userAvatar', form, tokens.accessToken);
    assert.equal(upload.status, 200);
    assert.match(upload.data.url, /^uploads\/userAvatar\/.*\.png$/);
    const image = await fetch(origin + '/' + upload.data.url);
    assert.equal(image.status, 200);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    const updated = await request('PATCH', '/user/updateUser', { ...alice, avatarUrl: upload.data.url, description: 'Updated biography' }, tokens.accessToken);
    assert.equal(updated.status, 200);
    assert.equal(updated.data.description, 'Updated biography');
    assert.equal(updated.data.avatarUrl, upload.data.url);
    assert.equal((await request('DELETE', '/user/userAvatar/' + upload.data.url.split('/').pop(), null, tokens.accessToken)).status, 200);
    assert.equal((await fetch(origin + '/' + upload.data.url)).status, 404);
});

test('post images upload and can be attached and removed', async () => {
    const form = new FormData();
    form.set('postImage', new Blob([Buffer.alloc(1_100_000)], { type: 'image/png' }), 'post.png');
    const upload = await request('POST', '/post/postImage', form, tokens.accessToken);
    assert.equal(upload.status, 200);
    assert.equal((await request('POST', '/create-post-with-image', { title: 'Image post', content: '<p>Photo</p>', image: upload.data.url }, tokens.accessToken)).status, 201);
    assert.equal((await fetch(origin + '/' + upload.data.url)).status, 200);
    assert.equal((await request('DELETE', '/post/postImage/' + upload.data.url.split('/').pop(), null, tokens.accessToken)).status, 200);
});

test('feed pagination, case-insensitive filters and SQL wildcards are literal', async () => {
    const special = "Literal %_ quote ' test";
    assert.equal((await request('POST', '/create-post', { title: special, content: '<p>Search content</p>' }, tokens.accessToken)).status, 201);
    for (const search of ['%_', "quote '", 'LITERAL']) {
        const result = await request('GET', '/get-posts?search=' + encodeURIComponent(search), null, tokens.accessToken);
        assert.equal(result.status, 200);
        assert.equal(result.data.totalPostsNumber, 1);
        assert.equal(result.data.posts[0].title, special);
    }
    const creator = await request('GET', '/get-posts?search=ALICE&email=ALICE%40EXAMPLE.COM', null, tokens.accessToken);
    assert.equal(creator.status, 200);
    assert.equal(creator.data.totalPostsNumber, 3);
    const first = (await request('GET', '/get-posts?limit=1&page=1', null, tokens.accessToken)).data;
    const second = (await request('GET', '/get-posts?limit=1&page=2', null, tokens.accessToken)).data;
    assert.equal(first.posts.length, 1);
    assert.equal(second.posts.length, 1);
    assert.notEqual(first.posts[0].id, second.posts[0].id);
    assert.equal(first.totalPostsNumber, 3);
    assert(new Date(first.posts[0].createdAt) >= new Date(second.posts[0].createdAt));
    const clamped = await request('GET', '/get-posts?limit=-1&page=0', null, tokens.accessToken);
    assert.equal(clamped.data.posts.length, 1);
    assert.equal((await request('GET', '/get-posts?email=%25', null, tokens.accessToken)).data.totalPostsNumber, 0);
});

test('validation and missing resources return errors without writing records', async () => {
    assert.equal((await request('POST', '/create-post', { title: 'x', content: 'hello' }, tokens.accessToken)).status, 400);
    assert.equal((await request('PATCH', `/update-post/${postId}`, { title: 'x' }, tokens.accessToken)).status, 400);
    assert.equal((await request('PATCH', `/react-to-post/${postId}/comment`, { content: '' }, tokens.accessToken)).status, 400);
    assert.equal((await request('PATCH', `/react-to-post/missing/like`, {}, tokens.accessToken)).status, 404);
    assert.equal((await request('GET', '/get-post/missing', null, tokens.accessToken)).status, 404);
    assert.equal((await request('PATCH', '/user/updateUser', { firstName: '!' }, tokens.accessToken)).status, 400);
});

test('reaction switching, toggling and concurrent requests preserve one reaction per user', async () => {
    const react = type => request('PATCH', `/react-to-post/${postId}/${type}`, {}, tokens.accessToken);
    const read = async () => (await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).data.post;
    assert.equal((await react('dislike')).status, 200);
    assert.equal((await read()).numberOfLikes, 0);
    assert.equal((await read()).numberOfDislikes, 1);
    await react('dislike');
    assert.equal((await read()).numberOfDislikes, 0);
    await react('like');
    const results = await Promise.all(Array.from({ length: 8 }, () => react('like')));
    assert(results.every(result => result.status === 200));
    assert.equal((await read()).numberOfLikes, 1);
    assert.equal(await prisma.reaction.count({ where: { postId } }), 1);
});

test('email changes retain post ownership, author snapshots and valid sessions', async () => {
    assert.equal((await request('PATCH', '/user/updateUser', { email: 'changed@example.com' }, tokens.accessToken)).status, 200);
    assert.equal((await request('GET', '/user', null, tokens.accessToken)).data.email, 'changed@example.com');
    assert.equal((await request('GET', '/user/changed@example.com')).status, 200);
    assert.equal((await request('PATCH', `/update-post/${postId}`, { title: 'After email change' }, tokens.accessToken)).status, 200);
    const post = (await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).data.post;
    assert.equal(post.creator.email, alice.email);
    assert.equal(post.reactions[0].email, 'changed@example.com');
    const users = (await request('GET', '/users')).data.users;
    assert(users.every(user => typeof user.id === 'string' && !user.passwordHash && !user.refreshToken));
});

test('delete removes a post and logout revokes the refresh token', async () => {
    assert.equal((await request('DELETE', `/delete-post/${postId}`, null, tokens.accessToken)).status, 200);
    assert.equal((await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).status, 404);
    assert.equal(await prisma.comment.count({ where: { postId } }), 0);
    assert.equal(await prisma.reaction.count({ where: { postId } }), 0);
    assert.equal((await request('POST', '/user/logout', { refreshToken: tokens.refreshToken })).status, 200);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: tokens.refreshToken })).status, 401);
});
