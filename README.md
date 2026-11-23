# Friendo API

The Express and TypeScript backend for Friendo, a course project social media application. It provides registration and login, user profiles, a searchable post feed, image uploads, comments, and like/dislike reactions.

The API now uses **PostgreSQL through Prisma instead of MongoDB**. Deploy it with the matching [Vite frontend](https://github.com/saneag/proiect-de-curs-frontend): API records and frontend state use `id` instead of `_id`.

## Contents

- [Technology and architecture](#technology-and-architecture)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Commands and structure](#commands-and-structure)
- [Deploy on an Ubuntu server](#deploy-on-an-ubuntu-server)
- [Data migration and backups](#data-migration-and-backups)
- [Testing and limitations](#testing-and-limitations)

## Technology and architecture

| Area | Implementation |
| --- | --- |
| API | Node.js, Express 4, TypeScript |
| Database | PostgreSQL, Prisma Client, committed SQL migrations |
| Authentication | JWT access/refresh tokens and bcrypt password hashes |
| Validation and uploads | express-validator and Multer |
| Deployment | Docker Compose, Nginx frontend, optional Cloudflare Tunnel |

Production requests flow through the frontend's Nginx server to the API and PostgreSQL. Nginx forwards `/api/` and `/uploads/` internally. PostgreSQL has no published host port in Compose.

The schema contains users, posts, comments, reactions, follows, and follow requests. Creator snapshots remain JSONB to preserve historical display data. New records receive UUIDs; imported records retain their original ID strings.

API routes start with `/api/hf`; images are served under `/uploads`. See [the Postman collection](HF.postman_collection.json), [user routes](src/routes/userRoutes.ts), and [post routes](src/routes/postRoutes.ts) for endpoints and request examples.

## Run locally

Use Node.js 24, npm, and PostgreSQL 17 for consistency with the Docker deployment. Keep the repositories in sibling directories:

```text
proiect-de-curs/
  proiect-de-curs-backend/
  proiect-de-curs-frontend/
```

Create a database and role. On Ubuntu with PostgreSQL installed:

```bash
sudo -u postgres createuser --pwprompt friendo_app
sudo -u postgres createdb --owner=friendo_app friendo
```

From the backend directory:

```bash
npm ci
cp .env.example .env
```

Edit `.env` for a host-run database:

```dotenv
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://friendo_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/friendo
JWTSECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWTREFRESHSECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
```

Generate each JWT secret separately with `openssl rand -hex 32`. URL-encode special characters in the database password when placing it in `DATABASE_URL`. Then apply the schema and start development:

```bash
npm run prisma:generate
npm run db:migrate
npm start
```

Start the frontend in another terminal with `npm run dev`. Vite normally listens on port 5173 and forwards `/api` and `/uploads` to the backend on port 5000. An unauthenticated request to `http://127.0.0.1:5000/api/hf/user` should return HTTP 403.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL: use `127.0.0.1` for a host database or `postgres` inside Compose. |
| `JWTSECRET` | Access-token signing secret, at least 32 characters. |
| `JWTREFRESHSECRET` | Separate refresh-token signing secret, at least 32 characters. |
| `PORT` | Internal API port; defaults to 5000. |
| `FRONTEND_ORIGIN` | Allowed browser origin, such as `http://localhost:5173` for development. |
| `POSTGRES_USER` | Compose database role; defaults to `friendo_app`. |
| `POSTGRES_PASSWORD` | Required password for Compose database initialization. |
| `POSTGRES_DB` | Compose database name; defaults to `friendo`. |
| `FRONTEND_PORT` | Frontend host port for direct Compose use; defaults to 5000. |
| `BACKEND_PORT` | API host port for direct Compose use; defaults to 5001. |

Keep `.env` private and out of Git. The launcher selects available host ports for its Compose invocation. Changing environment credentials after initialization does not change PostgreSQL's stored password.

## Commands and structure

| Command | Purpose |
| --- | --- |
| `npm start` | Run the development API with nodemon. |
| `npm run build` | Generate Prisma Client and compile into `build/`. |
| `npm run prod` | Build, copy source uploads into `build/uploads`, and run the compiled API. |
| `npm run prisma:validate` | Validate the Prisma schema. |
| `npm run prisma:generate` | Generate and compile Prisma Client for import/test use. |
| `npm run db:migrate` | Apply committed migrations to the configured database. |
| `npm test` | Build and run API integration tests against temporary PostgreSQL. |
| `npm run test:backup` | Test backup conversion. |
| `npm run test:backup:integration` | Test migrations and atomic imports against temporary PostgreSQL. |

```text
src/controllers/   User and post operations
src/db/            Prisma client and database connection
src/middlewares/   Authentication and validation
src/routes/        HTTP routes
src/uploads/       Development uploads and initial images
prisma/            Schema and committed SQL migrations
scripts/           Conversion/import tools and Ubuntu startup launcher
tests/             API, import, conversion, and launcher tests
compose.yaml       PostgreSQL, migration, API, and frontend services
```

Use the Docker workflow below for server deployments and persistent uploads. The host `prod` command copies source uploads during each build.

## Deploy on an Ubuntu server

For standalone Ubuntu PostgreSQL shared across development devices, follow
[the host PostgreSQL setup and migration guide](HOST-POSTGRES.md). It preserves
the existing Docker database for rollback and keeps uploaded images in place.

### 1. Prepare the server and repositories

Install Docker Engine with the Compose plugin, Git, Python 3, and `flock` from util-linux. The launcher also uses systemd and sudo. Docker provides Node.js inside the images; no host Node.js installation is required. Install `cloudflared` if you want the launcher's temporary public tunnel.

For an existing installation, back up the database and uploads and stop application writes before changing releases. Preserve the old MongoDB volume and release during migration. Do not use `docker compose down -v` on data you need.

For a new installation:

```bash
mkdir -p ~/proiect-de-curs
cd ~/proiect-de-curs
git clone https://github.com/saneag/proiect-de-curs-backend.git
git clone https://github.com/saneag/proiect-de-curs-frontend.git
cd proiect-de-curs-backend
sudo docker --version
sudo docker compose version
cp .env.example .env
chmod 600 .env
```

### 2. Configure production values

Edit the backend `.env`:

```dotenv
POSTGRES_USER=friendo_app
POSTGRES_PASSWORD=REPLACE_WITH_A_RANDOM_HEX_PASSWORD
POSTGRES_DB=friendo
DATABASE_URL=postgresql://friendo_app:REPLACE_WITH_A_RANDOM_HEX_PASSWORD@postgres:5432/friendo
JWTSECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
JWTREFRESHSECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
FRONTEND_ORIGIN=https://YOUR_PUBLIC_HOSTNAME
FRONTEND_PORT=5000
BACKEND_PORT=5001
```

Generate the database password and each secret separately with `openssl rand -hex 32`. Use the same database password in both settings. Keep existing JWT secrets during an update unless deliberately invalidating sessions. For local access through SSH forwarding, use `FRONTEND_ORIGIN=http://localhost:5000` instead of a public hostname.

Production browser requests use the same-origin Nginx proxy, so no separate public API hostname is required.

### 3. Build and apply the schema

From the backend directory:

```bash
sudo docker compose config --quiet
sudo docker compose build migrate api frontend
sudo docker compose up -d postgres
sudo docker compose run --rm migrate
```

For a new empty installation, continue to startup. To retain MongoDB records, transfer and import the converted backup **before starting the API**, following [BACKUP-IMPORT.md](BACKUP-IMPORT.md). Git does not contain private backups. Transfer existing uploaded images separately and preserve their paths and the deployment's `uploads_data` volume.

### 4. Start manually, including after a reboot

```bash
cd ~/proiect-de-curs/proiect-de-curs-backend
bash scripts/start-friendo.sh
```

The launcher starts Docker, checks configuration, rebuilds the migration/API/frontend images, selects available paired ports starting at **5000/5001**, and starts Compose in the background. Building happens before it stops this project's frontend/API, so a failed build leaves the running app untouched. It does not import data. The API waits for the migration service to succeed. Use the printed URLs if the preferred pair was occupied.

Both published ports bind to `127.0.0.1` on the server. Access the frontend through a reverse proxy, Cloudflare Tunnel, or SSH forwarding. From your computer:

```bash
ssh -L 5000:127.0.0.1:5000 USER@SERVER
```

Open `http://localhost:5000`. If the launcher selected a different frontend port, substitute it in the destination part of the SSH command.

If `cloudflared` is installed, the launcher also starts a temporary public tunnel in `friendo-tunnel.service`, which survives SSH logout. It waits up to 30 seconds for the current launch's URL and prints `Public website: https://...trycloudflare.com` automatically. If the URL is delayed, the app keeps running and the launcher prints a log-check command. Retrieve the URL manually with:

```bash
sudo journalctl -u friendo-tunnel -b --no-pager -o cat | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
```

The temporary URL can change on restart. For a permanent hostname, use a named tunnel or reverse proxy pointing at the selected frontend port. See [DEPLOYMENT.md](DEPLOYMENT.md) for tunnel management.

Create an optional shortcut to run from any directory:

```bash
mkdir -p ~/bin
cat > ~/bin/start-friendo <<'EOF'
#!/usr/bin/env bash
exec bash "$HOME/proiect-de-curs/proiect-de-curs-backend/scripts/start-friendo.sh" "$@"
EOF
chmod +x ~/bin/start-friendo
~/bin/start-friendo
```

Adjust the repository path if needed. After a server restart, run `~/bin/start-friendo` again. To prefer another port pair, run `~/bin/start-friendo 3000`.

For **automatic startup at boot**, install the `friendo.service` unit from [DEPLOYMENT.md](DEPLOYMENT.md). Once installed:

```bash
sudo systemctl restart friendo
sudo systemctl status friendo
```

`active (exited)` is expected for this one-shot service. Docker restart policies supervise the containers afterward.

### 5. Verify and maintain

```bash
sudo docker compose ps -a
sudo docker compose logs --tail=100 postgres migrate api frontend
curl -I http://127.0.0.1:5000/
curl -i http://127.0.0.1:5001/api/hf/user
```

Use the launcher's printed ports if different. Expect frontend HTTP 200, API HTTP 403 without a token, and migration service exit code 0. Test login, feed, profiles, comments, reactions, uploads, and session restoration. Restart the stack and confirm records and images persist.

Data lives in `postgres_data` and uploaded images in `uploads_data`. Back up both. Stop the application with `sudo docker compose stop`; stop its managed tunnel separately with `sudo systemctl stop friendo-tunnel`.

For updates: back up, push your changes to GitHub, then run the launcher. It pulls both repositories' configured upstream branches with `git pull --ff-only`, then rebuilds all three images before stopping the app; Compose runs the migration service before starting the API. Tracked local changes or a failed pull/build leave the running app untouched. Git runs as each checkout's owner, including when the launcher uses sudo. Do not reimport backups into an existing database. Keep the Compose project name stable so the same volumes are used.

## Data migration and backups

- [BACKUP-IMPORT.md](BACKUP-IMPORT.md): convert MongoDB exports, transfer private files, and import into empty PostgreSQL tables.
- [MIGRATION.md](MIGRATION.md): schema decisions, API changes, acceptance cases, and rollback considerations.
- [DEPLOYMENT.md](DEPLOYMENT.md): detailed Ubuntu cutover, boot service, tunnels, and backup commands.

The importer is transactional and refuses a nonempty target. It preserves hashes, IDs, timestamps, and image paths, but clears refresh tokens so imported users log in again. Changing `DATABASE_URL` alone does not migrate MongoDB data.

## Testing and limitations

```bash
npm test
npm run test:backup
npm run test:backup:integration
python3 -m unittest discover -s tests -p 'test_start_friendo.py'
```

Database tests create isolated temporary PostgreSQL clusters, rather than using the deployment database. On Linux, run tests as a regular user because PostgreSQL initialization refuses root. Launcher tests mock systemd operations where appropriate.

Local tests do not verify Docker builds, live Ubuntu startup, volume permissions, public routing, or reboot behavior. Check these on the server before switching live traffic. The frontend Groups page remains a placeholder and post-edit controls are disabled, although the API exposes an update endpoint.
