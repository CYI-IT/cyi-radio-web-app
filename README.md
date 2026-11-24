# CYI Radio

CYI Radio runs React and the Express API from one Node.js application, backed by PostgreSQL and Drizzle. See the [project requirements](cyiradio.md), [architecture and ERD](docs/architecture.md), and [Stellar Plus compatibility report](docs/phase-0.md).

## Run locally

Use Node.js 22.12 or newer within the Node.js 22 line. Create an empty PostgreSQL database owned by a dedicated login. Copy `.env.example` to `.env` and set `DATABASE_URL` for that database. PostgreSQL 10.23 is the Stellar Plus compatibility target.

```sh
npm ci
npm run build
npm run db:inspect
npm run db:status
npm run db:migrate
npm run db:verify
npm start
```

Open `http://localhost:3000` for the React page. `GET /api/v1/health` reports the running Node.js version and process identifier. `GET /api/v1/ready` returns HTTP 200 once the database is reachable and the `station_settings` table is queryable. Use `npm run db:verify` to check the full schema and migration history.

## Prepare a cPanel release

Run `npm ci` and `npm run build:deploy` under Node.js 22 on your development machine. Commit the updated `deploy/frontend/` files with the source. The manual Git task checks the locked production dependencies and copies the prebuilt assets to the private application directory.

See the [Phase 1 runbook](docs/phase-1.md) for cPanel configuration, PostgreSQL migration, backup and restore, and verification.
