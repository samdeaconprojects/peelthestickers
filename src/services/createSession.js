import { apiPost } from "./api.js";

/**
 * Supports BOTH:
 *  - createSession(userID, event, sessionName)
 *  - createSession(userID, event, sessionID, sessionName, opts)
 */
export const createSession = async (userID, event, a3, a4, opts = {}) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase().trim();

  if (!id) throw new Error("createSession: userID required");
  if (!ev) throw new Error("createSession: event required");

  let sessionID;
  let sessionName;

  if (typeof a4 === "undefined") {
    sessionName = String(a3 || "").trim();
    if (!sessionName) throw new Error("createSession: sessionName required");

    sessionID = sessionName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "");
  } else {
    sessionID = String(a3 || "").trim();
    sessionName = String(a4 || "").trim();

    if (!sessionID) throw new Error("createSession: sessionID required");
    if (!sessionName) throw new Error("createSession: sessionName required");
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