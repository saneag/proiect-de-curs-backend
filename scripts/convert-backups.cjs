const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Legacy ids (MongoDB ObjectIds) become stable UUIDs, so converting twice gives the same result.
function mapId(kind, id) {
    if (UUID.test(id)) return id.toLowerCase();
    const hex = createHash('sha1').update(`friendo:${kind}:${id}`).digest('hex');
    const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function unwrap(value) {
    if (Array.isArray(value)) return value.map(unwrap);
    if (value && typeof value === 'object') {
        if ('$oid' in value) return value.$oid;
        if ('$date' in value) {
            const raw = value.$date;
            const date = new Date(typeof raw === 'object' ? Number(raw.$numberLong) : raw);
            assert(!Number.isNaN(date.getTime()), 'Invalid date');
            return date.toISOString();
        }
        return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__v')
            .map(([key, item]) => [key === '_id' ? 'id' : key, unwrap(item)]));
    }
    return value;
}

function convert(usersSource, postsSource) {
    const users = unwrap(usersSource);
    const posts = unwrap(postsSource);
    assert(Array.isArray(users) && Array.isArray(posts), 'Backups must be JSON arrays');
    const byEmail = new Map(users.map(user => [user.email, user]));
    const ids = new Set(users.map(user => user.id));
    assert.equal(ids.size, users.length, 'Duplicate user IDs');
    assert.equal(byEmail.size, users.length, 'Duplicate user emails');
    const ownerId = snapshot => {
        const user = byEmail.get(snapshot?.email);
        assert(user, 'Creator or reaction user is missing from users backup');
        return mapId('user', user.id);
    };
    const relations = (outgoing, incoming, from, to) => {
        const forward = users.flatMap(user => (user[outgoing] || []).map(id => {
            assert(ids.has(id), 'Unknown follow user');
            return { [from]: mapId('user', user.id), [to]: mapId('user', id) };
        }));
        const reverse = users.flatMap(user => (user[incoming] || []).map(id => ({ [from]: mapId('user', id), [to]: mapId('user', user.id) })));
        const keys = rows => rows.map(row => JSON.stringify(row)).sort();
        assert.deepEqual(keys(forward), keys(reverse), 'Asymmetric follow arrays; reconcile source first');
        return forward;
    };
    const data = {
        version: 1,
        users: users.map(user => {
            const { followers, following, followRequests, followingRequests, refreshToken, ...row } = user;
            return { ...row, id: mapId('user', user.id) };
        }),
        posts: [], comments: [], reactions: [],
        follows: relations('following', 'followers', 'followerId', 'followingId'),
        followRequests: relations('followingRequests', 'followRequests', 'senderId', 'recipientId'),
    };
    const postIds = new Set();
    for (const post of posts) {
        assert(!postIds.has(post.id), 'Duplicate post ID');
        postIds.add(post.id);
        const { creator, comments = [], reactions = [], tags, ...row } = post;
        data.posts.push({ ...row, id: mapId('post', post.id), creatorId: ownerId(creator), creatorSnapshot: creator });
        comments.forEach((comment, index) => {
            assert.equal(comment.postId, post.id, 'Comment refers to a different post');
            const { creator, ...row } = comment;
            data.comments.push({ ...row, id: mapId('comment', row.id || `${post.id}-comment-${index + 1}`),
                postId: mapId('post', post.id),
                creatorId: ownerId(creator), creatorSnapshot: creator });
        });
        const seen = new Set();
        reactions.forEach((reaction, index) => {
            const userId = ownerId(reaction);
            assert(!seen.has(userId), 'Duplicate reaction for user/post');
            seen.add(userId);
            assert.equal(Number(reaction.like === true) + Number(reaction.dislike === true), 1, 'Ambiguous reaction');
            data.reactions.push({ id: mapId('reaction', reaction.id || `${post.id}-reaction-${index + 1}`),
                postId: mapId('post', post.id), userId, type: reaction.like ? 'LIKE' : 'DISLIKE' });
        });
    }
    return data;
}

function counts(data) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => Array.isArray(value))
        .map(([key, value]) => [key, value.length]));
}

if (require.main === module) {
    const input = path.resolve(process.argv[2] || 'backups/source');
    const output = path.resolve(process.argv[3] || 'backups/postgresql/data.json');
    const read = name => JSON.parse(fs.readFileSync(path.join(input, `SocialMediaApp.${name}.json`), 'utf8').replace(/^\uFEFF/, ''));
    const data = convert(read('users'), read('posts'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    console.log('Converted backup:', counts(data));
}
module.exports = { convert, counts, mapId };
