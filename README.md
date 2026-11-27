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

The home page shows the live player and programmes that air today in Accra time. The listener schedule at `/schedule` has a weekly lineup and a monthly calendar. See the [Phase 4 runbook](docs/phase-4.md) for the listener page. `GET /api/v1/stream` reports Icecast availability and returns the public audio URL. See the [Phase 2 runbook](docs/phase-2.md) for player verification.

`GET /api/v1/schedule` returns the current programme and upcoming occurrences in the station timezone. Use `?day=today` for today's lineup or `?from=2026-11-01&to=2026-12-01` for a range of up to 31 days, with the end date exclusive. See the [Phase 3 runbook](docs/phase-3.md) for the schedule management CLI and examples.

Listeners can open public chat and post with a display name. See the [Phase 5 runbook](docs/phase-5.md) for transport settings, moderation, and retention.

Administrators sign in at `/admin`. See the [Phase 6 runbook](docs/phase-6.md) for initial Super Admin setup, password recovery, and verification.

## Install and verify the listener app

Open the public home page over HTTPS or on localhost, then use your browser’s **Install** or **Add to Home Screen** option where available. After a successful online visit, the listener page can reopen offline and explains that live audio, the programme schedule, and chat require a connection. The schedule and stream status refresh when the connection returns. [Chrome installability and offline testing](https://developer.chrome.com/docs/devtools/progressive-web-apps)

To verify locally, run `npm run build` and `npm start`. Open the home page in Chrome, then use the **Application** panel to check the manifest and active service worker. Switch offline and reload the listener page. It should show the offline notice without a current programme. Open `/admin` while still offline and confirm it requires a connection. Reconnect and confirm that the listener page fetches the current schedule.

The build creates a versioned cache for the public listener page and its static assets. Schedule, stream, chat, and administration responses always come from the network. When a new worker activates, it removes previous CYI Radio listener caches. The PWA requires no database changes. [Service worker caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)

## Prepare a cPanel release

Run `npm ci` and `npm run build:deploy` under Node.js 22 on your development machine. Commit the updated `deploy/frontend/` files with the source. The manual Git task checks the locked production dependencies and copies the prebuilt assets, manifest, and service worker to the private application directory.

See the [Phase 1 runbook](docs/phase-1.md) for cPanel configuration, PostgreSQL migration, backup and restore, and verification.
