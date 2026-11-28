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
    // Auth tokens arrive only as cookies; expose them on `data` so tests can send them as headers.
    const setCookie = response.headers.getSetCookie();
    const cookies = {};
    for (const line of setCookie) {
        const pair = line.split(';')[0];
        const separator = pair.indexOf('=');
        cookies[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
    if (data && typeof data === 'object') {
        for (const name of ['accessToken', 'refreshToken']) if (cookies[name]) data = { ...data, [name]: cookies[name] };
    }
    return { status: response.status, data, cookies, setCookie };
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
            LOGIN_RATE_LIMIT: '6',
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
    assert.equal(post.reactions[0].email, undefined);
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
    assert.match(image.headers.get('content-security-policy'), /sandbox/);
    const updated = await request('PATCH', '/user/updateUser', { ...alice, avatarUrl: upload.data.url, description: 'Updated biography' }, tokens.accessToken);
    assert.equal(updated.status, 200);
    assert.equal(updated.data.description, 'Updated biography');
    assert.equal(updated.data.avatarUrl, upload.data.url);
    assert.equal((await request('DELETE', '/user/userAvatar/' + upload.data.url.split('/').pop(), null, tokens.accessToken)).status, 200);
    assert.equal((await fetch(origin + '/' + upload.data.url)).status, 404);
});

