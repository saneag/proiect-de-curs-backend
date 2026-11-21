# Ubuntu deployment with Docker Compose

This stack runs the frontend, API, and MongoDB together. MongoDB has no host-published port; only the frontend is reachable from the Ubuntu host, on `127.0.0.1:8082`. Nginx in the frontend container proxies API and upload requests to the backend over the private Compose network.

The backend dependencies have been refreshed, including Multer 2.5. The frontend still has audit findings in Create React App's build and development dependencies; review these before deployment. The container deployment has not yet been verified on Ubuntu.

## Prepare the server

Install Docker Engine and the Docker Compose plugin on Ubuntu. Clone both repositories next to each other, because the backend Compose file builds the frontend from the sibling directory:

```text
~/apps/proiect-de-curs-backend/
~/apps/proiect-de-curs-frontend/
```

In the backend directory, create the private environment file:

```bash
cd ~/apps/proiect-de-curs-backend
cp .env.example .env
nano .env
```

Replace each `replace-with-...` value with its own long random secret. `openssl rand -hex 32` produces a 64-character value that is safe in MongoDB URIs and Compose variable substitution. Use different values for both JWT secrets and both MongoDB passwords. Keep `.env` private and out of Git.

Set `FRONTEND_ORIGIN` to the browser-visible origin, with no trailing slash. For example, use `http://localhost:8082` for local testing or the website's HTTPS origin once it has a stable hostname. The value is only a CORS allowlist; the frontend sends API requests to its own origin through Nginx.

## Start the stack

```bash
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 mongodb api frontend
```

On the Ubuntu server, check `http://localhost:8082` (for example, with `curl`). The loopback binding does not allow direct access from another device on your LAN. This uses 8082 to avoid the 8081 port used by the static-site example. If 8082 is occupied too, change the host side of the Compose port mapping and the example URLs. For the Cloudflare Quick Tunnel described in `README-home-website.md`, point it at the server's local port:

```bash
cloudflared tunnel --url http://localhost:8082
```

The frontend and API containers restart automatically. MongoDB is reachable only to containers on this Compose network, and its data persists in the named `mongodb_data` volume. Uploaded images persist separately in `uploads_data`.

The Mongo initialization script creates a `readWrite` account limited to the app database; the root account is reserved for administration. Initialization scripts run only when MongoDB first creates an empty data volume. Editing passwords in `.env` later does not update existing MongoDB users.

## Updates and operation

Pull the latest repository changes, then rebuild and recreate the application containers:

```bash
sudo docker compose up -d --build
sudo docker compose ps
sudo docker compose logs --tail=100 api
```

Stop the stack without deleting its data:

```bash
sudo docker compose down
```

Do not use `docker compose down -v` unless you intend to delete the MongoDB and uploads volumes. A Docker volume is persistent storage, not a backup. Make regular MongoDB backups, keep an encrypted copy off the server, and test restores using an isolated database.

## If you run the API directly on Ubuntu

The `.env.example` `MONGOURI` uses `127.0.0.1` for a host-run API. The Compose deployment intentionally does not publish MongoDB to the host, so for host-run development only, add a loopback-only port mapping under the `mongodb` service in `compose.yaml`, then keep it bound to `127.0.0.1` and never expose port `27017` to the internet. For the regular deployment, use the Compose stack so the API connects to MongoDB by the private service name.

The frontend's `REACT_APP_API_URL` is set to `/api/hf` at image build time. It is public configuration and must never contain secrets.
