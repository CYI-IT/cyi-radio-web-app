# Phase 1 project foundation

CYI Radio serves the React entry page and the Express API from the same Node.js application. PostgreSQL access uses a two-connection pool. The application reads cPanel environment variables at startup and serves the built HTML and assets from `dist/`.

## Files changed

| Area | Files |
| --- | --- |
| Application | `app.js`, `server/config.cjs`, `server/http.cjs`, `server/database.cjs`, `.env.example` |
| Frontend | `index.html`, `frontend/main.jsx`, `frontend/styles.css`, `deploy/frontend/` |
| Database | `server/schema.cjs`, `migrations/`, `scripts/db.cjs` |
| Package and deploy | `package.json`, `package-lock.json`, `scripts/deploy-cpanel.sh` |
| Probe and documentation | `probes/phase-0/`, `README.md`, `docs/architecture.md`, `docs/phase-0.md`, `docs/phase-1.md` |

## Database changes

- `0000_initial_schema.sql` creates 14 tables for administrator accounts and roles, presenters, programmes, schedules and exceptions, chat sessions and moderation, station settings, and the audit log. Its SQL works on PostgreSQL 10.23. Drizzle generates UUIDs in Node.js.
- `0001_initial_roles.sql` inserts the five initial roles. Phase 6 will configure permission grants, implement role assignment and administrator authentication, and provide the one-time Super Admin setup.
- The application database is separate from the Phase 0 probe database. The migration command acquires a PostgreSQL advisory lock and checks the journal before applying SQL. It refuses an incompatible migration history or a database containing the Phase 0 probe table.

## Verify locally

Follow the [local setup](../README.md#run-locally). Before applying migrations to a fresh database, `npm run db:status` should report both files as pending, `/api/v1/health` should return HTTP 200, and `/api/v1/ready` should return HTTP 503. Apply the migrations and rerun `db:status` and `db:verify`. Both entries should be applied with zero unexpected entries, and readiness should return HTTP 200. The verification command checks all application tables and exercises Drizzle CRUD in a rolled-back transaction.

```sh
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/v1/health
curl -i http://localhost:3000/api/v1/ready
curl -i http://localhost:3000/app.js
```

The root should load the React page and its versioned assets. Private files and unknown API paths should return HTTP 404.

### Local verification results

- Node.js 22.22.0 installed the locked dependencies and built both the local frontend and the cPanel assets.
- Both migrations applied on PostgreSQL 10.23 as a non-superuser database owner. A second run left two matching journal entries. Tests covered the migration lock, rejection of the Phase 0 database and journal mismatches, the five role records, transactional CRUD, and schedule and moderation constraints. A dump of `public` and `drizzle` restored successfully into a fresh database. [PostgreSQL 10.23 source archive](https://www.postgresql.org/ftp/source/v10.23/)
- Two local cPanel deployment rehearsals preserved a test environment file and upload. Headless Chrome rendered the staged React build. Express served versioned assets, returned HTTP 404 for private files and issued a new health `bootId` after restart. Readiness returned HTTP 503 before migration and during a database outage, and HTTP 200 after migration with the database available.

## Configure the cPanel application

The repository is already configured with the CYI-IT GitHub remote. Keep the Phase 0 app on its historical commit. For the application, clone the repository through cPanel Git Version Control into a private directory. In **Setup Node.js App**, select Node.js **22**, mode **Production**, application root `apps/cyi-radio`, domain `live.cyiradio.com` at `/`, and startup file `app.js`. Configure the domain certificate and HTTPS redirect in cPanel.

| Environment variable | cPanel value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Omit for the validated Passenger setup. Set a numeric port only if the hosting configuration requires one. |
| `DATABASE_URL` | Connection URL for the dedicated application database and login. Percent-encode reserved characters in the password. |
| `SESSION_SECRET` | Generate a random secret, for example with `openssl rand -hex 32`. Save it in the app's environment settings. |
| `PUBLIC_APP_URL` | `https://live.cyiradio.com` |
| `ICECAST_STREAM_URL` | `https://radio.cyiradio.com/live` |
| `ICECAST_STATUS_URL` | `https://radio.cyiradio.com/status.xsl` |
| `STATION_TIMEZONE` | `Africa/Accra` |

Build assets off-host with `npm run build:deploy`. Phase 0 found that the account's resource limit prevented Vite from building on-host. In cPanel Git Version Control, choose **Update from Remote**, then **Deploy HEAD Commit**. The task validates the production lockfile and copies application files and the prebuilt assets. It preserves the configured environment and any uploads. If the app root or Node selector directory differs from the defaults, set `CYI_APP_ROOT` or `CYI_NODE_BIN` in the Git deployment task environment.

Select **Run NPM Install** in **Setup Node.js App** for a new app or after changes to the production dependencies. Apply reviewed migrations explicitly, then click **Restart**. Check the HTTPS page, a JavaScript asset, and both API endpoints. Verify HTTP redirects to HTTPS and compare the `bootId` from two health checks taken before and after a restart. The production app sets HTTPS security headers. cPanel handles the certificate and redirect.

## Run and verify migrations

Generate SQL after a Drizzle schema change with `npm run db:generate -- --name=change_name`. Inspect the SQL with `npm run db:inspect`, review it for PostgreSQL 10 compatibility and test it against PostgreSQL 10.23. Back up the target database before a production migration. On cPanel, run the following commands from Terminal using the environment saved in the Node.js selector.

```sh
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:status
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:inspect
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:migrate
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:verify
```

The selector encodes its `output` field in base64. Check the migration status again and confirm readiness over HTTPS after restart.

## Back up and restore

Use PostgreSQL client tools compatible with the server version. Substitute the actual database and login names and enter the password at the prompt. Back up both application schemas. This includes the Drizzle migration journal and avoids restoring metadata owned by the hosting provider. Store the dump in a private directory and verify restoration into a separate empty database owned by the restore login.

```sh
umask 077
pg_dump -h 127.0.0.1 -U cyi_radio_role -W --schema=public --schema=drizzle -Fc -f cyi-radio-pre-migration.dump cyi_radio
pg_restore -h 127.0.0.1 -U cyi_restore_role -W --single-transaction --no-owner -d cyi_radio_restore cyi-radio-pre-migration.dump
```

For the initial migration on a fresh database, select only the `public` schema because the Drizzle journal is created by that first migration. After restoring a migrated backup, point `DATABASE_URL` at the restored database and run `npm run db:status` and `npm run db:verify`.
