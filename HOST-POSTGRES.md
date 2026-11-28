# Standalone PostgreSQL on the home server

Friendo can use the Ubuntu host's PostgreSQL instead of starting its own database
container. The frontend/API still run in Docker. The existing Compose file remains
available for the old deployment and rollback.

The coordinated setup, credentials, backup, and development-device instructions
are in [Toggle Ctrl's home server guide](https://github.com/saneag/toggle-ctrl/blob/main/deploy/HOME-SERVER.md).
The one-time setup script lives in that repository as `scripts/setup-home-postgres.py`.
It migrates existing PostgreSQL data rather than importing the historical MongoDB
backups again.
For a blank server, use [the beginner installation/recovery guide](https://github.com/saneag/toggle-ctrl/blob/main/deploy/SETUP-FROM-ZERO.md)
and [daily command cheatsheet](https://github.com/saneag/toggle-ctrl/blob/main/deploy/COMMANDS-CHEATSHEET.md).

## Server configuration

After the databases have been created and the existing data migrated, set these
values in the server backend `.env`, preserving JWT secrets and the public origin:

```dotenv
COMPOSE_FILE=compose.host-postgres.yaml
DATABASE_URL=postgresql://friendo_prod:YOUR_PASSWORD@host.docker.internal:5432/friendo-prod
FRONTEND_PORT=5000
BACKEND_PORT=5001
```

The external `home-apps` Docker network must exist and PostgreSQL must permit its
subnet for this database/role. `host.docker.internal` is mapped to the Docker host
by the host deployment file. Keep the Compose project name unchanged so the
images are read from `/srv/hdd/project-images/friendo` (`UPLOADS_HOST_DIR`); copy any old `uploads_data` volume content there first. Do not publish PostgreSQL from Docker.
Use the matching frontend release: its Nginx proxy resolves `friendo-api`, the
unique backend network alias, to avoid collisions with Toggle Ctrl's `api` service.

Docker Compose reads `COMPOSE_FILE` from `.env`, so the existing `~/bin/start-friendo`
launcher selects the host deployment automatically. Its port-selection and tunnel
behavior remain the same. Run Compose commands from the backend checkout:

```bash
sudo docker compose config --quiet
~/bin/start-friendo
```

The launcher first pulls both repositories with `git pull --ff-only`, then
rebuilds migration/API/frontend images before stopping the running app. Compose
then applies committed migrations before starting the updated API. Tracked local
changes or a failed pull/build leave the existing app and tunnel running.

## Development devices

Use the private `friendo-dev` URL from
`/home/alex/.config/home-apps/databases.json` as `DATABASE_URL` in each development
device's backend `.env`. Its host is `192.168.0.16`, port `5432`, database
`friendo-dev`, and role `friendo_dev`. Keep the device's other local settings.

```bash
npm ci
npm run prisma:generate
npm run db:migrate
npm start
```

All development devices share the same development data. They do not write to
the deployed app's `friendo-prod` database. Development image files still live
where each development API stores uploads; sharing PostgreSQL does not share
those files. To see production images with copied development records, configure
a separate development uploads copy or use the deployed API for inspection.

## Backups and rollback

The old Docker PostgreSQL container is intentionally retained during migration.
The new host Compose file may report it as an orphan; do not remove it until the
migration has been verified. Its volume is a rollback source, not the active
database. Stop it after verification, without deleting its volume.

Back up the host `friendo-prod` database and existing Docker uploads volume
together. The one-time setup saves a final database dump, uploads archive, and the
old `.env` under `/var/backups/home-apps/`. See the shared guide before rollback:
the old Docker database does not contain any writes made after cutover.
