# Admin metrics (`/admin`)

An admin-only page with user and solve counts, signups, activity, and a ranked account table that flags likely abuse. Admins are the userIDs in `PTS_ADMIN_USER_IDS`; they see a chart icon above the settings cog. Code: `server/lib/adminMetrics.js` (tests next to it), `src/components/Admin/AdminMetricsPage.js`.

## How the numbers are made

- **User list**: a registry partition, `PK = ADMIN#USERS`, `SK = USER#<id>`. Signup and profile creation add to it. **Rebuild user index** on the page scans the whole table once to add older accounts. Run it once after the first deploy. It's safe to re-run, but it reads every item, so avoid it on a big table.
- **Solves**: summed from each user's `EVENTSTATS#<event>` items. **Imported** is the larger of the profile's `ImportSolveCount` and the user's import jobs' `ProcessedSolves`. Solves written by scripts count as live.
- **Added 24h / 7d**: about once a day each registry item gets a snapshot `{at, solves, imported}` (`Snapshots`, kept 10 days). "Added" is the current count minus the snapshot from the start of the window, so it doesn't depend on solve dates. An account created inside the window counts from 0. For the first week after deploy, windows are shorter (hover a number to see where it counts from). Deleting solves makes it negative.
- **Daily run**: the API runs a full refresh once a day so snapshots exist even if nobody opens the page. `PTS_ADMIN_METRICS_DAILY=false` turns it off. It runs in-process, so with more than one API instance, turn it off on all but one.
- **Cache**: 5 minutes. **Refresh** forces a new count.

## Flags

Flags only highlight rows; nothing is blocked. Fast singles aren't flagged, since mis-stops make sub-world-record times common.

| Code | Rule | Constant |
|---|---|---|
| BURST | 1,500+ live solves added in 24h, or 6,000+ in 7d | `BURST_LIVE_SOLVES_1D` / `_7D` |
| RATE | 1,500+ live solves per day averaged since signup | `SUSPICIOUS_LIVE_SOLVES_PER_DAY` |
| HUGE | 100k+ solves | `HUGE_ACCOUNT_SOLVES` |
| NO_PROFILE | Registered but no profile item | |

## Cost

Measured on PTSDev: about 4 read units per user per refresh, plus 1 small write per user per day for the snapshot. At 10k users that's roughly half a cent per refresh and well under $1 a month for the daily run. A refresh takes about 10 ms per user (around 100 s at 10k users). If that gets slow, precompute the daily run's result and serve it.

## If you add account deletion

Delete `ADMIN#USERS / USER#<id>` too. Otherwise the account lingers with a NO_PROFILE flag.
