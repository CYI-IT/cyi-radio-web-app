# CYI Radio Phase 0

This proof of concept checks whether Namecheap Stellar Plus can run the stack specified in [cyiradio.md](cyiradio.md). See the [cPanel runbook and compatibility report](docs/phase-0.md) and the [proposed architecture, ERD and implementation plan](docs/architecture.md).

## Run locally

Use Node.js 22.12 or newer within the Node.js 22 line to match the hosting target. Create an empty PostgreSQL database and use a role that can create a schema and tables in it. Copy `.env.example` to `.env` and set its `DATABASE_URL` for that database.

```sh
npm ci
npm run build
npm run db:inspect
node --env-file=.env scripts/db.cjs status
node --env-file=.env scripts/db.cjs migrate
node --env-file=.env scripts/db.cjs verify
node --env-file=.env app.js
```

Open `http://localhost:3000`. The React page checks the Express API and PostgreSQL and lets you test Socket.IO delivery from two browser tabs. For a repeatable run, test each transport mode from another terminal.

```sh
npm run probe:socket -- http://localhost:3000 --mode websocket
npm run probe:socket -- http://localhost:3000 --mode polling
npm run probe:socket -- http://localhost:3000 --mode auto
```

`GET /api/v1/health` reports the running Node version and a process identifier. `GET /api/v1/ready` returns HTTP 200 after a Drizzle query succeeds against the probe table, or HTTP 503 while the database is unavailable or the migration is pending.

## Prepare a cPanel release

After changing the frontend or its dependencies, run `npm ci` and `npm run build:deploy` on your development machine. Commit the updated `deploy/frontend/` files with the source changes. The cPanel Git task uses those assets and checks the locked production dependencies.
