# PostgreSQL migration plan

## Contract and design

Preserve routes, response envelopes, password hashes, timestamps,
upload paths, and creator snapshots. Rename `_id` to `id` in the API, JWT handling,
types and frontend. Use Prisma Client with PostgreSQL and versioned Prisma migrations.
New IDs are UUID strings; imported ID values stay unchanged.
Users, posts, comments and reactions use separate tables. Ownership and new reactions
use stable user IDs. Creator snapshots remain JSONB intentionally to preserve existing
display behavior. Follows and follow requests use relational tables.

The full application migration is paused pending user approval. The separately
requested backup import package is implemented; see BACKUP-IMPORT.md. Only users and
posts backups were supplied, including embedded comments and reactions. No standalone
comments or notifications backup has been imported.

## Implementation sequence

1. Add Prisma schema, migrations, constraints, indexes, client and migration command.
2. Replace Mongoose persistence with Prisma queries and plain TS types; remove MongoDB
   runtime dependencies, types, initialization and configuration.
3. Update commands, strategies and frontend to use `id`. Serialize
   reaction toggles in transactions; cascade child rows when a post is deleted.
4. Add an atomic importer for mongoexport JSON arrays (canonical or relaxed Extended
   JSON). Preserve IDs, hashes and snapshots. Refuse a nonempty target or unresolved
   post owners; resolve those against source records before cutover. Never guess owners.
5. Update Compose, environment example and deployment instructions.
6. Run automated API/database/import tests and TypeScript build. Separately verify
   real PostgreSQL, Docker startup, persistence and browser flows before production.

## Acceptance test cases

| Area | Cases and expected outcomes |
|---|---|
| Schema | Apply twice without errors; unique emails, foreign keys and reaction uniqueness enforced; failed migration rolls back |
| Registration | Valid user succeeds; duplicate email conflicts; invalid names/password rejected; no hashes/tokens in public responses |
| Authentication | Correct/incorrect password; protected route rejects missing token; refresh succeeds; logout revokes refresh token |
| Users | List, current user, lookup, update; email change preserves ownership |
| Posts | Text/image creation, nested creator and `id` contract, detail, partial update, delete; another user cannot edit/delete |
| Feed | Search title/creator case-insensitively; literal `%`, `_`, quotes; email filter; pagination, clamped limit, counts and newest-first order |
| Reactions | Like/unlike, dislike/undislike, switch sides, repeated/concurrent requests produce at most one reaction per user/post; authenticated identity used |
| Comments | Add and retrieve snapshot, content, timestamps and count; unknown post rejected |
| Integrity | Delete post removes children; invalid writes fail without partial changes |
| Import | Preserve source IDs, dates, hashes, relationships, snapshots, tags and counts; reject missing owner, duplicate or invalid data atomically; refuse rerun into nonempty target |
| Deployment (manual) | Compose config/startup, restart persistence, database unavailable startup fails, frontend login/feed/edit/react/comment, image upload/view/delete, backup/restore rehearsal |

## Cutover and rollback

Do not run the importer against production while writes are active. Back up MongoDB
and uploads, pause writes, export the required collections with `mongoexport --jsonArray`,
apply PostgreSQL schema to an empty database, import, reconcile row/content counts,
then run the acceptance suite and browser checks. Keep the old database/volume and
release intact. Switch traffic only after checks pass. For rollback, stop new writes,
revert application and database configuration to MongoDB and restore the old release.
Writes accepted only by PostgreSQL require reconciliation before rollback; do not
silently discard them. No live database is migrated by changing this repository.

Prisma reference: https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions
