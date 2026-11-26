# Phase 3 programme and scheduling system

The schedule supports dated slots, weekly recurrences, and changes to one occurrence. Programme and presenter records can be created, read, updated and archived. Archive associated schedule series before archiving a referenced programme or presenter. A presenter used only in an exception can also be removed from that exception first.

The public API calculates the schedule in `Africa/Accra`. `GET /api/v1/schedule` returns the station timezone, the effective occurrence on now or `null`, and up to ten future occurrences in start order. Each entry contains its series ID, original occurrence date, effective local start and end timestamps, and public programme and presenter details. Times are station-local strings without an offset. At a shared start or end boundary, the start is inclusive and the end is exclusive. If authorized overlaps leave several programmes on at once, the current entry is the one that started most recently, with ties ordered by series ID and original occurrence date.

Publication and timing changes to published schedules are checked against effective occurrences, including reschedules and overnight durations. Published slots may touch at their endpoints. The check covers open-ended recurrences and serializes management writes, so two simultaneous edits cannot both publish the same time without authorization. Programme, presenter, series and exception writes are audited. An approved overlap records the actor, reason and an example of the conflicting pair.

## Database and permissions

`0002_schedule_permissions.sql` adds permission records and assignments to the existing Phase 1 tables. It grants programme and presenter management to Super Admin, Administrator and Content Manager. It grants schedule management to Super Admin, Administrator and Schedule Manager. Super Admin initially holds the conflict override permission.

Apply the migration explicitly. On a new database the bootstrap command can create the initial Super Admin for attribution. Use the name and email of the person who will operate the CLI. Select an existing authorized administrator if the database has already been provisioned.

```sh
npm run db:inspect
npm run db:migrate
npm run db:verify
npm run schedule:manage -- bootstrap your-email@example.com "Your Name"
```

The CLI is for a trusted operator with shell and database access. The administrator email selects the account whose permission grants and ID are used for each operation. To set a browser password for the account created with this CLI, run `npm run admin:manage -- recover your-email@example.com`. [Browser administration](phase-6.md)

## Create and verify a schedule locally

Use the email from bootstrap and replace the example date with the desired next Friday. Save the IDs printed when creating the programme, presenters and series, then substitute them for the shell variables in the examples.

```sh
actor=your-email@example.com
npm run schedule:manage -- "$actor" programmes create '{"slug":"evening-show","title":"Evening Show"}'
npm run schedule:manage -- "$actor" presenters create '{"slug":"main-host","name":"Main Host"}'
npm run schedule:manage -- "$actor" presenters create '{"slug":"guest-host","name":"Guest Host"}'
npm run schedule:manage -- "$actor" series create @weekly-slot.json
npm run schedule:manage -- "$actor" series get "$series_id"
```

Save the following in `weekly-slot.json` with the programme and presenter IDs from the CLI.

```json
{
  "programmeId": "PROGRAMME_UUID",
  "presenterId": "PRESENTER_UUID",
  "kind": "weekly",
  "publicationStatus": "published",
  "startsOn": "2026-11-27",
  "weekdays": [5],
  "startTime": "23:30",
  "endTime": "01:00"
}
```

Use weekdays 1 through 7 for Monday through Sunday. Weekly series can have an inclusive `endsOn` date. Omit weekdays and the end date for `kind: "one-time"`. An end time at or before the start time rolls into the following day. Alternatively, provide a positive whole number of `durationMinutes`. New series default to draft.

```sh
npm run schedule:manage -- "$actor" exceptions set "$series_id" 2026-11-27 '{"action":"cancel"}'
npm run schedule:manage -- "$actor" exceptions set "$series_id" 2026-11-27 @rescheduled-slot.json
npm run schedule:manage -- "$actor" exceptions remove "$series_id" 2026-11-27
```

For `rescheduled-slot.json`, use an `override` such as the following. Omitted fields inherit from the series. Setting a new exception replaces the previous exception for that occurrence. Removing it restores the regular occurrence, which is checked for conflicts before it can take effect.

```json
{
  "action": "override",
  "startsOn": "2026-11-28",
  "startTime": "20:00",
  "endTime": "21:30",
  "presenterId": "GUEST_PRESENTER_UUID"
}
```

Try publishing an overlapping slot to confirm the CLI refuses it. An administrator with `schedule.override` can pass an `overrideReason` in the change JSON. Run `npm run schedule:manage -- --help` for the full command list. Start the app with `npm start` and request `http://localhost:3000/api/v1/schedule` to verify the effective schedule.

## Changed files

- `server/occurrences.cjs` calculates effective occurrences and overlaps. `server/schedule-input.cjs` validates management input.
- `server/schedule-data.cjs` and `server/http.cjs` serve the public schedule. `server/schedule-management.cjs` implements permission checks, CRUD and auditing.
- `scripts/schedule.cjs`, `package.json` and `scripts/deploy-cpanel.sh` provide and package the CLI.
- `scripts/build-frontend.mjs` keeps Vite builds in production mode when the server's local `.env` selects development.
- `migrations/0002_schedule_permissions.sql` and its Drizzle metadata seed permissions. `test/occurrences.test.cjs` covers the calendar calculations.

## Verification results

- The Node.js 22 tests covered overnight boundaries, gaps, moved and cancelled occurrences, and conflicts involving distant and open-ended recurrences.
- A fresh PostgreSQL 10.23 database passed all three migrations, a repeat migration run, and schema verification. Integration checks covered CLI CRUD, role enforcement, audit records, exception edits, concurrent conflict checks and the public HTTP response.
- The local project database on PostgreSQL 17.11 was upgraded from Phase 1. The migration journal and application tables passed verification.
