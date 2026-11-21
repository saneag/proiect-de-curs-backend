# Ubuntu deployment with Docker and Cloudflare Tunnel

This guide adapts README-home-website.md to the full Friendo application.
Cloudflare -> 127.0.0.1:8082 -> frontend Nginx -> API -> MongoDB.
The API and MongoDB have no published host ports. Keep your old static site
on 8081. No router forwarding, host Nginx, or Certbot is needed here.

## 1. Get the migrated code

For a new installation, connect to Ubuntu, replacing your SSH details:

```powershell
ssh YOUR_USER@YOUR_SERVER_IP
```

On Ubuntu:

```bash
mkdir -p ~/apps/proiect-de-curs-vite
cd ~/apps/proiect-de-curs-vite
git clone --branch master https://github.com/saneag/proiect-de-curs-frontend.git
git clone --branch master https://github.com/saneag/proiect-de-curs-backend.git
cd proiect-de-curs-backend
```

Both source folders must be siblings: proiect-de-curs-backend and
proiect-de-curs-frontend. If this app is already deployed, update its existing
source folders instead, preserving its .env, Compose project name and volumes.
Do not create another database or replace credentials during an update.

## 2. Verify prerequisites

```bash
sudo docker --version
sudo docker compose version
cloudflared --version
command -v cloudflared
sudo ss -ltnp | grep ':8082 ' || true
```

CasaOS commonly provides Docker. Install the Compose plugin if missing using
Docker's official Ubuntu guide. If cloudflared is missing, follow your existing
home-website guide and select the package matching your CPU architecture.
Host Node.js/npm and MongoDB are unnecessary: Docker installs them in images.

If 8082 is used by another site, change the host side of 127.0.0.1:8082:80 in
compose.yaml to a free port and use that port in all commands below. Do not
remove an unrelated container.

## 3. Configure secrets (new installation only)

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Fill the four blank values with different random secrets:

```dotenv
JWTSECRET=YOUR_FIRST_RANDOM_VALUE
JWTREFRESHSECRET=YOUR_SECOND_RANDOM_VALUE
MONGO_ROOT_PASSWORD=YOUR_THIRD_RANDOM_VALUE
MONGO_APP_PASSWORD=YOUR_FOURTH_RANDOM_VALUE
```

Run `openssl rand -hex 32` four times to generate them. Keep the default
MongoDB usernames/database and FRONTEND_ORIGIN=http://localhost:8082 initially.
Compose constructs MONGOURI itself; the example host-run MONGOURI is not used.
Never commit .env or put these secrets in public VITE_* configuration.

FRONTEND_ORIGIN controls cross-origin CORS requests. This deployment uses
same-origin /api/hf requests, so the localhost default does not block the
Quick Tunnel. For a stable hostname set it to its exact origin, such as
https://app.example.com, without a trailing slash. Keep VITE_API_URL=/api/hf.

## 4. Build and start

```bash
sudo docker compose config --quiet
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 mongodb api frontend
```

The first build may take several minutes. MongoDB should become healthy and
the API should log Connected to Database and Server running on port 5000.
The frontend builds with Vite and serves dist/ through Nginx. Do not run a
separate npm start/dev process on the server.

## 5. Check locally before starting a tunnel

```bash
curl -I http://127.0.0.1:8082/
curl -I http://127.0.0.1:8082/userProfile
curl -i http://127.0.0.1:8082/api/hf/user
```

Expect HTTP 200 for the first two requests. The API request should return
HTTP 403 without a token, proving the proxy reaches authentication middleware.
A 502 indicates an API/upstream problem; inspect logs before continuing.
SERVER_IP:8082 is intentionally unavailable because the port binds to localhost.

## 6. Test public access

```bash
cloudflared tunnel --url http://127.0.0.1:8082
```

Open the printed https://...trycloudflare.com URL. Test registration, login,
post creation, image upload/display, profile editing, profile URL reload, and
logout. Check from a phone on mobile data too. API/image URLs stay on the same
origin, so Quick Tunnel hostname changes do not require frontend rebuilds.

## 7. Run a separate background tunnel for this app

Stop the manual tunnel with Ctrl+C. Leave your old website/tunnel alone.

```bash
command -v cloudflared
sudo nano /etc/systemd/system/cloudflared-friendo.service
```

Paste the following. Change /usr/bin/cloudflared if command -v showed another path:

```ini
[Unit]
Description=Cloudflare Quick Tunnel for Friendo
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared tunnel --url http://127.0.0.1:8082
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable it and find the new URL:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-friendo.service
sudo systemctl status cloudflared-friendo.service --no-pager
sudo journalctl -u cloudflared-friendo.service -n 100 --no-pager
```

Use the URL in these logs: restarting a Quick Tunnel creates a new hostname.
You can disconnect SSH. Compose containers use restart: unless-stopped.
After reboot:

```bash
sudo docker compose ps
sudo systemctl is-active cloudflared-friendo.service
sudo journalctl -u cloudflared-friendo.service -b --no-pager | grep trycloudflare.com
```

Quick Tunnels have temporary URLs and no uptime guarantee, and are intended for
testing/development. Use a named Cloudflare Tunnel and your own domain for a
stable deployment. Its service target is also http://127.0.0.1:8082 when
cloudflared runs on Ubuntu itself. If cloudflared runs in a container, localhost
means that container; use a shared Docker network/service address instead.

## 8. Updates, logs, and data

Pull both repositories, keeping the existing .env and Compose project:

```bash
git -C ../proiect-de-curs-frontend pull --ff-only origin master
git pull --ff-only origin master
```

Then rebuild:

```bash
sudo docker compose up -d --build
sudo docker compose restart frontend
sudo docker compose ps
sudo docker compose logs --tail=100 api frontend
```

Restarting frontend ensures Nginx resolves the API's current container IP.
To stop without deleting persistent data:

```bash
sudo docker compose down
sudo systemctl stop cloudflared-friendo.service
```

Start again with:

```bash
sudo docker compose up -d
sudo systemctl start cloudflared-friendo.service
```

MongoDB data persists in mongodb_data and uploads in uploads_data. Never use
`docker compose down -v` unless you intend to delete those volumes. Back up
both the database and uploads and keep an off-server copy; volumes are not backups.

MongoDB initialization creates a database-scoped readWrite user only when the
volume is empty. Editing .env passwords later does not change existing MongoDB
accounts. Preserve existing credentials during updates.

## Verification before handoff

TypeScript and the Vite build passed. All 11 frontend tests and 10 API tests
passed, using isolated temporary MongoDB 7.0.24. A browser exercised the built
frontend with the real API/database: registration, login, image posts, reactions,
comments, profile/avatar editing, direct links, reload/session restoration, and
logout. Both final dependency audits reported zero known vulnerabilities.

Reproduce on a development machine with compatible Node:

```bash
cd ../proiect-de-curs-frontend
npm ci
npm test
npm run build
cd ../proiect-de-curs-backend
npm ci
npm test
```

The backend tests download a MongoDB executable on first run and never connect
to the deployment database. Running tests is not required to start production.
Docker is unavailable on the verification machine, so image builds, MongoDB
Compose initialization, volume permissions/persistence, the actual tunnel, and
reboot behavior still need checking on Ubuntu. See the frontend README for
existing incomplete features and the non-blocking JS bundle size warning.

## Official references

- [Docker and Compose on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
- [Vite environment variables](https://vite.dev/guide/env-and-mode)
