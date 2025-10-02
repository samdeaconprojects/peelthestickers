// backfillSessionStats.js
import dynamoDB from "../components/SignIn/awsConfig.js";
import { getSessions } from "./getSessions";
import { getAllSolvesBySessionPaged } from "./getSolvesBySession";

// Reuse the helpers from addSolve.js:
import { /* computeWcaAverage, */ } from "./addSolve"; // or duplicate here

const WINDOW_SIZES = [5, 12, 50, 100, 1000];

export const backfillSessionStatsForUser = async (userID) => {
  const sessions = await getSessions(userID); // Items with SK like SESSION#EVENT#sessionID

  for (const s of sessions) {
    const event = s.Event;
    const sessionID = s.SessionID;

    const solves = await getAllSolvesBySessionPaged(userID, event, sessionID); // oldest->newest
    let solveCount = 0, sumMs = 0, bestSingleMs = null, worstSingleMs = null;
    let best = { 5: null, 12: null, 50: null, 100: null, 1000: null };

    // Buffers to compute best AoN
    const buffers = { "5": [], "12": [], "50": [], "100": [], "1000": [] };

    for (const it of solves) {
      solveCount++;
      const ms = it.TimeMs;
      const penalty = it.Penalty || null;
      if (penalty !== "DNF") {
        sumMs += ms;
        if (bestSingleMs == null || ms < bestSingleMs) bestSingleMs = ms;
        if (worstSingleMs == null || ms > worstSingleMs) worstSingleMs = ms;
      }

      // Rolling AoNs
      for (const N of WINDOW_SIZES) {
        const key = String(N);
        const buf = buffers[key];
        buf.push({ ms, penalty });
        if (buf.length > N) buf.shift();
        if (buf.length === N) {
          // Inline compute to keep this file standalone
          const values = [];
          let dnf = false;
          for (const s of buf) {
            if (s.penalty === "DNF") { dnf = true; break; }
            values.push(s.penalty === "+2" ? s.ms + 2000 : s.ms);
          }
          if (!dnf && values.length === N) {
            values.sort((a,b)=>a-b);
            values.shift(); values.pop();
            const avg = Math.round(values.reduce((a,b)=>a+b,0) / (N-2));
            if (best[N] == null || avg < best[N]) best[N] = avg;
          }
        }
      }
    }

    const statsItem = {
      PK: `USER#${userID}`,
      SK: `SESSIONSTATS#${event.toUpperCase()}#${sessionID}`,
      solveCount,
      sumMs,
      bestSingleMs,
      worstSingleMs,
      bestAo5: best[5],
      bestAo12: best[12],
      bestAo50: best[50],
      bestAo100: best[100],
      bestAo1000: best[1000],
      buffers,               // seeded so online updates continue seamlessly
      lastSolveTS: solves.length ? solves[solves.length - 1].GSI1SK : null,
      version: 1,
      stale: false,
    };

    await dynamoDB.put({ TableName: "PTS", Item: statsItem }).promise();
    console.log(`Backfilled stats for ${event}/${sessionID} (${solveCount} solves)`);
  }
};
