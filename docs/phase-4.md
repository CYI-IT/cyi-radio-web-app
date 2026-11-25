# Phase 4 public listener page

The home page combines the Icecast player with the published programme schedule. **Scheduled now** shows the effective occurrence from `GET /api/v1/schedule`, including a replacement presenter when one is assigned. **Coming up** groups up to ten occurrences by their effective start date. Times are shown in station-local time. For an overnight broadcast, the end time shows the following date.

The player displays Icecast availability independently of the schedule. If there is a gap, the page shows **No programme scheduled right now.** An empty upcoming list gets its own message. If the schedule request fails, listeners can retry and continue using the player. The page refreshes both feeds every 30 seconds while visible and on return to the tab.

## Verify locally

Run `npm run build` and `npm start` with the existing local database configured. Open `http://localhost:3000`. Use the **Schedule** link to jump to the programme list. Compare a published slot with `http://localhost:3000/api/v1/schedule`. For a programme that crosses midnight, check that its end time shows the next date and that the displayed hours stay in Accra time when you change the browser's timezone.

Use the Phase 3 CLI to publish, cancel or move an occurrence, then watch the changed schedule on the listener page. [Phase 3 runbook](phase-3.md)

## Changed files

- `frontend/main.jsx` and `frontend/styles.css` provide the listener layout and navigation.
- `frontend/listener-schedule.jsx` renders the current and upcoming schedule, including loading, empty and error states.
- `frontend/public-feed.js` shares the polling and retry logic with `frontend/radio-player.jsx`.
- `frontend/studio-microphone.jpg` contains the illustrative studio photograph. `deploy/frontend/` contains the rebuilt cPanel assets. `README.md` links to this runbook.

The phase uses the existing schedule API and requires zero database migrations.

## Verification results

- Node.js 22 built the local and cPanel assets. All six existing schedule tests passed.
- The local PostgreSQL API returned ten published occurrences. Chrome rendered the page at desktop and phone widths with the browser set to Los Angeles and kept the broadcast times in Accra.
- Browser fixtures verified overnight end dates, replacement presenters, loading and empty states, retry after a schedule failure, and retained audio playback while the schedule recovered.

## Studio artwork

The built-in image generation tool produced `frontend/studio-microphone.jpg`. Its prompt was:

> Create an editorial photograph to use beside the player on a radio station website. Landscape 3:2 composition, an authentic unbranded dynamic broadcast microphone on an articulated boom arm as the clear focal point near the center, with the soft-focus slider desk of a small recording studio behind it. Charcoal and deep forest green surroundings, restrained muted amber indicator lights, softly diffused daylight from the side, believable metal grille texture, natural optical depth of field. No people, no writing, no on-air sign, no visible text or logos. Fill the frame with the photograph, without design overlays or borders.
