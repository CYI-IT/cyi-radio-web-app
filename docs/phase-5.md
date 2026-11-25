# Phase 5 public chat

Listeners can open chat, read earlier messages, and join with a display name. A private cookie restores the participant's session across reloads. PostgreSQL stores the token hash, display name, and timestamps. Public message responses contain the display name and message ID. The moderation CLI uses the internal session ID, so listeners sharing a name can be moderated separately.

The public chat starts fresh at midnight in the listener's browser timezone. The message list, earlier pages and timestamps follow that timezone. Open chats clear automatically at midnight and keep the listener's display name. Listeners in different timezones share the same messages and see them according to their own local day. Requests that omit the timezone use the station timezone. Stored messages remain subject to the configured retention period.

The app renders messages as text. The server validates display names and messages, caps messages at 500 Unicode characters, and throttles joins and sends per connection. It also enforces per-session send limits and blocks repeated messages. Retries of the same accepted send reuse its message ID. The chat section stays dormant until a listener opens it and pauses polling while the page is hidden.

## Transport

The HTTP feed fetches 30 messages at a time. Earlier pages use a stable message position. Live updates and reconnect catch-up use a separate revision that includes moderation removals. PostgreSQL serializes writes that advance the revision. With WebSocket enabled, Socket.IO signals connected listeners to fetch changes. Periodic HTTPS polling catches up across application processes and after interrupted connections. [Socket.IO transport options](https://socket.io/docs/v4/server-options/)

| Setting | Behaviour |
| --- | --- |
| `CHAT_TRANSPORT=polling` | HTTPS polling while chat is open and visible. This is the production default. |
| `CHAT_TRANSPORT=socket.io` | WebSocket notifications with HTTPS polling and catch-up. This is the local default. |
| `CHAT_RETENTION_DAYS=30` | Number of days records are kept before the prune command removes them. |

The staging probe passed and the account owner reported very low cPanel resource usage. To verify WebSocket notifications against the deployed chat on Stellar Plus, set `CHAT_TRANSPORT=socket.io` and restart the Node app. Test multiple tabs and a dropped connection, then review cPanel Resource Usage for that deployment test. [Phase 0 hosting compatibility](phase-0.md)

## Verify locally

```sh
npm ci
npm run db:inspect
npm run db:migrate
npm run db:verify
npm run build
npm start
```

Open `http://localhost:3000` and select **Chat**, then **Open chat**. Use a normal and a private browser window to join under separate session cookies, exchange messages, reload a window, and load earlier messages once history has more than 30 entries. To verify the fallback, restart locally with `CHAT_TRANSPORT=polling npm start` and repeat the exchange.

## Moderate and prune

Run the moderation commands from a trusted shell using an existing administrator. Super Admin, Administrator and Chat Moderator receive `chat.moderate` in the migration.

```sh
actor=your-email@example.com
npm run chat:manage -- "$actor" recent
npm run chat:manage -- "$actor" delete MESSAGE_ID
npm run chat:manage -- "$actor" mute SESSION_ID 15 "Repeated spam"
npm run chat:manage -- "$actor" mute SESSION_ID permanent
npm run chat:manage -- "$actor" unmute SESSION_ID
npm run chat:manage -- prune
```

The `recent` command returns the message and session IDs. Deletion hides the message and sends a removal through the update feed. Mute changes take effect before subsequent sends, and all moderation changes are audited. Phase 6 will add the browser-based administrator interface.

Prior days disappear from public history at each listener's local midnight. The `prune` command removes expired database records in batches of up to 1,000 per record type. Run it periodically from the app's private environment to enforce storage retention. It also removes inactive sessions with no remaining messages or moderation records. Active permanent mutes are retained.

## Database changes

`0003_public_chat.sql` adds hashed session tokens, chat positions and revisions, an index for per-session history, and moderation permission grants. Existing messages are backfilled in timestamp order. The migration is applied deliberately through the existing database commands.

## Changed files

- `frontend/listener-chat.jsx`, `frontend/chat-feed.js`, `frontend/main.jsx`, `frontend/styles.css` and `deploy/frontend/` add and package the listener UI.
- `server/chat-*.cjs`, `server/admin-actor.cjs`, `server/schedule-management.cjs`, `server/http.cjs`, `server/config.cjs` and `app.js` implement public chat, moderation, shared permissions and transport setup.
- `server/schema.cjs`, `migrations/`, `scripts/chat.cjs`, `.env.example`, `package.json`, `package-lock.json` and `scripts/deploy-cpanel.sh` configure and deploy the feature.

## Verification results

- PostgreSQL 10.23 passed the migration with pre-existing chat rows and preserved their order. A second migration run and schema verification passed. The migration also applied to the local project database on PostgreSQL 17.11.
- API and CLI tests covered session recovery, per-session and per-connection limits, duplicate sends, pagination, WebSocket notification, reconnection to the same session after restart, mute and unmute, moderator permissions, deletion, and retention.
- Chrome verified that chat stays dormant until opened, then loads earlier messages, restores the display name after reload, shows HTML-like input as literal text, and removes moderated messages in both transport modes.
- On 25 November 2026, the Stellar Plus probe passed with ten WebSocket clients over 15 minutes. All broadcasts reached all clients. The account owner reported very low cPanel resource usage during the probe window. The deployed chat still needs a WebSocket check on Stellar Plus. [Phase 0 compatibility results](phase-0.md#account-compatibility-results)
