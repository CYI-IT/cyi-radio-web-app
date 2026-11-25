# Phase 2 radio player

The React player connects directly to the configured Icecast mount when a listener presses **Play**. **Stop** releases the audio connection, and **Mute** toggles the player audio. Playback messages report connecting, buffering, or playback failures, with a retry control after an error.

`GET /api/v1/stream` returns `streamUrl` and `status`. The status is `online` when Icecast lists the configured mount, `offline` when the statistics are available and the mount is absent, and `unknown` when the server cannot confirm the mount status. This check uses Icecast only. Its result is independent of the programme schedule and of playback on a specific device.

The backend uses Icecast’s JSON statistics endpoint. For a configured URL ending in `/status.xsl`, it requests the companion `/status-json.xsl` on the same origin. You can also configure the JSON URL directly. Express shares simultaneous checks and caches the result for 15 seconds per process. The browser refreshes station status every 30 seconds while the page is visible. The browser fetches audio directly over HTTPS in production, so audio traffic goes to Icecast. [Icecast server statistics](https://www.icecast.org/docs/icecast-latest/server_stats/)

## Changed files

- `frontend/main.jsx`, `frontend/radio-player.jsx`, and `frontend/styles.css` contain the listener controls and status display.
- `server/http.cjs` exposes the status endpoint and permits media from the configured stream origin. `server/stream.cjs` checks the Icecast mount.
- `deploy/frontend/` contains the rebuilt cPanel assets. `README.md` links to this runbook.

Phase 2 requires zero database migrations.

## Verify locally

Use Node.js 22 and run the following commands. The player and stream endpoint work without PostgreSQL.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3000` and check `http://localhost:3000/api/v1/stream`. The response should identify `https://radio.cyiradio.com/live` with the default configuration. With a source connected to `/live`, verify that the page shows **Stream online**, audio starts after **Play**, and **Mute** and **Stop** work. When Icecast reports no source for `/live`, verify **Stream offline**. A connection failure during playback should offer **Try again**.

## Verification results

- Node.js 22.22.0 built the local frontend and cPanel assets. Tests covered matching the exact mount across single and multiple sources, an absent mount, malformed statistics, upstream errors, and timeouts. Ten simultaneous API requests shared one upstream check.
- Headless Chrome decoded audio from a local fixture on a separate origin. It verified manual start, mute and unmute, stop, replay, a failed connection, and recovery with **Try again**.
- On 25 November 2026, the public statistics endpoint responded successfully and listed no `/live` source. The public mount returned HTTP 404. Playback against the public mount can be verified once the station connects a source.
