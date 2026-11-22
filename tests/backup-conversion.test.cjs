const { test } = require('node:test');
const assert = require('node:assert/strict');
const { convert } = require('../scripts/convert-backups.cjs');
const fixture = require('./backup-fixture.cjs');

test('converts Extended JSON, IDs, dates, snapshots and relational data without mutating source', () => {
    const before = JSON.stringify(fixture);
    const data = convert(fixture.users, fixture.posts);
    assert.equal(JSON.stringify(fixture), before);
    assert.equal(data.users[0].id, 'user-1');
    assert.equal(data.users[0].passwordHash, 'fixture-hash');
    assert.equal(data.users[0].refreshToken, null);
    assert.equal(data.posts[0].createdAt, '2023-06-01T12:00:00.000Z');
    assert.equal(data.posts[0].creatorId, 'user-1');
    assert.deepEqual(data.posts[0].creatorSnapshot, fixture.posts[0].creator);
    assert.equal(data.comments[0].postId, 'post-1');
    assert.equal(data.comments[0].id, 'post-1-comment-1');
    assert.deepEqual(data.reactions[0], { id: 'reaction-1', postId: 'post-1', userId: 'user-1', type: 'LIKE' });
    assert.deepEqual(data.follows, [{ followerId: 'user-1', followingId: 'user-2' }]);
    assert(!/"(_id|__v|\$oid|\$date)"/.test(JSON.stringify(data)));
    assert.deepEqual(convert(fixture.users, fixture.posts), data);
});

for (const [name, mutate] of [
    ['missing owner', f => { f.posts[0].creator.email = 'missing@example.test'; }],
    ['duplicate email', f => { f.users[1].email = f.users[0].email; }],
    ['duplicate post', f => { f.posts.push(f.posts[0]); }],
    ['unknown follow', f => { f.users[0].following.push({ $oid: 'missing' }); }],
    ['asymmetric follows', f => { f.users[1].followers = []; }],
    ['duplicate reaction', f => { f.posts[0].reactions.push(f.posts[0].reactions[0]); }],
    ['ambiguous reaction', f => { f.posts[0].reactions[0].dislike = true; }],
    ['invalid date', f => { f.posts[0].createdAt = { $date: 'invalid' }; }],
    ['mismatched comment post', f => { f.posts[0].comments[0].postId = 'wrong'; }],
]) test(`rejects ${name}`, () => {
    const copy = structuredClone(fixture);
    mutate(copy);
    assert.throws(() => convert(copy.users, copy.posts));
});

test('supports canonical Extended JSON dates', () => {
    const copy = structuredClone(fixture);
    copy.posts[0].createdAt = { $date: { $numberLong: '1685620800000' } };
    assert.equal(convert(copy.users, copy.posts).posts[0].createdAt, '2023-06-01T12:00:00.000Z');
});
