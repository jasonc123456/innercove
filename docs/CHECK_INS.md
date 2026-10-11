# Daily leaves and tree growth — backend/UI handoff

## Findings and data preservation

At the inspected main checkout, `DashboardPage` kept `Mood[]` in React state and
appended on every tap. There was no check-in request, storage key, timestamp,
check-in repository or database table. Repeated taps inflated session count;
reload/remount discarded it. `SPOTS` had **ten** positions and the renderer used
`slice(-SPOTS.length)`, so the displayed canopy stopped despite a growing count.
This inspection did not access GX10/private live data. There is no persisted
legacy daily-check-in dataset in that implementation to migrate. Undated session
moods cannot be assigned to calendar days without inventing history. Diary mood
and `feeling:*` entries are separate and are neither deleted nor converted into
check-in days.

Migration `0002_daily_check_ins` adds encrypted daily snapshots (primary key
`user_id,day`), append-only mood events (scoped unique retry ID, ordered sequence)
and per-user acknowledged tree stage. The repository folds historical repeated
events into one latest-color snapshot per day without deleting any mood history.
Old event rows never inflate progress. The first use of preexisting history
adopts its current stage, rather than replaying old thresholds; a newly crossed
threshold remains pending until Continue is successfully persisted.

## Calendar and API contract

Days follow Settings' selected IANA zone, or the device's resolved zone when
Automatic is selected (`web/src/timeZone.ts`). Every API call supplies that zone;
there is no default UTC date on the server. The server derives `YYYY-MM-DD` from
its own clock in that zone, never a client timestamp/day. The date and capture
zone on existing events are immutable. Changing Settings/travelling can change
which **current calendar date** applies, but never rebuckets previous history.
Settings remains browser-specific as in A's existing handoff; clients using
different zones should choose the same zone if they expect identical day labels.
Daylight-saving repeated/skipped hours don't create extra leaves. Focus/visible
refresh and a 60-second visible-tab poll update the current day across midnight.

- `GET /api/check-ins?timeZone=<IANA zone>` returns all daily leaves, server-derived
  `today`, `stage`, `acknowledgedStage`, and nullable `pendingStage`.
- `POST /api/check-ins`: `{eventId: UUID, mood: bright|steady|calm|heavy|low,
  timeZone: IANA zone}`. Atomic immediate SQLite transaction appends the mood
  event and upserts one daily leaf. Replay of the same ID/payload has no effect,
  even after midnight; changing its payload returns content-free `CONFLICT`.
  Independent same-day submissions retain history and recolor, never add days.
- `POST /api/check-ins/evolution/acknowledge`: `{stage: 1|2|3, timeZone}`.
  Acknowledgement is monotonic and rejects an unreached stage. Failed requests
  keep Continue/Retry available; unacknowledged evolution survives reload.

All routes inherit real D47 authentication, origin checks, lock gate and scoped
request lease. Anonymous/locked access fails closed; there is no auth bypass.
Mood values and request bodies are not logged. Mood history is private encrypted
hub content, has no AI read/provenance path, and is not sent in chat prompts.
Delete-all clears all three new tables under its existing exclusive lifecycle,
then VACUUM; identity/settings/auth remain unchanged. Its existing response still
reports the original three content totals. Opt-in persona seeding refuses a store
with existing check-in events/days; merely viewing an empty tree doesn't block it.

## UI and growth

The sole threshold configuration is `packages/core/src/tree-growth.ts`: stage 1
from zero days, stage 2 at 14, stage 3 at 30. The browser consumes its pure module
without needing the server/core package build or bundling Zod. SVG rendering
reuses the rounded brown branches, leaf silhouette/vein and descriptive mood
palette. Three stages offer 13/29/64 intentional branch attachment positions;
larger histories visually gather older days at the roots. Every daily record
remains in the count and expandable Daily leaf history; growth never resets.
Recoloring retains the same day key and never starts a new evolution animation.

A small in-page sprout announcement reads “Something lovely is happening… your
tree is growing!” with a single gentle 600 ms transition, followed by Continue.
Reduced motion removes tree/leaf animation and offers Continue immediately.
Acknowledgement is stored on the encrypted hub, not localStorage, so reload and
sign-in don't replay it. Existing history loads at its correct stage directly.
Colors describe feelings, never scores or clinical assessment; any mood counts.

Tabs use content-free BroadcastChannel notifications plus focus/poll resync.
Notifications arriving during a write trigger a fresh read after it settles;
stale/aborted reads cannot overwrite newer data. Session/lock/zone changes and
unmount abort pending work, close the channel and clear timers/working state.
A failed save shows an error and preserves the last confirmed daily history.

## Actual local verification — 2026-10-11

- Full regression **265/265**; focused encrypted API/repository, SVG rendering and
  database tests cover same-day updates, concurrent requests/two connections,
  retry replay/conflict, midnight and DST, invalid mood/zone/day, historical
  duplicates, stage boundaries, persisted Continue/reopen, user scoping,
  original encrypted schema upgrade, seed refusal, reset and prompt/log privacy.
- Contract validation **52/52**, safety **33/33**, server/core typecheck/build,
  web typecheck/production build, and `git diff --check` passed.
- Real built app in Chromium against **separate native compiled test servers**,
  ephemeral encrypted fictional hubs on unused loopback ports, real D47 sign-in
  and test-only FakeProvider. No production configuration/live data mounts.
  Same-day recoloring, reload, two-tab synchronization and a notification arriving
  during a deliberately held write response all retained one daily leaf/latest
  mood. Both 13→14 and 29→30 crossings celebrated; recoloring while pending did
  not restart animation; Continue survived reload and fresh sign-in. A preexisting
  100-day history loaded stage 3 without backlog, showed 64 visual leaves and
  retained all 100 daily history rows. Reduced-motion styles disabled animation.
- Screenshots of small/middle/large stages and the celebration reviewed at 1280px
  desktop and 375/390/430px mobile viewports, with no horizontal overflow; settled
  large-tree leaves fit inside the SVG. These are viewport simulations, **not
  real iPhone/Safari, GX10 or live deployment verification**. Isolated test servers were
  stopped and fictional encrypted database directory cleanup was confirmed.

Remaining for A/C: isolated GX10 encrypted migration and real session/UI smoke,
real mobile Safari/device rendering/focus, selected-zone midnight behavior on the
running app, and reduced-motion review. No GX10 changes were performed here.
Check-in trend charts, import/export and mood-history editing are not implemented.
The append-only mood history is retained privately; the current UI shows each
day's latest mood, not every same-day event.
