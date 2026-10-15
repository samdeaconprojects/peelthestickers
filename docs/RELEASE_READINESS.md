# PTS release readiness and cost review (14 Oct 2026)

Scope: thousands of sign-ups, imports of 100k-500k solves per user, WCA imports, live solving, DMs, group messages, shared averages. Based on reading `server/server.js`, `server/lib/ptsCore.js`, the client services, the local `.env` files and a read-only `DescribeTable` on the AWS account. The production table `PTSProd` (us-east-1) could not be described from this session (blocked as a production read), so its item count, size and GSI list are unverified.

## Verdict

Not ready for a public launch. The data layer (single DynamoDB table, on-demand billing) will scale to this load cheaply. The blockers are all in the API process and in security, not in the database.

## Blockers (fix before any public link)

1. **AWS access key is in the frontend bundle.** `.env` holds `REACT_APP_AWS_ACCESS_KEY_ID`, and `build/static/js/main.46f2e969.js` (built 6 Sep) contains that key in plain text. It is the same key the server and the admin scripts use, and it can list and describe every table in the account. If that build was ever uploaded anywhere, treat the key as public. Rotate it in IAM today, give the server a key scoped to `dynamodb:*` on `PTSProd` only, delete `REACT_APP_AWS_*` from `.env`, and remove `aws-sdk` from the frontend `package.json` (nothing imports it any more).
2. **There is no authentication.** `handleSignIn` in `src/App.js` ignores the password and signs in whoever types an existing userID. Every route trusts the `userID` in the path or body. Anyone can add, edit or delete another user's solves and sessions, send messages as them, set their own `IsPaid` via `PUT /api/user/:userID`, and `POST /api/batchWrite` writes arbitrary items straight into the table. Until a real token is verified on the server, the import limits and any paywall are decorative.
3. **DMs are readable by anyone.** `GET /api/messages/:conversationID` only checks membership when a `userID` query param is present, and DM conversation IDs are just the two userIDs joined by `#`. Omit the param and read any conversation.
4. **Debug and admin routes are public.** `/api/_table`, `/api/admin/backfill-session-stats/:userID`, `/api/recompute*`, `/api/batchWrite`.
5. **No backups.** Point-in-time recovery is DISABLED on `PTSProd`, `PTS` and `PTSDev`. Enable PITR and deletion protection on `PTSProd` (about $0.20 per GB-month). The us-east-2 tables look stale (`PTS` has one GSI, `PTSDev` is provisioned at 1/1) and can probably be deleted.
6. **No rate limiting and 10 MB JSON bodies.** One script can run up write costs or stall the single Node process. Add `express-rate-limit` (per IP and per user) and drop `PTS_JSON_LIMIT` to what a 5000-solve chunk needs (about 2 MB).

## Scale risks in the import path (100k-500k solves)

The chunked import job design is sound: 5000-solve chunks, idempotent via deterministic solve IDs, allowance reserved per chunk, finalize in the background with the client polling. Problems appear at the top of the range:

- **Finalize holds a whole event in memory.** `recomputeAllDayBucketsForEvent` calls `getAllSolvesByEvent` and groups every solve into day maps. 500k solve objects are roughly 0.7-1.5 GB of heap. On a 1 GB instance the process dies mid-finalize; the job is left `FINALIZING` and is only picked up again if finalize is called again. Rewrite it to stream by day (one GSI2 page at a time, flush a bucket when the day changes), like `recomputeSessionStats` already does with `iterateQueryItems`.
- **Finalize blocks the event loop.** Stats are computed in synchronous loops over each page inside the API process, so a large finalize makes every other user's requests wait. Move finalize (and the WCA import) into a separate worker process or a queue (SQS + a second Node process is the cheapest fit here).
- **Chunks are written serially.** Each chunk is 5000 solves times about 5 items, 25 per BatchWrite, one call at a time: roughly 1000 round trips, 15-30 s per chunk, 30-60 minutes for 500k. Run 4-8 BatchWrites concurrently per chunk and it drops to a few minutes. DynamoDB on-demand will absorb that burst.
- **WCA import loads all existing solves of the target session** for de-duplication (`getAllSolvesForSession`) and fetches one competition per competition visited with no cache. A competitor with 100 competitions costs 100 WCA API calls; thousands of users doing this will hit WCA rate limits. Cache competition dates in the table (they never change) and add a per-user cooldown on `/api/wca/import`.
- **Allowance is bypassable.** `POST /api/solve` and `POST /api/batchWrite` do not count against `ImportSolveCount`. Fine once auth exists and `batchWrite` is removed, otherwise the 100k free limit means nothing.

## Scale risks in reads

