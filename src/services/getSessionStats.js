// src/services/getSessionStats.js
import { apiGet } from "./api.js";

export const getSessionStats = async (userID, event, sessionID) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("getSessionStats: userID required");
  if (!ev) throw new Error("getSessionStats: event required");

  const data = await apiGet(
    `/api/sessionStats/${encodeURIComponent(id)}?event=${encodeURIComponent(ev)}&sessionID=${encodeURIComponent(sid)}`
  );

  return data?.item ?? null;
};