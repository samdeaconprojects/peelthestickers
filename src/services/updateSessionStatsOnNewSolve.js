// src/services/updateSessionStatsOnNewSolve.js
import dynamoDB from "../components/SignIn/awsConfig";
import { getLastNSolvesBySession } from "./getSolvesBySession";
import { getEffectiveTimeMs, computeWindowAverageMs } from "./sessionStatsUtils";

/**
 * Incrementally update Stats when ONE new solve is added.
 * - `newSolve` is the DynamoDB item you just wrote, or at least
 *   an object with Time, Penalty, DateTime, Event, SessionID, etc.
 */
export const updateSessionStatsOnNewSolve = async (userID, event, sessionID, newSolve) => {
  const normalizedEvent = (event || "").toUpperCase();

  // 1. Load the existing SESSION item (to get current Stats)
  const getParams = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SESSION#${normalizedEvent}#${sessionID}`,
    },
  };

  const getResult = await dynamoDB.get(getParams).promise();
  const sessionItem = getResult.Item || {};
  const currentStats = sessionItem.Stats || {
    solveCount: 0,
    totalTimeMs: 0,
    overallAvgMs: null,
    bestSingleMs: null,
    bestSingleDateTime: null,
    bestAo5Ms: null,
    bestAo5StartIndex: null,
    bestAo12Ms: null,
    bestAo12StartIndex: null,
    lastSolveDateTime: null,
    lastRecomputedAt: null,
  };

  // 2. Get up to last 11 existing solves (before the new one)
  const lastSolves = await getLastNSolvesBySession(
    userID,
    normalizedEvent,
    sessionID,
    11
  );

  // 3. Build array including the new solve at the end
  const solvesWindow = [...lastSolves, newSolve];

  // 4. Update simple aggregates
  const t = getEffectiveTimeMs(newSolve);
  const newSolveCount = (currentStats.solveCount || 0) + 1;
  const newTotalTimeMs = Number.isFinite(t)
    ? (currentStats.totalTimeMs || 0) + t
    : (currentStats.totalTimeMs || 0);

  const newOverallAvgMs =
    newSolveCount > 0 && newTotalTimeMs > 0
      ? Math.round(newTotalTimeMs / newSolveCount)
      : currentStats.overallAvgMs;

  let newBestSingleMs = currentStats.bestSingleMs;
  let newBestSingleDateTime = currentStats.bestSingleDateTime;

  if (Number.isFinite(t)) {
    if (newBestSingleMs === null || t < newBestSingleMs) {
      newBestSingleMs = t;
      newBestSingleDateTime = newSolve.DateTime || newSolve.datetime || null;
    }
  }

  let newBestAo5Ms = currentStats.bestAo5Ms;
  let newBestAo5StartIndex = currentStats.bestAo5StartIndex;
  let newBestAo12Ms = currentStats.bestAo12Ms;
  let newBestAo12StartIndex = currentStats.bestAo12StartIndex;

  // 5. Re-evaluate Ao5 if we have at least 5 total solves
  if (newSolveCount >= 5 && solvesWindow.length >= 5) {
    const ao5 = computeWindowAverageMs(solvesWindow.slice(-5));
    if (
      Number.isFinite(ao5) &&
      (newBestAo5Ms === null || ao5 < newBestAo5Ms)
    ) {
      newBestAo5Ms = ao5;
      newBestAo5StartIndex = newSolveCount - 5; // 0-based
    }
  }

  // 6. Re-evaluate Ao12 if we have at least 12 total solves
  if (newSolveCount >= 12 && solvesWindow.length >= 12) {
    const ao12 = computeWindowAverageMs(solvesWindow.slice(-12));
    if (
      Number.isFinite(ao12) &&
      (newBestAo12Ms === null || ao12 < newBestAo12Ms)
    ) {
      newBestAo12Ms = ao12;
      newBestAo12StartIndex = newSolveCount - 12;
    }
  }

  const newStats = {
    solveCount: newSolveCount,
    totalTimeMs: newTotalTimeMs,
    overallAvgMs: newOverallAvgMs,
    bestSingleMs: newBestSingleMs,
    bestSingleDateTime: newBestSingleDateTime,
    bestAo5Ms: newBestAo5Ms,
    bestAo5StartIndex: newBestAo5StartIndex,
    bestAo12Ms: newBestAo12Ms,
    bestAo12StartIndex: newBestAo12StartIndex,
    lastSolveDateTime: newSolve.DateTime || newSolve.datetime || null,
    lastRecomputedAt: currentStats.lastRecomputedAt || null,
  };

  // 7. Save updated Stats
  const updateParams = {
    TableName: "PTS",
    Key: {
      PK: `USER#${userID}`,
      SK: `SESSION#${normalizedEvent}#${sessionID}`,
    },
    UpdateExpression: "SET #Stats = :stats",
    ExpressionAttributeNames: {
      "#Stats": "Stats",
    },
    ExpressionAttributeValues: {
      ":stats": newStats,
    },
    ReturnValues: "ALL_NEW",
  };

  const updateResult = await dynamoDB.update(updateParams).promise();
  console.log("✅ Incrementally updated Stats for session", {
    userID,
    event: normalizedEvent,
    sessionID,
    newStats,
  });

  return updateResult.Attributes;
};
