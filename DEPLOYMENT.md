# Ubuntu deployment: PostgreSQL, Prisma and Docker

Architecture: Cloudflare Tunnel -> 127.0.0.1:8082 -> frontend Nginx -> API -> PostgreSQL.
Only the frontend has a loopback host port. The database and API remain private.
Both repositories must be sibling directories. Deploy the matching `id` frontend
and Prisma backend together. Existing MongoDB volumes are not converted automatically.

## 5. Get the completed migration on Ubuntu

Back up the old application, database and uploads. Stop the existing stack before
pulling the new Compose file. Preserve `.env`, the Compose project name and old release
for rollback. Do not delete volumes when stopping containers.

```bash
cd /YOUR/APPS/proiect-de-curs-backend
sudo docker compose stop
git pull --ff-only
cd ../proiect-de-curs-frontend
git pull --ff-only
cd ../proiect-de-curs-backend
sudo docker --version
sudo docker compose version
```

## 6. Configure, migrate and import

For a new installation copy `.env.example` to `.env`. For an update edit the existing
file. Keep JWT secrets unless deliberately invalidating old sessions. Generate a
PostgreSQL password using `openssl rand -hex 32`. Set:

```dotenv
POSTGRES_USER=friendo_app
POSTGRES_PASSWORD=YOUR_PASSWORD
POSTGRES_DB=friendo
DATABASE_URL=postgresql://friendo_app:YOUR_PASSWORD@postgres:5432/friendo
JWTSECRET=YOUR_EXISTING_OR_NEW_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWTREFRESHSECRET=A_DIFFERENT_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
FRONTEND_ORIGIN=https://YOUR_PUBLIC_HOSTNAME
```

Use matching database credentials in both settings. URL-encode special password
characters in DATABASE_URL; hex passwords need no encoding. Changing environment
credentials after PostgreSQL initialization does not change its stored password.
Keep `.env` private (`chmod 600 .env`). No MongoDB settings are needed.

Schedule a maintenance window and stop writes. Stop the existing `api`/`frontend`
containers and old `mongodb` container if present, preserving all volumes. Upload
`backups/postgresql/data.json` separately: it is intentionally not in Git. Transfer
existing uploads separately, preserving their paths and the `uploads_data` volume.

```bash
sudo docker compose config --quiet
sudo docker compose build migrate api frontend
sudo docker compose up -d postgres
sudo docker compose run --rm migrate
```

Import into the empty target **before starting the API**:

```bash
sudo docker compose run --rm --user "$(id -u):$(id -g)" -v "$PWD/backups/postgresql:/data:ro" migrate node scripts/import-backups.cjs /data/data.json
```

See BACKUP-IMPORT.md for SCP and file permissions. Verify totals: 6 users, 13 posts,
3 comments, 12 reactions, 2 follows. The importer is transactional and refuses
nonempty tables. Imported users log in again: password hashes are preserved and
refresh tokens are cleared.

## 7. Start, verify and expose

```bash
sudo docker compose up -d
sudo docker compose ps -a
sudo docker compose logs --tail=100 postgres migrate api frontend
curl -I http://127.0.0.1:8082/
curl -i http://127.0.0.1:8082/api/hf/user
```

Expect frontend HTTP 200 and unauthenticated API HTTP 403. The one-shot `migrate`
service should exit 0; the API waits for success. A failed migration prevents API
startup. For subsequent schema updates, explicitly run the migration service before
starting the updated API.

Point your existing Cloudflare Tunnel to `http://127.0.0.1:8082`. No router port
forwarding or public PostgreSQL port is needed. Keep unrelated sites/tunnels intact.
Verify login, session refresh, feed/search, profiles, post create/edit/delete,
reactions, comments, upload/view/delete images and logout. Restart the stack and
confirm posts and uploads persist.

## Backups and rollback

Back up PostgreSQL and the uploads volume regularly. From the backend directory:

```bash
sudo docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > friendo.dump
```

Store backups privately and test restoring into a separate database. Keep the old
MongoDB volume and release through cutover. For rollback, stop new writes and restore
the matching old backend/frontend/configuration. PostgreSQL-only writes require
reconciliation; reverting code does not migrate those writes back.

## Local verification

```bash
npm ci
npm test
npm run test:backup
npm run test:backup:integration
cd ../proiect-de-curs-frontend
npm ci
npm test
npm run build
```

Tests use isolated temporary PostgreSQL clusters, never the deployment database.
Run as a regular user: PostgreSQL refuses initialization as root. Docker image builds,
Compose startup and public routing still require verification on Ubuntu because
Docker is unavailable on the development machine used for this migration.