test('post images upload and can be attached and removed', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGq0AAAAASUVORK5CYII=', 'base64');
    const form = new FormData();
    form.set('postImage', new Blob([Buffer.concat([png, Buffer.alloc(1_100_000)])], { type: 'image/png' }), 'post.png');
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
    assert.equal((await request('GET', '/user/changed@example.com')).status, 403);
    assert.equal((await request('GET', '/user/changed@example.com', null, tokens.accessToken)).status, 200);
    assert.equal((await request('PATCH', `/update-post/${postId}`, { title: 'After email change' }, tokens.accessToken)).status, 200);
    const post = (await request('GET', `/get-post/${postId}`, null, tokens.accessToken)).data.post;
    assert.equal(post.creator.email, alice.email);
    assert.equal(post.reactions[0].email, undefined);
    assert.equal((await request('GET', '/users')).status, 403);
    const users = (await request('GET', '/users', null, tokens.accessToken)).data.users;
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

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGq0AAAAASUVORK5CYII=', 'base64');
const upload = async (route, field, buffer, type, accessToken) => {
    const form = new FormData();
    form.set(field, new Blob([buffer], { type }), 'file.png');
    return request('POST', route, form, accessToken);
};

test('post HTML is sanitized on the server before it is stored', async () => {
    const evil = '<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>'
        + '<a href="javascript:alert(1)">bad</a><a href="https://example.com/a">good</a>';
    assert.equal((await request('POST', '/create-post', { title: 'Sanitized post', content: evil }, tokens.accessToken)).status, 201);
    const stored = await prisma.post.findFirst({ where: { title: 'Sanitized post' } });
    assert(!/script|onerror|onclick|javascript:|<img/i.test(stored.content));
    const shown = (await request('GET', '/get-posts?search=Sanitized', null, tokens.accessToken)).data.posts[0].content;
    assert.equal(shown, '<p>Hi</p>bad<a href="https://example.com/a">good</a>');
});

test('rich posts keep their links and legacy posts still render', async () => {
    const rich = '<ul><li><p>One</p></li></ul><p><a href="https://a.com/x">a</a> and <a href="https://b.com/y">b</a> <em>it</em></p>';
    assert.equal((await request('POST', '/create-post', { title: 'Rich post', content: rich }, tokens.accessToken)).status, 201);
    const shown = (await request('GET', '/get-posts?search=Rich', null, tokens.accessToken)).data.posts[0].content;
    assert.equal(shown, rich);
    const me = (await request('GET', '/user', null, tokens.accessToken)).data;
    await prisma.post.create({ data: { title: 'Legacy post', content: '!@**bold** and //it//!@', creatorId: me.id,
        creatorSnapshot: { firstName: me.firstName, lastName: me.lastName, email: me.email, avatarUrl: '' } } });
    const legacy = (await request('GET', '/get-posts?search=Legacy', null, tokens.accessToken)).data.posts[0].content;
    assert.equal(legacy, '<p><strong>bold</strong> and <em>it</em></p>');
});

test('post fields with the wrong type, size or origin are rejected', async () => {
    for (const content of [42, ['<p>x</p>'], { a: 1 }, '<p></p>', '<script>alert(1)</script>', '<p>' + 'a'.repeat(1001) + '</p>']) {
        assert.equal((await request('POST', '/create-post', { title: 'Bad content', content }, tokens.accessToken)).status, 400, JSON.stringify(content).slice(0, 40));
    }
    for (const image of ['https://evil.example/x.png', 'javascript:alert(1)', 'uploads/postImage/../../index.js', 'uploads/userAvatar/x.png', 'uploads/postImage/missing.png', 42]) {
        assert.equal((await request('POST', '/create-post-with-image', { title: 'Bad image', content: '<p>x</p>', image }, tokens.accessToken)).status, 400, String(image));
    }
    const post = (await request('GET', '/get-posts?search=Rich', null, tokens.accessToken)).data.posts[0];
    assert.equal((await request('PATCH', `/update-post/${post.id}`, { image: 'javascript:alert(1)' }, tokens.accessToken)).status, 400);
    assert.equal((await request('PATCH', `/update-post/${post.id}`, { content: { x: 1 } }, tokens.accessToken)).status, 400);
    assert.equal((await request('PATCH', '/user/updateUser', { avatarUrl: 'https://evil.example/a.png' }, tokens.accessToken)).status, 400);
});

test('uploads must be real images and can only be deleted by their owner', async () => {
    assert.equal((await upload('/post/postImage', 'postImage', Buffer.from('<html><script>alert(1)</script></html>'), 'image/png', tokens.accessToken)).status, 400);
    assert.equal((await upload('/post/postImage', 'postImage', pngBytes, 'image/jpeg', tokens.accessToken)).status, 400);
    const mine = await upload('/post/postImage', 'postImage', pngBytes, 'image/png', tokens.accessToken);
    assert.equal(mine.status, 200);
    const fileName = mine.data.url.split('/').pop();
    assert.equal((await request('DELETE', '/post/postImage/' + fileName, null, otherTokens.accessToken)).status, 403);
    assert.equal((await fetch(origin + '/' + mine.data.url)).status, 200);
    assert.equal((await request('DELETE', '/post/postImage/' + fileName, null, tokens.accessToken)).status, 200);
    assert.equal((await request('DELETE', '/post/postImage/' + fileName, null, tokens.accessToken)).status, 404);
    assert.equal((await request('DELETE', '/post/postImage/..%2Findex.js', null, tokens.accessToken)).status, 400);
});

test('several devices can stay signed in and logout only ends one session', async () => {
    const second = (await request('POST', '/user/login', bob)).data;
    const third = (await request('POST', '/user/login', bob)).data;
    assert.notEqual(second.refreshToken, third.refreshToken);
    for (const session of [otherTokens, second, third]) {
        assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: session.refreshToken })).status, 200);
    }
    assert.equal((await request('POST', '/user/logout', { refreshToken: second.refreshToken })).status, 200);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: second.refreshToken })).status, 401);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: otherTokens.refreshToken })).status, 200);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: third.refreshToken })).status, 200);
    assert.equal((await request('POST', '/user/logout', { refreshToken: 'not-a-token' })).status, 200);
});

