# Shared-average load test harness

Runs against a sandbox API on :5099 backed by dynalite (never PTSProd).

The API rate-limits sign-ups to 60 per minute per IP and every user to 900 requests a minute
(`server/lib/rateLimit.js`). Start the sandbox API with `PTS_RATE_LIMIT_AUTH_IP_PER_MIN=100000
PTS_RATE_LIMIT_IP_PER_MIN=1000000 PTS_RATE_LIMIT_USER_PER_MIN=100000` before running any script that
signs up many users from one machine.

    npm i --prefix /tmp/pts-emu dynalite@3          # once
    NODE_PATH=/tmp/pts-emu/node_modules node docs/loadtest/start.js &   # emulator on :4567
    node docs/loadtest/mktable.js
    cd server && PORT=5099 PTS_TABLE=PTSLoadTest AWS_ENDPOINT_URL_DYNAMODB=http://localhost:4567 \
      AWS_ACCESS_KEY_ID=fake AWS_SECRET_ACCESS_KEY=fake node server.js &
    N=30 COUNT=12 node docs/loadtest/groupAverage.mjs
    N=40 ROUNDS=5 node docs/loadtest/burst.mjs
    PAIRS=30 node docs/loadtest/pairs.mjs
    N=50 node docs/loadtest/liveRoom.mjs
    cp src/utils/tournament.js docs/loadtest/tournament.mjs && RES=10 node docs/loadtest/tourneyFuzz.mjs

Shared averages at the group cap (each prints an `audit` block; `"exact": true` means every result
and every SharedStats count matched what was sent):

    N=100 COUNT=12 node docs/loadtest/groupAverage.mjs
    N=100 ROUNDS=5 node docs/loadtest/burst.mjs
    N=20 node docs/loadtest/legacyRun.mjs     # old single-item run, migrated under load

If 4567/5099 are already taken by an older sandbox, start a second pair and point the scripts at it
(both must be localhost):

    SIM_DDB_PORT=4667 NODE_PATH=/tmp/pts-emu/node_modules node docs/loadtest/start.js &
    SIM_DDB=http://localhost:4667 node docs/loadtest/mktable.js
    cd server && PORT=5199 PTS_TABLE=PTSLoadTest AWS_ENDPOINT_URL_DYNAMODB=http://localhost:4667 ... node server.js &
    SIM_API=http://localhost:5199 SIM_DDB=http://localhost:4667 N=100 COUNT=12 node docs/loadtest/groupAverage.mjs

`uiproxy.mjs` serves the app on :3098 with all /api traffic sent to :5099.

## Solve import at scale

`genCsTimer.mjs` writes a realistic csTimer export: 12 sessions across 11 events with csTimer's
scrTypes, practice sittings spread over years, +2/DNF rates per event, multi-phase splits and the
odd comment. The same file can be imported through the app's Import modal.

    N=100000 OUT=/tmp/cstimer-100k.txt node docs/loadtest/genCsTimer.mjs
    N=1000000 PROFILE=heavy333 OUT=/tmp/cstimer-1m-333.txt node docs/loadtest/genCsTimer.mjs

`importScale.mjs` takes that file (or a real export) through the same detect, parse, dedupe and
chunk steps as the modal and Stats.js, uploads, finalizes, checks every event's stored stats
against the parsed solves, and with `RERUN=1` imports it again expecting nothing new. Raise
`PTS_FREE_IMPORT_SOLVE_LIMIT` on the sandbox API to go past the free allowance. `PREP_ONLY=1`
stops after the client-side steps (time and memory, no API needed).

    SIM_API=http://localhost:5199 FILE=/tmp/cstimer-100k.txt RERUN=1 \
      node --max-old-space-size=8000 docs/loadtest/importScale.mjs

dynalite answers in well under a millisecond, which hides what real DynamoDB costs per call. Put
`latencyProxy.mjs` between the sandbox API and dynalite to add a fixed delay per call:

    SIM_DDB=http://localhost:4667 PORT=4767 LATENCY_MS=15 node docs/loadtest/latencyProxy.mjs &
    # then start the sandbox API with AWS_ENDPOINT_URL_DYNAMODB=http://localhost:4767

`PTS_IMPORT_DDB_CONCURRENCY` (default 6) is how many batch calls one import chunk runs at once.

For a million solves, start dynalite on disk rather than in memory
(`dynalite({ path: "/some/dir" })`), or the emulator runs out of heap.

`SANDBOX_API_PORT` picks the API that `uiproxy.mjs` forwards to.

Sessions over 100k solves are the case to recheck by hand after changing solve loading: the export
total, All Time on a non-main session, and All Events with Main only when Main's solves are older
than the import.
