const date = { $date: '2023-06-01T12:00:00.000Z' };
const oid = value => ({ $oid: value });
const creator = { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.test', avatarUrl: 'uploads/avatar.png' };
const user = (id, email) => ({ _id: oid(id), firstName: 'Alice', lastName: 'Smith', email,
    passwordHash: 'fixture-hash', avatarUrl: '', description: '', role: 'user',
    createdAt: date, updatedAt: date, followers: [], following: [], followRequests: [], followingRequests: [], __v: 0 });
const users = [user('user-1', creator.email), user('user-2', 'bob@example.test')];
users[0].following = [oid('user-2')];
users[1].followers = [oid('user-1')];
const posts = [{ _id: oid('post-1'), title: "A 'quoted' title", content: '<p>Hello</p>', image: 'uploads/post.png',
    creator, createdAt: date, updatedAt: date, tags: ['example'], __v: 0,
    comments: [{ content: 'Hello there', creator, postId: 'post-1', createdAt: date, updatedAt: date }],
    reactions: [{ _id: oid('reaction-1'), email: creator.email, like: true }] }];
module.exports = { users, posts };
