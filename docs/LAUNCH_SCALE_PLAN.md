# Launch scale plan (8 Nov 2026)

Targets: 1 to 10,000 users. Each may import about 100k solves, follow hundreds of people and be in groups of up to 100. A host can have a few thousand people watching a live session. One person pays for it, and ads or a subscription should pay it back.

Builds on `RELEASE_READINESS.md` (14 Oct), `AUTH_AND_AWS_KEY.md` and `SHARED_AVERAGES_LOADTEST.md`. Prices are us-east-1 list prices as I remember them. Check them on the AWS pricing pages before relying on any total.

## Verdict

The architecture holds at 10k users: one DynamoDB table on on-demand billing, plus one Node API process. Every user's data sits under their own partition key, so the 10k-user case is mostly a storage bill, not a speed problem. Three things decide whether it's affordable and safe:

1. **Storage, if everyone really imports 100k solves.** That's 1 billion solves and about 3.5 TB, or roughly $700-1,200 a month. Keep the import paywall, so only paying users store huge histories.
2. **Per-solve stats writes.** Live solving is the biggest recurring cost once people are active.
3. **The AWS steps you have to do by hand** (below). Nothing else should come before them.

## Changed in this pass

| Change | Why | Checked |
|---|---|---|
| Follow and unfollow are atomic (`mutateFollowLists`, retries on `FollowRev`) | Follow lists are arrays on the profile, written read-modify-write. If 40 people followed one account at the same moment, **only 1 follow was kept**. | Sandbox: 40/40 concurrent follows kept, 20/20 concurrent unfollows |
| `GET /api/feed`: the server merges the feed (`server/lib/feed.js`) | Opening Social sent 2 requests per followed account (profile and posts), and each did 2 consistent profile reads on the server. At 300 follows that's 600 requests and about 1,500 DynamoDB reads per open. Now it's 1 request. Accounts that haven't posted recently are skipped (`LastPostAt`). | Sandbox: correct newest-first order; read 16 of 32 authors for a 10-post page. UI: Social loads with 1 feed and 1 profiles call. |
| `POST /api/profiles`: up to 500 profile cards per call, without follow lists | Friend lists, the share composer and follower lists fetched one profile per row, and a popular user's profile carries their whole follower list | Sandbox and UI |
| Profile cache (`server/lib/profileCache.js`, 5 s) | Every visibility check re-read both profiles with consistent reads. Writes from this process clear the cache immediately. | Unit tests |
| `PUT /api/user` ignores `IsPaid`, `ImportSolveLimit`, `ImportSolveTier` and `ImportSolveCount` | **Anyone could give themselves the 2M-solve paid allowance.** Set these fields as an admin or from a payment webhook, at the top level of the profile (not inside `Settings`). | Sandbox |
| Live rooms: scrambles pushed over SSE, the server sets the spectator poll interval (2.5 s up to 8 s), cap raised from 2,000 to 5,000 | Spectators used to poll every 2.5 s whatever the room size. At 5,000 viewers and 8 s that's 625 polls/s, inside the 663/s that one process served at p95 43 ms on 30 Oct. | Sandbox: push arrives, poll hint returned. **The 5,000-viewer load test has not been run.** |
| gzip on API responses (not on SSE) | JSON compresses about 5-10x, and responses are most of the egress bill | Sandbox: `content-encoding: gzip`, SSE not compressed |
| Rate limits (`server/lib/rateLimit.js`) | Without them, one script could run up the DynamoDB bill or guess passwords. Limits: 900 requests/min per user, 3,000/min per IP, 60 sign-ins or sign-ups per minute per IP, 10 sign-in attempts per 5 min per username. | Unit tests; sandbox returns 429 |

## Capacity against the targets

| Target | Status | What limits it |
|---|---|---|
| 10k accounts | OK | Nothing shared across users is hot. |
| 100k solves per user, fast retrieval | OK | Home loads the last 200 solves. Stats come from cached stats items and day buckets. A 500k import passed on the emulator, peaking at 339 MB RSS. Not yet run on real DynamoDB. |
| Hundreds of follows | OK now | Feed and profile batching (above). Follow lists live on the profile item (400 KB cap, about 15-20k IDs). Past about 10k followers, move follows to their own items (`FOLLOWER#<id>`). |
| Groups of 100 | OK | The group cap is 100 (`PTS_MAX_GROUP_MEMBERS`). Shared-average results are one item each, and stats are counted on META only. A 100-person Ao12 and a 100-person simultaneous finish were exact on the emulator (`docs/SHARED_AVERAGES_LOADTEST.md`). Limit: the META stats item takes ~11 write units per result at 100 members, so ~90 results a second before throttling (retried). Not yet measured on real DynamoDB. |
| A few thousand watching a live session | Up to 5,000, untested | Load test `roomScale.mjs` at 5,000 before announcing a big stream. Past that, put a CDN-cached snapshot in front, or run a second process with Redis. |
| One process | OK at this scale | SSE clients, the room cache, the profile cache and the rate-limit counters all live in memory. A second instance needs Redis pub/sub and shared counters. |

