# Ubuntu deployment: PostgreSQL, Prisma and Docker

Architecture: Cloudflare Tunnel -> frontend Nginx -> API -> PostgreSQL.
Frontend/backend default to loopback host ports 5000/5001. PostgreSQL remains private.
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
bash scripts/start-friendo.sh
sudo docker compose ps -a
sudo docker compose logs --tail=100 postgres migrate api frontend
curl -I http://127.0.0.1:5000/
curl -i http://127.0.0.1:5001/api/hf/user
```

Expect frontend HTTP 200 and unauthenticated API HTTP 403. The one-shot `migrate`
service should exit 0; the API waits for success. A failed migration prevents API
startup. On subsequent starts, the launcher rebuilds all images before stopping
the running app; Compose runs migrations before starting the updated API.

The launcher prefers 5000/5001, then 5001/5002, 5002/5003, etc. It stops only the
current project's frontend/API before checking socket availability and Docker port
reservations. Other applications and PostgreSQL remain running. Use the ports printed
by the launcher in the curl commands if the preferred pair was busy. A process can
claim a port between selection and Docker startup; if Docker reports a bind conflict,
run the launcher again. It never imports backup data.

To prefer 3000/3001 instead:

```bash
bash scripts/start-friendo.sh 3000
```

Use this launcher on future starts too. Plain `compose up` uses `.env`/default ports,
while the launcher supplies the automatically chosen pair to Compose. Containers keep
their assigned pair across ordinary Docker/server restarts; choosing new ports after
a conflict requires running the launcher again.

If you use an existing named Cloudflare Tunnel, point it to the frontend URL printed by the launcher
(normally `http://127.0.0.1:5000`). Update the tunnel origin if the chosen port changes.
Both ports bind to localhost, so public users still access the frontend via the tunnel
and `/api` is proxied internally. No router port
forwarding or public PostgreSQL port is needed. Keep unrelated sites/tunnels intact.
Verify login, session refresh, feed/search, profiles, post create/edit/delete,
reactions, comments, upload/view/delete images and logout. Restart the stack and
confirm posts and uploads persist.

## Bash shortcut and automatic startup at boot

The Bash wrapper starts Docker, prevents overlapping launcher runs and calls the
same Python port selector every time. Python 3, systemd and flock (util-linux) are
available on standard Ubuntu installations. After pulling the code, create/update
the earlier shortcut from your normal SSH account:

```bash
mkdir -p ~/bin
cat > ~/bin/start-friendo <<'EOF'
#!/usr/bin/env bash
exec bash "$HOME/proiect-de-curs/proiect-de-curs-backend/scripts/start-friendo.sh" "$@"
EOF
chmod +x ~/bin/start-friendo
~/bin/start-friendo
```

You can run it from `~` immediately after logging in. It prompts for sudo when
needed. An optional argument changes the preferred base: `~/bin/start-friendo 3000`.

To use exactly the same logic automatically on every Ubuntu boot, run the following
from the backend directory (the generated service records its absolute path):

```bash
cd ~/proiect-de-curs/proiect-de-curs-backend
sudo tee /etc/systemd/system/friendo.service >/dev/null <<EOF
[Unit]
Description=Start Friendo with automatic port selection
Requires=docker.service
Wants=network-online.target
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PWD
ExecStart=/usr/bin/bash $PWD/scripts/start-friendo.sh
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now friendo.service
```

This runs once per boot; Docker restart policies supervise the containers afterward.
`active (exited)` is normal for this one-shot service. Run `sudo systemctl restart
friendo` to rerun port selection, and `sudo journalctl -u friendo -b --no-pager` to
see the chosen local URLs. Startup may select a different frontend port. The temporary
tunnel below follows that port automatically; update any separate named tunnel's
origin yourself. Boot-time Docker builds/startup still require
verification on the server. The script never imports or deletes database records.

## Background public tunnel

When `cloudflared` is installed, the launcher now starts a temporary Quick Tunnel
automatically, using the selected frontend port. It runs in the separate transient
`friendo-tunnel.service` unit, survives terminal logout and restarts after a process
failure. On each Ubuntu boot, the enabled `friendo.service` creates it again. No
change to the existing Friendo boot unit is needed: pull the updated code.

After pulling, run `~/bin/start-friendo` or `sudo systemctl restart friendo`.
The launcher waits up to 30 seconds and prints `Public website: https://...trycloudflare.com`
using logs from the current tunnel invocation. During systemd startup, this output is
recorded in `sudo journalctl -u friendo -b --no-pager`. If URL discovery times out or
logs cannot be read, the app remains running and the launcher prints a fallback command.
Find the public URL manually (retry after a few seconds if the tunnel is still connecting):

```bash
sudo journalctl -u friendo-tunnel -b --no-pager -o cat | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
```

The URL can change each time the tunnel restarts. Quick Tunnels are intended for
temporary access; a permanent domain needs a named tunnel. The launcher replaces
only its own tunnel service; other `cloudflared` services or previously launched
`nohup` processes are left untouched. A previously started nohup tunnel is no longer
needed; stop that specific process separately if it is still running.

To stop public access through this managed temporary tunnel:

```bash
sudo systemctl stop friendo-tunnel
```

Stopping only the app containers does not stop this separate tunnel. To keep both
stopped across reboots, disable `friendo.service`, stop `friendo-tunnel.service`, and
stop the Compose stack. Running the launcher recreates the tunnel. If cloudflared is
missing or cannot start, the local app remains running and the launcher reports it.
Check `sudo journalctl -u friendo-tunnel -b --no-pager` for connection errors. A new
public URL appears only after successful contact with Cloudflare; if startup fails,
the latest URL in old logs may no longer work. Live systemd/tunnel startup must be
verified on Ubuntu; local tests use mocked systemd commands.

Reference: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

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
