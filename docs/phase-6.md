# Phase 6 administration

Open `/admin` to sign in or manage the station. The overview shows the current and next scheduled programmes. The management areas cover programmes and presenters, one-time and weekly schedules, changes to individual occurrences, chat messages and session mutes, administrator accounts, the audit log, and the listener page introduction.

## Set up local access

Use Node.js 22 and a local PostgreSQL database. Set `DATABASE_URL` in `.env`, set `PUBLIC_APP_URL` to the origin you will open in your browser, and set `SESSION_SECRET` to the output of `openssl rand -hex 32`.

```sh
npm run db:inspect
npm run db:migrate
npm run db:verify
npm run build
npm start
```

From a trusted terminal with the same configuration, create the initial Super Admin on an empty database.

```sh
npm run admin:manage -- bootstrap admin@example.com "Station Admin"
```

If the schedule CLI already created the Super Admin, or if the Super Admin loses access, issue a link for the existing active account.

```sh
npm run admin:manage -- recover admin@example.com
```

Open the link printed by the command, set a password, and sign in at `/admin`. The command works with the same deployed environment as the app, so the link uses the configured origin and token secret. An administrator can request a new link from a Super Admin. A Super Admin can issue a link from **Administrators** and send it through a private channel. A link expires in 30 minutes, can be used once, and replaces any earlier link for the same account. Resetting the password signs out the account on all devices.

## Roles and access

| Role | Initial access |
| --- | --- |
| Super Admin | All areas, account management and role assignment, and schedule conflict overrides with a recorded reason |
| Administrator | Programmes, presenters, schedules, chat moderation, audit log and station settings |
| Schedule Manager | Schedules and occurrence exceptions, with read access to programmes and presenters |
| Content Manager | Programme and presenter management |
| Chat Moderator | Chat moderation |

Accounts can hold multiple roles. Deactivation ends every session and invalidates the account's outstanding password link. The system keeps at least one active Super Admin. Permissions are checked on the server, including when existing schedule and chat operations are called from the dashboard. Those operations retain their trusted CLI entry points.

Sessions expire after eight hours and use an HTTP-only, SameSite=Strict cookie with the Secure attribute in production. Login attempts are limited in PostgreSQL across application processes. Password hashing uses Node's asynchronous scrypt with the 32 MiB work factor. Password links and session tokens are stored as keyed digests, and password links keep the token in the browser URL fragment. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) · [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

## Database and release

`0004_administration.sql` adds `admin_sessions`, `admin_password_links`, and `admin_auth_limits`, along with a chronological audit index and account, audit, and station-settings permissions. Existing administrator IDs, role grants, and audit records are retained. Apply the migration deliberately using the Phase 1 backup and review steps. [Database operations](phase-1.md#run-and-verify-migrations)

Build release assets off-host with `npm run build:deploy`. The cPanel Git task copies both compiled frontend entry pages, the migrations and the administrator CLI into the private app directory. [cPanel deployment](phase-1.md#configure-the-cpanel-application)

## Verify the phase

- Sign in as Super Admin and create a Chat Moderator. Redeem the link in a private browser window, sign in, and verify that the user can open chat moderation. Reopen the used link and confirm that it is rejected.
- Change that account's role to Content Manager. Refresh the moderator's window and verify that programme and presenter management are now available. Deactivate the account and check that its existing session ends.
- Create a programme and presenter, publish a weekly slot, cancel one occurrence, and restore it. Open **Audit log** and confirm the changes have the correct actor.
- Join chat as a listener, post a message, and use **Chat moderation** to delete it and mute and unmute the session. Check that the listener sees the expected behavior.
- Update the listener introduction in **Station settings** and open the public page to see it above the play button.

## Verification results

- Node.js 22 built the local and cPanel frontend assets and passed all nine existing tests.
- An isolated PostgreSQL 17.11 instance passed fresh and upgrade migrations, repeat migration and verification of all 17 application tables. The upgrade preserved an existing Super Admin and its credential record.
- HTTP and Chrome checks covered initial setup and recovery, one-time link replacement and reuse, login throttling, seven accounts, permission changes, session revocation, audit pagination, overnight weekly scheduling and exceptions, chat moderation, and the public introduction. The admin interface was checked at desktop and mobile widths.
- PostgreSQL 10.23 and the cPanel production environment still need release verification.

## Changed files

- `admin.html`, `frontend/admin/` and `frontend/main.jsx` provide the administration interface and display the station introduction on the listener page.
- `server/admin-*.cjs`, `server/http.cjs`, `server/schedule-management.cjs` and `server/chat-moderation.cjs` implement browser authentication, permission checks, management endpoints and auditing.
- `server/schema.cjs` and `migrations/0004_administration.sql` with its Drizzle metadata define the database changes.
- `scripts/admin.cjs`, `package.json`, `scripts/build-frontend.mjs`, `scripts/deploy-cpanel.sh` and `deploy/frontend/` provide setup and package the release.
