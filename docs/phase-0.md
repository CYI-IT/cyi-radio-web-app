# Phase 0 hosting compatibility

**Status as of 24 November 2026** — The proof of concept is available locally. The compatibility decision depends on evidence from the actual Namecheap Stellar Plus account.

Namecheap lists Node.js 22.22 and PostgreSQL 10.23 for Stellar Plus. PostgreSQL 10.23 is the final upstream release of PostgreSQL 10. Ask Namecheap support whether the assigned account can use a newer, supported major version and record the answer with the actual PostgreSQL version. [Namecheap software versions](https://www.namecheap.com/support/knowledgebase/article.aspx/129/22/what-version-of-the-software-is-used-on-your-servers/) · [PostgreSQL 10.23 release announcement](https://www.postgresql.org/about/news/postgresql-151-146-139-1213-1118-and-1023-released-2543/)

## Local verification results

| Check | Result |
|---|---|
| Dependency install and Vite build | Passed using Node.js 22.22.0 and npm 10.9.4. |
| Deploy script | Built and copied files into a temporary app directory. A second deploy preserved a test `.env` and an upload. |
| Express and browser | Served React assets and REST endpoints. Headless Chrome displayed API status and database readiness and acknowledged a WebSocket event. Source, environment and migration URLs returned HTTP 404. A local app restart changed the process ID. |
| PostgreSQL and Drizzle | Passed on PostgreSQL 17.11 using a non-superuser database owner. Readiness changed from HTTP 503 to 200 after migration. The migration reran without changes, CRUD ran successfully, and the journal and CRUD checks passed after dump and restore. |
| Socket.IO | Five concurrent clients stayed connected for 120 seconds in each of WebSocket-only, polling-only and automatic mode. Each test delivered all three events to all clients and reconnected one client automatically. Automatic mode upgraded to WebSocket. |
| Polling fallback | A local proxy blocked WebSocket upgrades. All three clients in automatic mode stayed on polling, received every event and passed the reconnect check. |

## Deploy the probe on Stellar Plus

1. Use a temporary HTTPS hostname on the same Stellar Plus account, such as `phase0.cyiradio.org`, and verify its certificate. Reserve `live.cyiradio.org` for the production application. Use separate private directories for the Git checkout and the application root, outside the domain’s document root.
2. In **Setup Node.js App**, create the app with Node.js **22**, mode **Production**, application root `apps/cyi-radio-phase0`, application URL set to the staging hostname at `/`, and startup file `app.js`. Confirm that the activation command shown by cPanel references `nodevenv/apps/cyi-radio-phase0/22/bin/activate`. If the account uses a different path, configure `CYI_PHASE0_NODE_BIN` for the Git deploy task or update the task to match the path before deployment. Passenger routes HTTP requests to the app’s single listener. [Namecheap Node.js app setup](https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/) · [Passenger port binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html)
3. Create a dedicated PostgreSQL database and login using the account’s PostgreSQL tools, and assign the login to the database. Enter `DATABASE_URL` in the app’s environment variables using the actual cPanel database and login names. Start with the account’s local database connection, typically `127.0.0.1:5432`. Percent-encode reserved characters in the URI password. Let Passenger manage routing and leave `PORT` unset unless the account configuration requires a numeric value. For remote administration, use the host-supported SSH tunnel if needed. [Namecheap SSH tunnelling instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/1249/89/how-to-remotely-connect-to-a-mysql-database-located-on-our-shared-server/)
4. Clone the authorized GitHub repository with **Git Version Control** into a private checkout such as `repositories/cyi-radio-phase0`. Under **Pull or Deploy**, select **Update from Remote**, then **Deploy HEAD Commit**. Record the deployed commit SHA and the Node/npm versions from the deploy output. The script checks a clean production dependency install using the app’s Node 22 binary, then copies the prebuilt frontend and an allowlist of server files to the app directory. It preserves cPanel environment settings and existing uploads. Generate the versioned frontend assets off-host with `npm run build:deploy` before pushing frontend changes. [cPanel manual Git deployment](https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-set-up-deployment/)
5. Click **Run NPM Install** in **Setup Node.js App** to populate the app’s virtual environment. From cPanel Terminal or SSH, run the activation command shown by cPanel, switch to the application root and run `node -v` and `npm ls --omit=dev --depth=0`. Confirm the locked production modules are installed. Restart with **Setup Node.js App** and fetch `/`, a Vite asset referenced by the page, and `/api/v1/health` through HTTPS. Record the running Node version and `bootId`, then restart again in cPanel and confirm a new `bootId`. Requests for `/app.js` and `/package.json` should return HTTP 404.

## Verify PostgreSQL and migrations

In the activated app shell, set `DATABASE_URL` to the dedicated probe database if cPanel’s app variables are absent from the shell. Read it silently to keep credentials out of shell history.

```bash
cd "$HOME/apps/cyi-radio-phase0"
read -rs -p 'Phase 0 DATABASE_URL: ' DATABASE_URL
export DATABASE_URL
printf '\n'
npm run db:status
npm run db:inspect
```

Record the `server_version`, schema creation privileges and migration status. Review the SQL for the observed PostgreSQL version. If the database contains an earlier probe run, take a backup before applying changes. Run migrations from one terminal, then verify the journal and the login’s read/write permissions.

```bash
npm run db:migrate
npm run db:status
npm run db:verify
unset DATABASE_URL
```

The migration creates `phase0_probe_records` with a UUID primary key, a text marker and a timestamp, plus Drizzle’s migration journal. The UUID is assigned in Node.js. The permission check exercises insert, select, update and delete in a transaction and rolls it back. Refresh the React page and check `/api/v1/ready` for HTTP 200. That request verifies database access under the running cPanel app’s environment.

`npm run db:generate -- --name=phase0_probe` generates migration files from the schema during development. For an existing database, generate a private backup with `pg_dump` and restore it into a fresh test database. Use client binaries compatible with the account’s server and replace the example role and database names. Enter the database password when prompted.

```bash
umask 077
pg_dump -h 127.0.0.1 -U phase0_role -W -Fc -f phase0.dump phase0_db
pg_restore -h 127.0.0.1 -U phase0_role -W --exit-on-error --no-owner -d phase0_restore phase0.dump
```

## Verify Socket.IO and resource limits

Run the tests from a machine outside the hosting network with the checkout and its dev dependencies installed. The scripts send UUIDs and report the transports in use, successful deliveries, and interruptions. Replace the sample hostname with the staging origin.

```sh
npm run probe:socket -- https://phase0.cyiradio.org --mode websocket --clients 5 --seconds 120
npm run probe:socket -- https://phase0.cyiradio.org --mode polling --clients 5 --seconds 120
npm run probe:socket -- https://phase0.cyiradio.org --mode auto --clients 5 --seconds 120
```

1. Verify delivery in two browser sessions, ideally on separate networks. Select **WebSocket only** and confirm the upgrade in the browser’s network panel. Then select **Polling only** and confirm test events reach both sessions. Record the active transport for **Automatic**. If WebSocket fails, check whether **Automatic** stays on polling and still delivers to both sessions.
2. Keep the browser sessions connected and restart the app in cPanel. Verify that both sessions reconnect and can exchange test events. Check the process IDs in delivery messages and investigate delivery failures or `Session ID unknown` errors that may indicate multiple workers or missing routing affinity. [Socket.IO adapters and multi-process delivery](https://socket.io/docs/v4/adapter/)
3. Repeat the supported modes with up to ten clients for 15 minutes, subject to the account’s limits. Compare cPanel resource usage and faults before and during the run. Attach connection errors, downtime, delivery counts and any CPU, memory, entry-process or process-count faults to the report. Treat the run as evidence for the tested concurrency and duration. [Namecheap shared-hosting resource restrictions](https://www.namecheap.com/support/knowledgebase/article.aspx/157/22/do-you-have-any-server-resource-restrictions/)

## Account compatibility results

| Capability | Acceptance evidence | Actual Stellar Plus account |
|---|---|---|
| Node.js 22 and dependencies | cPanel exposes Node.js 22. Runtime health output and installed production packages match the deploy. | Node.js 22.23.5 and npm 10.9.9 reported. The second deploy installed development dependencies after the lockfile fix. Production install and runtime checks are pending. |
| Git and Passenger deployment | Manual Git deploy succeeds. Express serves React assets and REST endpoints. Restart changes the process ID. Private files return 404. | Vite failed on the second deploy when Node could not allocate WebAssembly memory. The deploy script now copies frontend assets built off-host. Account retest pending. |
| PostgreSQL | Record exact version, connection method, login privileges and Namecheap’s upgrade answer. Readiness returns HTTP 200. | Pending |
| Drizzle | Generated SQL applies on the actual version. Journal hash matches. Transactional CRUD succeeds using the probe login. | Pending |
| WebSocket | Document forced transport, concurrent delivery, persistence, reconnect and post-restart delivery. | Pending |
| Polling and automatic mode | Record active transport, delivery, persistence and reconnect. Capture browser behavior when upgrade fails. | Pending |
| Shared-hosting resource limits | Record tested client count, duration, resource usage, faults and interruptions. | Pending |

Finalize this report before Phase 1 approval. If both Socket.IO transports are unreliable on the account, evaluate a managed real-time messaging service using the same delivery and reconnect criteria, with PostgreSQL retaining chat history.