test('tokens are HttpOnly cookies that never appear in response bodies', async () => {
    const carol = { ...alice, firstName: 'Carol', email: 'carol@example.com' };
    assert.equal((await request('POST', '/user/register', carol)).status, 201);
    const response = await fetch(origin + '/api/hf/user/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(carol),
    });
    const body = await response.text();
    assert(!/accessToken|refreshToken|eyJ/.test(body), body);
    const cookies = response.headers.getSetCookie();
    const access = cookies.find(line => line.startsWith('accessToken='));
    const refresh = cookies.find(line => line.startsWith('refreshToken='));
    for (const line of [access, refresh]) {
        assert.match(line, /HttpOnly/i);
        assert.match(line, /SameSite=Strict/i);
    }
    assert.match(access, /Path=\/api\/hf(;|$)/i);
    assert.match(refresh, /Path=\/api\/hf\/user(;|$)/i);
    assert.match(access, /Max-Age=900/i);
    assert.match(refresh, /Max-Age=1209600/i);

    // A browser authenticates with the cookie alone.
    const cookieHeader = cookies.map(line => line.split(';')[0]).join('; ');
    const profile = await fetch(origin + '/api/hf/user', { headers: { Cookie: cookieHeader } });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).email, carol.email);
});

test('state-changing requests from another origin are refused and credentials stay on the frontend origin', async () => {
    const forbidden = await fetch(origin + '/api/hf/user/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}',
    });
    assert.equal(forbidden.status, 403);
    const allowed = await fetch(origin + '/api/hf/user/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}',
    });
    assert.equal(allowed.status, 200);
    const preflight = await fetch(origin + '/api/hf/user/login', {
        method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
    });
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const foreign = await fetch(origin + '/api/hf/user/login', {
        method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://evil.example');
});

test('refresh tokens rotate, tolerate a short overlap and revoke every session when replayed', async () => {
    const carol = { ...alice, email: 'carol@example.com' };
    const first = (await request('POST', '/user/login', carol)).data;
    const phone = (await request('POST', '/user/login', carol)).data;
    const refreshed = await request('POST', '/user/refreshAccessToken', { refreshToken: first.refreshToken });
    assert.equal(refreshed.status, 200);
    assert.match(refreshed.setCookie.join('\n'), /refreshToken=.*HttpOnly/i);
    assert.notEqual(refreshed.data.refreshToken, first.refreshToken);
    // The retired token still works for a moment, which covers two tabs refreshing at once.
    const overlap = await request('POST', '/user/refreshAccessToken', { refreshToken: first.refreshToken });
    assert.equal(overlap.status, 200);

    // Once the overlap has passed, replaying the retired token proves it was copied.
    const row = await prisma.user.findUnique({ where: { email: carol.email } });
    await prisma.user.update({ where: { id: row.id }, data: {
        refreshToken: row.refreshToken.split(',').map(entry => entry.includes('.') ? entry.replace(/\.\d+$/, '.1') : entry).join(',') } });
    const replay = await request('POST', '/user/refreshAccessToken', { refreshToken: first.refreshToken });
    assert.equal(replay.status, 401);
    assert.match(replay.setCookie.join('\n'), /refreshToken=;/);
    assert.equal((await prisma.user.findUnique({ where: { email: carol.email } })).refreshToken, null);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: phone.refreshToken })).status, 401);
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: overlap.data.refreshToken })).status, 401);
});

test('refresh tokens are stored hashed and credentials are rate limited', async () => {
    const row = await prisma.user.findUnique({ where: { email: bob.email } });
    assert(row.refreshToken.split(',').every(entry => /^[0-9a-f]{64}(\.[0-9a-f]{64}\.\d+)?$/.test(entry)));
    assert(!row.refreshToken.includes(otherTokens.refreshToken));
    assert.equal((await request('POST', '/user/refreshAccessToken', { refreshToken: otherTokens.refreshToken })).status, 200);
    const statuses = [];
    for (let attempt = 0; attempt < 12; attempt++) {
        statuses.push((await request('POST', '/user/login', { email: bob.email, password: 'wrong-password' })).status);
    }
    assert(statuses.includes(429), statuses.join(','));
});

