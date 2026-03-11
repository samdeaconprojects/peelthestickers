// src/services/importSolvesBatch.js
import { apiPost } from "./api";

/**
 * Bulk import solves into a specific event/session using canonical server path.
 * - Writes canonical SOLVE + SOLVETAG items (tag indexes included)
 * - Recomputes SESSIONSTATS after import
 *
 * Input solves should be in your UI shape:
 *   { time(ms), scramble, penalty, note, datetime?, tags?, originalTime? }
 */
export async function importSolvesBatch(userID, event, sessionID, solves = [], opts = {}) {
  if (!userID) throw new Error("importSolvesBatch: userID required");

  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!ev) throw new Error("importSolvesBatch: event required");

  const onProgress = typeof opts?.onProgress === "function" ? opts.onProgress : null;
  const addedSolves = [];
  const BATCH_SIZE = 1500;
  const totalSolves = solves.length;
  const totalChunks = Math.max(1, Math.ceil(totalSolves / BATCH_SIZE));
  let completedChunks = 0;
  let completedSolves = 0;

  if (onProgress) {
    onProgress({
      phase: "writing",
      completedChunks,
      totalChunks,
      completedSolves,
      totalSolves,
    });
  }

  for (let i = 0; i < solves.length; i += BATCH_SIZE) {
    const chunk = solves.slice(i, i + BATCH_SIZE);
    const out = await apiPost("/api/importSolvesBatch", {
      userID,
      event: ev,
      sessionID: sid,
      solves: chunk,
    });
    if (Array.isArray(out?.addedSolves) && out.addedSolves.length) {
      addedSolves.push(...out.addedSolves);
    }

    completedChunks += 1;
    completedSolves += chunk.length;
    if (onProgress) {
      onProgress({
        phase: "writing",
        completedChunks,
        totalChunks,
        completedSolves,
        totalSolves,
      });
    }
  }

  // 2) Recompute SESSIONSTATS for accurate overall stats immediately after import
  try {
    if (onProgress) {
      onProgress({
        phase: "recompute",
        completedChunks,
        totalChunks,
        completedSolves,
        totalSolves,
      });
    }

    await apiPost("/api/recomputeSessionStats", {
      userID,
      event: ev,
      sessionID: sid,
    });
  } catch (e) {
    // Solves were already written; keep import successful and allow manual recompute fallback.
    console.warn("importSolvesBatch: recomputeSessionStats failed after import", e);
  }

  return { addedSolves };
}
