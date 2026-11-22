# Import the SocialMediaApp backups into PostgreSQL

The backup package is ready for a **new, empty PostgreSQL database**. The current
Express application still uses MongoDB: importing these records does not switch the
application to PostgreSQL. Complete the separately planned Prisma/API migration
before pointing application traffic at this database. No server has been changed.

## Included locally

- `backups/source/SocialMediaApp.users.json` and `SocialMediaApp.posts.json`: original copies.
- `backups/postgresql/data.json`: converted records for Prisma.
- `prisma/schema.prisma` and `prisma/migrations/`: PostgreSQL schema and initial migration.
- `scripts/convert-backups.cjs` and `scripts/import-backups.cjs`: conversion and atomic import.

Expected records: **6 users, 13 posts, 3 comments, 12 reactions, 2 follows,
0 follow requests**. The source files remain unchanged.

All models use `id`, with the original ID strings retained. New records use UUIDs.
Posts/comments refer to users by `creatorId`; reactions use `userId` and a
`LIKE`/`DISLIKE` enum. Follow arrays become relational rows. Creator snapshots remain
JSONB to preserve historical names and avatars. Password hashes, timestamps, HTML
content, tags and image paths are preserved. Missing comment IDs are assigned stable
IDs based on their post and array position. MongoDB version/wrapper fields are removed.
Refresh tokens are cleared, so imported users must log in again.

`backups/` is excluded from Git and Docker build contexts because it contains account
data and password hashes. Transfer the converted file privately; a Git pull alone
will **not** download it. Image files are not in these JSON backups: transfer the
existing uploads separately, preserving their paths.

## Ubuntu: prepare the database

Use Node.js 24 LTS (or a Prisma-compatible Node.js 22 release, at least 22.12) and
PostgreSQL 16 or newer. These commands assume a host-installed PostgreSQL instance;
the existing MongoDB Compose stack is unchanged.

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo -u postgres createuser --pwprompt socialmedia_app
sudo -u postgres createdb --owner=socialmedia_app --encoding=UTF8 --template=template0 socialmedia
```

In the backend directory on Ubuntu, add this to `.env`, replacing the password
and URL-encoding special characters in it. Keep the file private:

```dotenv
DATABASE_URL=postgresql://socialmedia_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/socialmedia
```

```bash
chmod 600 .env
mkdir -p backups/postgresql
chmod 700 backups backups/postgresql
```

Upload the repository changes using your usual deployment process. From local
PowerShell, with the backend as your working directory, upload the converted data:

```powershell
scp backups/postgresql/data.json USER@SERVER:/ABSOLUTE/BACKEND/PATH/backups/postgresql/data.json
```

Replace `USER`, `SERVER` and the destination path. The importer does not need the
original MongoDB exports on the server.

## Ubuntu: apply schema and import

Run from the backend directory. Install dev dependencies too: the Prisma CLI and
TypeScript compiler are needed for this import workflow.

```bash
npm ci --include=dev
chmod 600 backups/postgresql/data.json
npm run prisma:validate
npm run prisma:generate
npm run db:migrate
npm run backup:import
```

The importer verifies table counts inside the same transaction and prints the
expected totals. It refuses any nonempty target table, never truncates existing
data, and rolls back all inserted records on an error. Keep application writes
stopped during import. An existing PostgreSQL database should be backed up before
schema changes; prefer a fresh database for this first migration.

To verify totals independently (psql prompts for the password):

```bash
psql -h 127.0.0.1 -U socialmedia_app -d socialmedia -W <<'SQL'
SELECT 'users' AS entity, count(*) FROM users
UNION ALL SELECT 'posts', count(*) FROM posts
UNION ALL SELECT 'comments', count(*) FROM comments
UNION ALL SELECT 'reactions', count(*) FROM reactions
UNION ALL SELECT 'follows', count(*) FROM follows
UNION ALL SELECT 'follow_requests', count(*) FROM follow_requests;
SQL
```

After a successful import, repeating `npm run backup:import` fails safely because
the target is no longer empty. Do not use `prisma migrate reset` on server data.

## Regenerate and test locally

```bash
npm run backup:convert
npm run test:backup
npm run test:backup:integration
```

The integration test starts an isolated temporary PostgreSQL cluster, applies
Prisma migrations twice, checks failed-import rollback, imports data, rejects a
second import, checks reaction uniqueness and cascading post deletion. If the
private converted backup is present, it also imports it and compares every field.
It never uses `DATABASE_URL` for its target database. On Linux, run this test as
a regular user, since PostgreSQL refuses to initialize as root.

Prisma references: [client generation](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/generating-prisma-client),
[transactions](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions).
