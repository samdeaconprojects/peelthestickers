# Shared averages & competitions — load test (2026-10-29)

All runs used an isolated copy of the API (port 5099) on a local DynamoDB
emulator (dynalite, table `PTSLoadTest`, fake AWS creds). Nothing touched
`PTSProd`. Simulation scripts are in `docs/loadtest/`.

## Scenarios run

| Scenario | Setup | Result |
|---|---|---|
| Big group average | 30 users, Ao12, staggered starts, 7 drop-out/resume, retries | **19/401 messages lost**, 23 server round results missing, stats drift |
| Simultaneous finish | 40 users, 5 rounds, all finish within ~50ms | **79/200 updates lost** from chat; server kept 33/200 round results |
| 1v1 pairs | 30 DMs at once, Ao12, opponents finish ≤300ms apart | **5/30 pairs** lost a result + wrong win stats |
| Tournament fuzz | 8,400 brackets/round-robins per run, 2–16 players, every rule | **2.3% deadlock forever** with centisecond times (0.3% with ms) |
| Live room | 1 host, 49 viewers, 15 scrambles | Solid: SSE push p95 12ms, leaderboard correct. Minor bugs below |
| Real UI check | Signed into sandbox UI as a member of the 30-user group | **Chat is blank and can't be scrolled**; shared average unreachable |

Every failing request returned HTTP 200, so none of this shows up as errors.

### Re-run after the server fixes (#1–#3)

| Scenario | Before | After |
|---|---|---|
| Simultaneous finish (40 users) | 121/200 stored, 33/200 round results | 200/200, 200/200, stats exact |
| 1v1 pairs (30) | 5 pairs lost results/wrong wins; spoof accepted | 0 / 0; spoof → 403 |
| Big group (30 users, Ao12) | 19 msgs lost, 23 results missing, stats 322 vs 341 | 0 lost (29 same-ms sends), 0 missing, stats 358 = 358 |

Each `[sharedUpdate]` now does a few more small writes. In the 1v1 run, median
`POST /api/message` went from 8ms to 23ms. Issues #4–#7 are still open.

## Bugs, by severity

### 1. Chat messages overwrite each other (data loss)
`server/server.js:9961`: messages are keyed `MSG#<ISO ms timestamp>`. Two
messages in the same conversation in the same millisecond share a key, and the
second `Put` silently replaces the first. People watching live still see both
via SSE, so it only shows up on reload, and then live viewers and reloaders
see different results.
**Fixed:** the key is now `MSG#${ts}#${randomUUID().slice(0, 8)}`, written
with `attribute_not_exists(SK)`. Ordering and cursors still work.

### 2. Server round results / win stats lose concurrent updates
`processSharedMessageEffects` (`server/server.js:5011`) reads the whole
`SHAREDRUN`, edits `RoundResults` in memory and writes the whole map back.
When two people post at about the same time, the last writer wipes the other
result. `applySharedStatsToConversation` (`:4875`) does the same
read-modify-write for `SharedStats` on META and every member row, so the
"N shared solves / your wins" header drifts (it showed 322 against a true 341).
**Fixed:**
- Each update now writes only its own cell (`SET RoundResults.#idx.#uid`) and bumps a `Rev` counter.
- `Summary` is recomputed from a fresh read and written with an optimistic lock on `SummaryRev`. The writer that wins applies the stats delta, so each change counts exactly once.
- `SharedStats` on META and on each member row is written with an optimistic lock on `SharedStatsRev`, retried with jittered backoff (`server/lib/sharedMessages.js`).
- *Superseded 2026-11-08:* results are now one item each, and stats are counted per change on META only (see Group shared averages under Capacity).
- Extensions append with `list_append`.
- Creating a run is conditional, so a duplicate `[sharedAoN]` can't wipe a run or count it twice.

### 3. Anyone in the chat can post a time as someone else
`[sharedUpdate]sid|idx|time|uid` trusts the `uid` in the text. Auth only checks
`req.body.senderID`. Verified: user A posted `|0|1|<B>`, and the server stored a
0.001s solve for B. Clients do the same (`SharedAverageMessage.js:508`,
`Social.js buildRoundResultsFromMessages`).
**Fixed (server):** `POST /api/message` returns 403 when the uid inside a
`[sharedUpdate]` or `[sharedJoin]` doesn't match the sender. Messages
already stored aren't covered, so clients should still attribute updates to
`m.sender`.