- **Home loads the entire current session.** `loadAllCurrentSessionSolves` in `src/App.js` fetches every solve of the active session on sign-in and session switch. A user who imported 100k solves into `333/main` downloads about 100 MB of JSON per app open, and the browser holds it. This is the single biggest cost and UX problem for the exact users you expect: cap the home list at the last N solves (the `solvesLastN` route and the cached session stats already cover what the home view shows) and page the rest.
- Stats, export and the compare view also walk whole sessions with 500-1000 item pages. Acceptable for a deliberate export; add a confirmation and a size estimate above about 50k solves.
- Polling while on screen: live room leaderboard every 5 s, profile "is live" badge every 8 s per viewer, shared average every 10 s, social backstop every 5 min. Each is one cheap query, so DynamoDB cost is negligible; the load lands on the single Node process (1000 people viewing profiles is about 125 requests per second, which one process handles).

## Social, messaging, shared averages, groups

- SSE notifications live in an in-process `Map`. One process handles thousands of idle connections, but the moment you run two instances, notifications split. Either stay on one process (fine for this launch) or put a Redis/ElastiCache pub-sub behind `publishNotification`.
- `PUT /api/postComments` and `PUT /api/groupPostComments` replace the whole comments array: concurrent comments overwrite each other, and a busy post will hit the 400 KB item limit. Store comments as their own items (`COMMENT#<timestamp>`).
- Messages are one item each under `CONVO#<id>` with cursor pagination; this scales. Shared-run stats are merged per conversation item, fine. Group fan-out loops members in memory; fine below a few hundred members.
- Message text, notes and scrambles are unbounded strings. Cap text at a few KB.

## Cost model

Assumptions (verify on the AWS pricing page): DynamoDB on-demand in us-east-1 at $0.625 per million write units and $0.125 per million read units, storage $0.25 per GB-month, PITR $0.20 per GB-month, data transfer out $0.09 per GB after the free tier. The server's own metrics logger (`PTS_LOG_DB=true`) prints consumed capacity per route; run it for a day in production to replace these estimates with measured numbers.

Per imported solve: 1 solve item (about 1 KB) plus copies in GSI1 and GSI2, 2 single-rank items, 1-3 tag index items with GSI3 copies: about 8-10 write units, plus roughly 0.5 read units during finalize. Storage per solve including index copies: about 4 KB.

| Scenario | One-off cost | Ongoing |
|---|---|---|
| One user imports 100k solves | ~$0.60 | ~$0.10/month storage |
| One user imports 500k solves | ~$3 | ~$0.50/month storage |
| 1,000 users, average 20k imported | ~$115 | ~$20/month storage (80 GB) |
| 1,000 daily active users, 100 live solves each per day | | ~$100-150/month |
| Backups (PITR) on 100 GB | | ~$20/month |
| API server, one 2-4 GB instance | | $12-40/month |
| Egress if home keeps loading full sessions | | $50+/month and climbing |

The live-solve line dominates. Each solve rewrites the session stats item and the event stats item in full (`putStatsItemWithVersionBump` and the incremental path both `Put` the whole item), and those items carry top-10 candidate lists for every window, so a single solve costs 40-80 write units rather than 10. Switching those to `UpdateExpression`s on the changed fields, or shrinking the candidate lists, roughly halves the monthly bill.

Realistic total for the first few thousand users: $150-300/month, with imports a rounding error. The expensive parts are storage over time and per-solve stats writes, not the one-off imports.

## Free vs paid

Free is affordable at this scale if the home-load and stats-write fixes land. A heavy free user costs about $0.10-0.25/month. Where a paywall earns its place:

- **Import size.** Keep the existing `FREE_IMPORT_SOLVE_LIMIT` mechanism but set it at 25k-50k, not 100k: it covers nearly every csTimer export and leaves the 100k-500k importers (the ones who cost storage forever and trigger the heavy finalize) on a paid tier. The server already supports `ImportSolveTier` and explicit limits per profile, so the only missing piece is a verified identity to attach it to and a Stripe webhook to set the field.
- **Bulk export and full-history compare** (the whole-session walks) fit the same paid tier.
- **Do not paywall** live solving, sessions, basic stats, DMs, groups, shared averages or live rooms. They are cheap and they are the growth loop.
- Price: a one-off "import unlock" or $2-4/month covers a paid user's storage many times over.

## Suggested order

1. Rotate the AWS key, scope the server's IAM user to `PTSProd`, strip frontend AWS env vars and `aws-sdk`, enable PITR and deletion protection.
2. Real auth (Cognito, Clerk or Supabase Auth are all fine; Cognito stays inside AWS). Verify the token in one Express middleware, derive `userID` from it, delete `batchWrite`, `_table`, `admin/*` and the recompute routes from the public surface.
3. Cap the home solve load to the last N solves.
4. Stream `recomputeAllDayBucketsForEvent`, parallelise chunk writes, and move finalize plus WCA import to a worker process.
5. Rate limiting, body size, string length caps, comments as separate items.
6. Measure with `PTS_LOG_DB` for a day, then set the free import limit and wire a payment provider.
