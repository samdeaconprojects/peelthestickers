// src/services/createSession.js
import { apiPost } from "./api.js";

/**
 * Supports BOTH:
 *  - createSession(userID, event, sessionName)
 *  - createSession(userID, event, sessionID, sessionName, opts)
 */
export const createSession = async (userID, event, a3, a4, opts = {}) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  if (!id) throw new Error("createSession: userID required");
  if (!ev) throw new Error("createSession: event required");

  let sessionID;
  let sessionName;

  if (typeof a4 === "undefined") {
    sessionName = a3;
    sessionID = String(sessionName).toLowerCase().replace(/\s+/g, "-");
  } else {
    sessionID = a3;
    sessionName = a4;
  }

  const data = await apiPost("/api/session", {
    userID: id,
    event: ev,
    sessionID,
    sessionName,
    opts,
  });

  return data?.item;
};