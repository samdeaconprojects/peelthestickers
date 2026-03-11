require("dotenv").config();

const { ddb, TABLE } = require("../ddb");
const {
  getAllSolvesBySession,
  getFinalTimeMs,
  normalizePenalty,
  deleteSolveAndTagItems,
  recomputeSessionStats,
  recomputeEventStats,
} = require("../lib/ptsCore");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function defaultMinMsForEvent(event) {
  const ev = String(event || "").toUpperCase();
  const map = {
    "222": 200,
    "333": 1000,
    "333OH": 1000,
    "444": 1000,
    "555": 1000,
    "666": 1000,
    "777": 1000,
    "SKEWB": 200,
    "PYRAMINX": 200,
    "CLOCK": 200,
    "SQ1": 300,
    "MEGAMINX": 1000,
    "FTO": 200,
    "MAGIC": 200,
    "RELAY": 1000,
    "ROUX": 1000,
  };
  return map[ev] ?? 100;
}

function usageAndExit() {
  console.log(`
Usage:
  node scripts/repairSessionOutliers.js --user <id> --event <event> --session <id> [--min-ms 1000] [--dry-run]
`);
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv);
  const userID = String(args.user || "").trim();
  const event = String(args.event || "").trim().toUpperCase();
  const sessionID = String(args.session || "").trim() || "main";
  const dryRun = !!args["dry-run"];
  const minMs = Number.isFinite(Number(args["min-ms"]))
    ? Number(args["min-ms"])
    : defaultMinMsForEvent(event);

  if (!userID || !event || !sessionID) usageAndExit();

  const solves = await getAllSolvesBySession(ddb, TABLE, userID, event, sessionID);
  const bad = [];

  for (const s of solves) {
    const penalty = normalizePenalty(s?.Penalty);
    if (penalty === "DNF") continue;

    const finalMs = getFinalTimeMs(s);
    const rawMs = Number(s?.RawTimeMs);

    if (!Number.isFinite(finalMs) || finalMs <= 0) {
      bad.push({ solve: s, reason: "invalid_final_time" });
      continue;
    }
    if (Number.isFinite(rawMs) && rawMs <= 0) {
      bad.push({ solve: s, reason: "non_positive_raw_time" });
      continue;
    }
    if (finalMs < minMs) {
      bad.push({ solve: s, reason: `below_min_ms_${minMs}` });
      continue;
    }
  }

  console.log({
    userID,
    event,
    sessionID,
    minMs,
    totalSolves: solves.length,
    outliers: bad.length,
    dryRun,
  });

  if (bad.length > 0) {
    console.log("Sample outliers:");
    for (const x of bad.slice(0, 10)) {
      console.log({
        SK: x.solve?.SK,
        CreatedAt: x.solve?.CreatedAt,
        RawTimeMs: x.solve?.RawTimeMs,
        FinalTimeMs: x.solve?.FinalTimeMs,
        Penalty: x.solve?.Penalty,
        reason: x.reason,
      });
    }
  }

  if (dryRun || bad.length === 0) return;

  for (const x of bad) {
    await deleteSolveAndTagItems(ddb, TABLE, x.solve);
  }

  await recomputeSessionStats(ddb, TABLE, userID, event, sessionID);
  await recomputeEventStats(ddb, TABLE, userID, event);

  console.log(`Deleted ${bad.length} outlier solves and recomputed stats.`);
}

main().catch((e) => {
  console.error("repairSessionOutliers failed:", e);
  process.exit(1);
});

