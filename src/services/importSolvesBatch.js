// src/services/importSolvesBatch.js
import dynamoDB from "../components/SignIn/awsConfig";
import { batchWrite } from "./batchWrite";

/**
 * Bulk import solves into a specific event/session.
 * - Writes SOLVE items with unique timestamps
 * - Marks SESSIONSTATS stale=true so you can recompute overall stats
 *
 * Input solves should be in your UI shape:
 *   { time(ms), scramble, penalty, note, datetime?, tags?, originalTime? }
 */
export async function importSolvesBatch(userID, event, sessionID, solves = []) {
  if (!userID) throw new Error("importSolvesBatch: userID required");
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  const now = Date.now();
  const toIso = (ms) => new Date(ms).toISOString();

  // Ensure unique timestamps even if many solves share the same provided datetime
  const buildTs = (i, preferredIso) => {
    const base = preferredIso ? new Date(preferredIso).getTime() : (now + i);
    const safe = Number.isFinite(base) ? base : (now + i);
    // add i to avoid collisions
    return toIso(safe + i);
  };

  const addedSolves = [];

  const writeRequests = solves.map((s, i) => {
    const ts = buildTs(i, s.datetime);

    const item = {
      PK: `USER#${userID}`,
      SK: `SOLVE#${ts}`,
      GSI1PK: `SESSION#${userID}#${ev}#${sid}`,
      GSI1SK: ts,

      Event: ev,
      SessionID: sid,
      TimeMs: Number(s.time),
      Penalty: s.penalty ?? null,
      Scramble: s.scramble ?? "",
      Note: s.note ?? "",
      CreatedAt: ts,
      Tags: s.tags ?? {},

      // legacy-friendly fields (your normalizers use these)
      Time: Number(s.time),
      DateTime: ts,
    };

    if (s.originalTime != null) item.OriginalTime = Number(s.originalTime);

    addedSolves.push({
      time: Number(s.time),
      scramble: s.scramble ?? "",
      event: ev,
      penalty: s.penalty ?? null,
      note: s.note ?? "",
      datetime: ts,
      tags: s.tags ?? {},
      originalTime: s.originalTime ?? undefined,
    });

    return { PutRequest: { Item: item } };
  });

  // 1) Batch write solve items
  await batchWrite({ tableName: "PTS", requests: writeRequests });

  // 2) Mark SESSIONSTATS stale so user can recompute overall accurately
  const statsKey = {
    PK: `USER#${userID}`,
    SK: `SESSIONSTATS#${ev}#${sid}`,
  };

  try {
    await dynamoDB
      .update({
        TableName: "PTS",
        Key: statsKey,
        UpdateExpression: "SET stale = :t, staleReason = :r, staleAt = :a",
        ExpressionAttributeValues: {
          ":t": true,
          ":r": "bulk_import",
          ":a": new Date().toISOString(),
        },
      })
      .promise();
  } catch (e) {
    // If SESSIONSTATS doesn’t exist yet, ignore.
    console.warn("importSolvesBatch: could not mark SESSIONSTATS stale (ok):", e?.message || e);
  }

  return { addedSolves };
}
