// src/services/getSolvesBySession.js
import { apiGet } from "./api.js";

export const getSolvesBySessionPage = async (
  userID,
  event,
  sessionID,
  limit = 200,
  cursor = null
) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("getSolvesBySessionPage: userID required");
  if (!ev) throw new Error("getSolvesBySessionPage: event required");

  const qs = new URLSearchParams({
    event: ev,
    sessionID: sid,
    limit: String(limit),
  });

  if (cursor) qs.set("cursor", JSON.stringify(cursor));

  const data = await apiGet(`/api/solves/${encodeURIComponent(id)}?${qs.toString()}`);

  return {
    items: data?.items || [],
    lastKey: data?.lastKey || null,
  };
};

export const getSolvesBySession = async (userID, event, sessionID) => {
  let cursor = null;
  const all = [];

  do {
    const { items, lastKey } = await getSolvesBySessionPage(userID, event, sessionID, 1000, cursor);
    if (items?.length) all.push(...items);
    cursor = lastKey || null;
  } while (cursor);

  return all.reverse();
};

export const getLastNSolvesBySession = async (userID, event, sessionID, n = 100) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  const qs = new URLSearchParams({
    event: ev,
    sessionID: sid,
    n: String(n),
  });

  const data = await apiGet(`/api/solvesLastN/${encodeURIComponent(id)}?${qs.toString()}`);
  return (data?.items || []).reverse();
};

export const getLastNSolvesByEvent = async (userID, event, n = 100) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  const qs = new URLSearchParams({
    event: ev,
    n: String(n),
  });

  const data = await apiGet(`/api/solvesLastN/${encodeURIComponent(id)}?${qs.toString()}`);
  return (data?.items || []).reverse();
};