### 4. Busy group chats open blank, and older messages can't load
First page = 25 messages (`Social.js:55`). `[sharedUpdate]`, `[sharedJoin]` and
`[sharedExtend]` render as nothing. Older pages load only from a scroll event
(`Social.js:1106`). In the 30-user group the first page was 25 hidden updates,
so the panel had nothing to scroll and wheel-scrolling fired no request. The
shared-average card, and any normal chat, is unreachable for anyone who
opens the chat after that point.
**Fix (quick):** after any page load, keep fetching older pages while
`hasMore` and no visible message has loaded, or until the referenced
`[sharedAoN]` is found. **Fix (better):** stop putting per-solve updates into
the message stream, and have the card read `SHAREDRUN` (once #2 is fixed).

### 5. Tournaments deadlock on ties, and on no-shows
`src/utils/tournament.js`:
- average: undecided when means are equal (`:326`)
- best-of: undecided when the block runs out with equal round wins (`:308`)
- sets: tied rounds are skipped (`:234`), but the block holds exactly the maximum number of solves, so one tie can mean the block runs out with no winner

Both players then sit in `waiting` forever and the bracket never finishes.
Typed and stackmat times are centiseconds, so ties are common: 2.3% of
fuzzed tournaments stuck. Separately, a player who never solves blocks their
opponent forever, because there is no forfeit.
**Fix:** add a deterministic tiebreak (best single → worst single → extra
sudden-death solve), plus a host "advance/forfeit" control.

### 6. Live rooms (minor)
- `GET /api/room/:id/state` and `/leaderboard` skip the `liveRoom` privacy check. A non-follower got 403 on join but could still read the scrambles through `/state`.
- Re-joining (e.g. after a reload) re-`Put`s the member row, which resets `CurrentIndex` to -1 and wipes leaderboard progress (6/6 rejoiners).
- Leaderboard sort `(b.currentIndex || -1)` (`server.js:9828`) treats index 0 as -1.

### 7. Write amplification (cost/latency, not a bug)
Each `[sharedUpdate]` in an N-member group costs about 2N+4 writes and N+4 reads
(`touchConversationActivity` updates every member row, and the stats update does
a Get+Update for every member). That is about 64 writes per solve at 30 members,
and every message writes the same META item. Worth batching or debouncing
once #2 is redone.
**Fixed (2026-11-08):** a `[sharedUpdate]` is now 4 writes and 1 read,
whatever the group size: message, cell, round, and one atomic META stats
update, plus a read of the small run item. It no longer touches member rows or
META's last-message fields. See Group shared averages below.

## What held up
- `/api/solve` saves: no failures under any load.
- SSE delivery: 0 missed events, millisecond latency, 30–50 concurrent streams.
- Live room scramble fan-out with 49 viewers.
- Body-field auth guard (`senderID`/`userID` must match the token).
- No 5xx responses in any run.

## Capacity (2026-10-30)

### Live rooms
Every spectator polls `GET /api/room/:id/state` every 2.5s, and each poll
returns the **whole** member list. Total load therefore grows with viewers².

| Viewers | Polls/s | Response | p50 / p95 | Est. DynamoDB reads/s on the `ROOM#` key |
|---|---|---|---|---|
| 100 | 33 | 12KB | 14 / 24ms | ~120 |
| 250 | 83 | 29KB | 12 / 22ms | ~540 |
| 500 | 166 | 58KB | 29 / 48ms | ~1,800 |
| 1,000 | 165 (should be 400) | 118KB | **5.2s / 6.1s** | ~6,600 needed |

A single partition key serves at most about 3,000 read units/s, which this
reaches at around 650 viewers. The one Node process saturated before that, at
1,000.

**Fixed (2026-10-30):**
- Room state is served from a shared ~1s in-memory snapshot (`server/lib/liveRoomCache.js`). Host actions invalidate it immediately; joins splice the joiner's row in.
- Spectators get the top 50 rows, plus themselves and the host, and `memberCount`. The bar shows "+N more following".
- Member and scramble lists now read every page.

| Viewers | Polls/s | Response | p50 / p95 |
|---|---|---|---|
| 500 | 166 | 8KB | 2 / 5ms |
| 1,000 | 332 | 8KB | 1 / 9ms |
| 2,000 | 663 | 8KB | 1 / 43ms |

DynamoDB now does about one room read per second, whatever the viewer count
(~70 read units/s at 2,000 members). The next limits are Node egress and CPU,
plus your own spectator poll interval, not the database.

### Group shared averages
**Before (2026-10-30).** Correctness held at 100 people all finishing together
(300/300). The limit was the single `SHAREDRUN` item: ~110 bytes per
(player × solve), and DynamoDB bills every write by the **whole** item size,
with a cap of 1,000 write units/s and 400KB per item. Each update wrote it twice
(the cell, then the summary), then rewrote every member's conversation row,
each holding its own copy of the stats.
Peak ≈ (N / finish-spread s) × 2 × (3 + 0.11·N·count) WCU/s.

| Group | Ao5 | Ao12 | Ao50 |
|---|---|---|---|
| 10 | ✓ | ✓ | ✓ |
| 30 | ✓ | ✓ | throttles near the end |
| 50 | ✓ | borderline at the end | ✗ |
| 100 | ✗ | ✗ | ✗ (and 400KB cap) |

Hosted rooms hit the 400KB cap after roughly 3,600 results. A failed run write
made `POST /api/message` return 500 *after* saving the message, and skipped
the SSE push. Rough cost: 100 people × Ao12 ≈ $4 on-demand.

**After (2026-11-08).** A run is now a small settings item plus small items
beside it (`server/lib/sharedMessages.js`):
- `SHAREDRUN#<sid>#CELL#<idx>#<uid>`: one result. Written only if new or changed.
- `SHAREDRUN#<sid>#ROUND#<idx>`: one `T#<uid>` time per player. A single
  `UpdateItem` sets one player's time and returns the round as it was just
  before (`ALL_OLD`). So each change knows exactly what it did (a new solve, a
  win moving), with no lock and no re-read. A resend with the same time fails
  the condition and is never counted twice.
- That change is added to `SharedStats` on the conversation META with atomic
  `if_not_exists(path, 0) + n` arithmetic. META is the only copy: member rows
  no longer carry stats. `GET /api/conversations` fills `SharedStats` in from
  META, and an open chat re-reads it from
  `GET /api/conversation/:id/shared-stats` (at most every 3s while results arrive).
- Old single-item runs are migrated the first time they get a new result: cells
  and rounds are created only if absent, then `RoundResults` and `Summary` are removed.
- Shared-run and conversation-list writes no longer fail the request.
  `POST /api/message` returns 200 and publishes SSE, and the failure is logged.
  Checked by forcing every run write to fail (a 1.1KB shared ID): 200, 200, and
  both messages pushed.
- Hidden `[sharedUpdate]` messages no longer touch META or the N member rows.

Cost per update is now ≈ 1 (message) + 1 (cell) + ⌈0.02·N⌉ (round) +
⌈1 + 0.1·N⌉ (META stats) WCU. That is ~16 WCU at 100 members, whatever the
average length. It was ~2,500 at 100 × Ao12, counting the member-row copies.
100 people × Ao12 ≈ $0.04 on-demand.

| Run (dynalite, sandbox API) | Messages | Results stored | Stats (solves / wins, per user, per event) | `POST /api/message` p50 / p95 |
|---|---|---|---|---|
| `groupAverage.mjs` N=100 COUNT=12 (15 resumers, 10 retriers, 2 quitters) | 1,408 / 1,408 | 1,190 / 1,190, 0 wrong | exact: 1,190 / 12 | 10 / 90ms |
| `burst.mjs` N=100 ROUNDS=5 (all within 50ms) | 500 / 500 | 500 / 500 | exact: 500 / 5 | 201 / 236ms |
| `pairs.mjs` PAIRS=30 | 720 / 720 | 0 lost | 0 pairs wrong; spoof → 403 | 5 / 97ms |
| `legacyRun.mjs` N=20 (old-format run + concurrent new results, edits, resends) | 85 sent, all 200 | 120 / 120 | exact: 120 / 5; run migrated once | 68 / 340ms |

SSE: 0 missed events across 100 streams. META stays ~10.6KB at 100 members;
the run item is 2.7KB for an Ao12.

| Group | Ao5 | Ao12 | Ao50 | Hosted room |
|---|---|---|---|---|
| 10 | ✓ | ✓ | ✓ | ✓ |
| 30 | ✓ | ✓ | ✓ | ✓ |
| 50 | ✓ | ✓ | ✓ | ✓ |
| 100 | ✓ | ✓ (tested) | ✓ | ✓ |

The remaining hot spot is the META item. It takes ~(1 + 0.1·N) WCU per update
and at most 1,000 WCU/s, so about 90 updates/s at 100 members: everyone
finishing inside ~1.1s. Shorter spikes are throttled and retried (SDK retries,
then `retryOnThrottle`, up to ~3s). The message and result are never lost. If a
stats write still fails, that one change is missing from the header stats and
the error is logged. Real solves spread over several seconds, so this needs a
group of 100 stopping their timers together. Hosted rooms are no longer capped
by results. The run item holds only settings and scramble lists, ~60 bytes per
round, so the cap is ~6,000 rounds.

The emulator does not throttle, so the burst row proves correctness, not
throughput. Check the META item's consumed WCU on a throwaway real table before
announcing 100-person races.

**Caps (2026-11-08):** groups and joinable rooms stop at 100 members (was 50),
live rooms at 5,000 (`server/lib/memberCaps.js`). Existing members can always
rejoin. Load tests above the caps need `PTS_MAX_GROUP_MEMBERS` or
`PTS_MAX_ROOM_MEMBERS` set on the sandbox API.

## Caveat
The emulator is slower than real DynamoDB under burst, which widens the race
windows in the 40-user burst test (p50 1.6s there). The 1v1 run had fast
responses (p50 8ms) and still hit #1 and #2 in 17% of pairs. Both come straight
from the code, not from the emulator.