## Storage and cost model

Per stored solve: about 3.5 KB in total (the solve item, plus its GSI1 and GSI2 copies, which project ALL attributes, plus 2 rank items and the tag index items). Importing one costs about 9 write units.

| Scenario | Solves | Storage | Storage per month (Standard / Standard-IA) | PITR per month (base table about 45%) | One-off import writes |
|---|---|---|---|---|---|
| One heavy user | 100k | 350 MB | $0.09 / $0.035 | ~$0.03 | ~$0.56 |
| 1k users, 10% import 50k | ~7M | ~25 GB | $6 / $2.50 | ~$2 | ~$40 |
| 10k users, 10% import 100k, rest ~2k live | ~120M | ~420 GB | $105 / $42 | ~$38 | ~$675 |
| **10k users all import 100k (stress case)** | 1B | ~3.5 TB | $875 / $350 | ~$320 | ~$5,600 |

Recurring costs that grow with activity:

- **Live solves**: about 40-80 write units each. The session and event stats items are rewritten in full on every solve. 3,000 daily users at 100 solves a day comes to $110-340 a month. This is the next cost to cut (see Next work). Measure it on day one with `PTS_LOG_DB=true`.
- **API host**: one 2-4 GB instance. Lightsail or similar in us-east-1 costs about $12-40 a month and includes several TB of transfer, which beats paying EC2's per-GB egress.
- **Live-room egress**: 5,000 viewers polling a gzipped ~1.5 KB snapshot every 8 s is about 3.4 GB an hour, so a few TB of included transfer covers a lot of streams.
- **Frontend**: a static build on S3 with CloudFront, or on Cloudflare Pages, is $0-5 a month.

Realistic first year: **$50-150/month** for 1-3k users, **$300-600/month** at 10k users with a 100k free-import cap. The stress case (everyone importing 100k) is $1,000+/month in storage alone. That's the reason imports above about 25-50k should be paid. A heavy user costs about $0.07-0.12 a month, so a $2-4/month plan or a one-off import unlock covers them many times over.

## Before you announce (in this order)

1. **AWS, by hand** (`AUTH_AND_AWS_KEY.md`): rotate the leaked key, use a `pts-api` IAM user scoped to `PTSProd`, turn on PITR and deletion protection on `PTSProd`, and delete the stale `build/` folder.
2. **Billing alarms**: AWS Budgets alerts at, say, $50, $150 and $300 a month, plus a CloudWatch alarm on `PTSProd` consumed write capacity. You're the only one paying, so you should hear about a runaway bill within hours, not at the end of the month.
3. **Host the API** on one always-on instance behind TLS (Caddy or nginx). Set:
   - `PTS_JWT_SECRET`
   - `PTS_TRUST_PROXY=1`, so rate limits see client IPs and not the proxy
   - `PTS_ALLOW_LEGACY_CLAIM=false` after testers have claimed their accounts
   - `PTS_COMPRESSION=false` only if the proxy already gzips

   The API must run under a process manager (systemd or pm2). It does not survive on its own.
4. **Load test live rooms at 5,000** (`docs/loadtest/roomScale.mjs`, with the rate-limit overrides in `docs/loadtest/README.md`) and run one 100k import against a throwaway real DynamoDB table, not PTSProd.
5. **Decide the free import limit.** It's 100k today (`PTS_FREE_IMPORT_SOLVE_LIMIT`). 25-50k keeps the stress case off your bill.

## Next work (most valuable first)

1. **Make per-solve stats writes cheaper.** Use `UpdateExpression`s on the changed fields instead of `Put`ting the whole stats item, or shrink the top-10 candidate lists. This roughly halves the live-solving bill.
2. **Write import chunks in parallel** (4-8 BatchWrites at a time). A 500k import takes 30-60 minutes today.
3. **Move finalize and the WCA import into a worker process**, and cache WCA competition dates.
4. **Store post comments as their own items.** Concurrent comments currently overwrite each other.
5. **Switch the table to Standard-IA** once storage is over about half the DynamoDB bill. It's one setting, cuts storage by 60% and makes reads and writes 25% dearer.
6. **Packed archive for imported history** (many solves per item) if storage still dominates after that. It's a large refactor, so only do it if the numbers call for it.
