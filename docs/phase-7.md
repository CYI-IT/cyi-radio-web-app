# Phase 7 production deployment

Deploy `main` from the CYI-IT GitHub repository through Namecheap cPanel. The release includes the listener schedule and calendar, administration, and the installable listener app. Phase 7 uses the five existing migrations through `0004_administration`; it adds no schema changes. [GitHub release commit](https://github.com/CYI-IT/cyi-radio-web-app/commit/27ac236)

## Preflight results

- Node.js 22 passed all 13 automated tests. Two local rehearsals of the cPanel Git task with Node.js 22 and npm 10 copied the release files and preserved the application environment file and a sample upload.
- PostgreSQL 10.23 passed a fresh install, an upgrade from `0003_public_chat`, and a repeat migration. The upgrade retained the existing Super Admin and role. The pre-upgrade backup restored into a separate database and passed schema verification. The upgraded database passed verification of all 17 tables.
- Both authoritative Namecheap nameservers and the Cloudflare and Google public resolvers returned `162.0.232.33` for `live.cyiradio.com` on 27 November 2026. After SSL was enabled, the certificate validated for the hostname and HTTP returned a 301 redirect to HTTPS. LiteSpeed returned 404 for `/api/v1/health` before the application was deployed.
- On production PostgreSQL 10.23, all five migrations applied with zero unexpected entries. `db:verify` confirmed all 17 application tables and Drizzle writes and left no test row. The live readiness endpoint and today’s schedule both returned HTTP 200. The pre-restart boot ID was `7fdb1861-eaa3-48ba-a6f2-37bad09a7d4b`.
- The manual restart changed the boot ID to `6f4eff79-ad6d-4cbf-aca4-765fad35836c`. Health, readiness, both schedule queries, the chat session endpoint, the listener and admin pages, and the PWA assets returned HTTP 200. The anonymous admin session request returned 401, and requests for `app.js` and `package.json` returned 404.
- The account owner confirmed Super Admin sign-in, programme publishing, chat delivery between two browser sessions, and moderation. When Icecast came online, the stream API reported `online` and the public mount delivered `audio/mpeg` data over HTTPS. The account owner confirmed audible playback, the offline schedule reload, and schedule recovery after reconnecting. Phase 7 production verification passed.

## Set up the production hostname

1. In cPanel **Domains**, confirm `live.cyiradio.com` exists as a separate subdomain. If it is missing, select **Create a New Domain**, enter `live.cyiradio.com`, and clear **Share document root**. Keep the Git checkout and Node.js application directory outside the subdomain’s document root. [Namecheap subdomain setup](https://www.namecheap.com/support/knowledgebase/article.aspx/9190/29/how-to-create-a-subdomain-in-cpanel/)
2. In **Zone Editor**, check that `live.cyiradio.com` resolves to the hosting address shown in cPanel. Creating the subdomain can create the record. If it is absent, add the A record using the account’s shared IP. Both authoritative Namecheap nameservers returned `NXDOMAIN` for `live.cyiradio.com` during the preflight on 27 November 2026.
3. Once DNS resolves, install or verify the certificate for `live.cyiradio.com` using **Namecheap SSL** or the certificate tool configured for this account. Enable the HTTPS redirect for this hostname and leave the Phase 0 and Icecast hostnames in place. [Namecheap SSL](https://www.namecheap.com/support/knowledgebase/article.aspx/9387/2218/what-is-namecheap-ssl-and-how-do-i-use-it/)

```sh
dig @dns1.namecheaphosting.com live.cyiradio.com A +short
curl -I http://live.cyiradio.com/
```

The DNS lookup should show the hosting address, and HTTP should redirect to `https://live.cyiradio.com/`. The HTTPS app checks follow after deployment.

## Deploy the GitHub release

1. In **Setup Node.js App**, create or verify the Node.js **22** application. Use **Production**, root `apps/cyi-radio`, URL `live.cyiradio.com` at `/`, and startup file `app.js`. In the app’s environment settings, use a dedicated PostgreSQL database and login, a generated `SESSION_SECRET`, `PUBLIC_APP_URL=https://live.cyiradio.com`, and `STATION_TIMEZONE=Africa/Accra`. Set the Icecast URLs to the existing `/live` mount and `/status.xsl` endpoint. Use `CHAT_TRANSPORT=polling` for the initial cutover. Follow the Phase 1 environment table for the complete variables and Passenger port behavior. [Environment settings](phase-1.md#configure-the-cpanel-application) · [Namecheap Node.js app setup](https://www.namecheap.com/support/knowledgebase/article.aspx/10047/2182/how-to-work-with-nodejs-app/)
2. In **Git Version Control**, create or open the private checkout of `CYI-IT/cyi-radio-web-app` on `main`. Use **Update from Remote**, confirm the release commit, then select **Deploy HEAD Commit**. The task validates the production dependencies and copies the server and prebuilt frontend. Phase 0 established that the Vite build needs to run off-host on this account. [Namecheap Git Version Control](https://www.namecheap.com/support/knowledgebase/article.aspx/10113/2210/how-to-use-git-version-control-cpanel-plugin/) · [Phase 0 results](phase-0.md#account-compatibility-results)
3. In **Setup Node.js App**, run **Run NPM Install** on a new app or after changes to the production dependencies. Record the Git commit and save the deploy output.

The Node.js Selector may flag an availability check when the homepage changes from its `text/plain` placeholder to the deployed `text/html` page. During this cutover, `/api/v1/health` returned HTTP 200 on Node.js 22.23.5 and both listener routes served the release HTML after that warning. Verify the live response before retrying the install. Readiness still needs to pass after the database checks.

## Verify and apply pending migrations

Run the following in cPanel Terminal so the commands use the app’s saved environment. The selector encodes command output in base64. Review the decoded `db:status` and `db:inspect` output.

```sh
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:status
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:inspect
```

Confirm the intended application database, PostgreSQL version, and migration journal. A fresh application database should show all five migrations pending. On an existing database, confirm that applied entries match and there are zero unexpected entries. If migrations are pending, take a private backup, verify the backup in a separate database, then approve and run the migration. Use the Phase 1 backup and restore commands. [Backup and restore](phase-1.md#back-up-and-restore)

```sh
# Run db:migrate only for reviewed and approved pending migrations.
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:migrate
cloudlinux-selector run-script --json --interpreter nodejs --app-root apps/cyi-radio --script-name db:verify
```

After migration, rerun `db:status`. Expect five applied migrations, zero unexpected entries, and verification of all 17 application tables. The verification command rolls back its test writes. Follow the Phase 6 setup if the production database needs its first Super Admin or an existing Super Admin needs a recovery link. Keep any setup link private. [Administrator setup](phase-6.md#set-up-local-access)

For a fresh production database, use the Selector to pass the administrator details to the CLI while retaining the app’s cPanel environment. Replace the example email and display name. Decode the `data` field privately to retrieve the one-time link. [CloudLinux script arguments](https://docs.cloudlinux.com/cloudlinuxos/command-line_tools/)

```sh
cloudlinux-selector run-script --json --interpreter nodejs \
  --app-root apps/cyi-radio --script-name admin:manage -- \
  bootstrap 'admin@example.com' 'Station Admin'
```

## Restart and check the release

If the application is already serving traffic, record `/api/v1/health` before restarting. Select **Restart** in **Setup Node.js App**, then run the checks from outside cPanel.

```sh
base=https://live.cyiradio.com
curl -fsS "$base/api/v1/health"
curl -fsS "$base/api/v1/ready"
curl -fsS "$base/api/v1/stream"
curl -fsS "$base/api/v1/schedule?day=today"
curl -fsS -I "$base/schedule"
curl -fsS -I "$base/admin"
curl -fsS -I "$base/manifest.webmanifest"
curl -fsS -I "$base/sw.js"
```

- Health should report Node.js 22 and a fresh `bootId` after restart. Readiness should return `{"status":"ready"}`. Verify `app.js` and `package.json` return 404 over HTTPS.
- Open `/` and `/schedule` on desktop and mobile. Verify the homepage lists today’s shows in Accra and the weekly lineup and monthly calendar can browse other days. Test the playback controls while the existing Icecast mount is broadcasting.
- Open chat in two browser sessions and verify delivery. Check moderation and an authorized admin sign-in. Use the Phase 6 verification steps for permissions and audit records. [Administration checks](phase-6.md#verify-the-phase)
- Check installability in Chrome and reload `/schedule` offline after the service worker activates. Reconnect and confirm the schedule reloads. Check the app logs and cPanel **Resource Usage** after the smoke test.

Record the deployed commit, database version and migration status, restart `bootId`, HTTPS result, and browser test results. If a check fails, use the cPanel deployment output and Node.js app logs to identify the failure before rerunning the affected step. If a release needs to be reverted, redeploy the previous known-good application revision only after checking it against the current schema. Restore any database backup into a separate database to verify it before considering a production recovery.