test('the sidebar needs login and only shows activity on your own posts', async () => {
    assert.equal((await request('GET', '/sidebar')).status, 403);
    const created = await request('POST', '/create-post', { title: 'Sidebar post', content: '<p>Hello sidebar</p>' }, tokens.accessToken);
    assert.equal(created.status, 201);
    const post = (await request('GET', '/get-posts?search=Sidebar', null, tokens.accessToken)).data.posts[0];
    assert.equal((await request('PATCH', `/react-to-post/${post.id}/like`, {}, otherTokens.accessToken)).status, 200);
    assert.equal((await request('PATCH', `/react-to-post/${post.id}/comment`, { content: 'x'.repeat(150) }, otherTokens.accessToken)).status, 200);

    const owner = await request('GET', '/sidebar', null, tokens.accessToken);
    assert.equal(owner.status, 200);
    assert(owner.data.stats.members >= 2 && owner.data.stats.posts >= 1 && owner.data.stats.comments >= 1);
    const trending = owner.data.trending.find(item => item.id === post.id);
    assert.equal(trending.likes, 1);
    assert.equal(trending.title, 'Sidebar post');
    assert.equal(owner.data.activity.length, 1);
    assert.equal(owner.data.activity[0].postId, post.id);
    assert.equal(owner.data.activity[0].author, 'Bobby Tester');
    assert.equal(owner.data.activity[0].snippet.length, 91);
    assert(!JSON.stringify(owner.data).match(/@example\.com|passwordHash|refreshToken/));

    // The commenter is not told about their own comment.
    const commenter = await request('GET', '/sidebar', null, otherTokens.accessToken);
    assert.equal(commenter.status, 200);
    assert.equal(commenter.data.activity.length, 0);
});

test('comments accept one character but never blank text', async () => {
    const post = (await request('GET', '/get-posts?search=Sidebar', null, tokens.accessToken)).data.posts[0];
    assert.equal((await request('PATCH', `/react-to-post/${post.id}/comment`, { content: 'k' }, otherTokens.accessToken)).status, 200);
    assert.equal((await request('PATCH', `/react-to-post/${post.id}/comment`, { content: 'k'.repeat(500) }, otherTokens.accessToken)).status, 200);
    for (const content of ['', '   ', '\n\t', 5, null, 'x'.repeat(501)]) {
        assert.equal((await request('PATCH', `/react-to-post/${post.id}/comment`, { content }, otherTokens.accessToken)).status, 400, JSON.stringify(content));
    }
});

test('the newest post and the newest comment come first', async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    assert.equal((await request('POST', '/create-post', { title: 'Order older', content: '<p>first</p>' }, tokens.accessToken)).status, 201);
    await wait(20);
    assert.equal((await request('POST', '/create-post', { title: 'Order newer', content: '<p>second</p>' }, tokens.accessToken)).status, 201);
    const posts = (await request('GET', '/get-posts?limit=10&page=1', null, tokens.accessToken)).data.posts;
    assert(posts.findIndex(post => post.title === 'Order newer') < posts.findIndex(post => post.title === 'Order older'));

    const target = posts.find(post => post.title === 'Order older');
    for (const content of ['first comment', 'second comment', 'third comment']) {
        assert.equal((await request('PATCH', `/react-to-post/${target.id}/comment`, { content }, otherTokens.accessToken)).status, 200);
        await wait(20);
    }
    const listed = (await request('GET', '/get-posts?limit=10&page=1', null, tokens.accessToken)).data.posts.find(post => post.id === target.id);
    assert.deepEqual(listed.comments.map(comment => comment.content), ['third comment', 'second comment', 'first comment']);
    const single = (await request('GET', `/get-post/${target.id}`, null, tokens.accessToken)).data.post;
    assert.deepEqual(single.comments.map(comment => comment.content), ['third comment', 'second comment', 'first comment']);
});
