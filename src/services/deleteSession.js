import { apiDelete } from "./api.js";
import { invalidateSessionsCache } from "./getSessions.js";

export const deleteSession = async (userID, event, sessionID) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim();
  const sid = String(sessionID || "main").trim() || "main";

  if (!id) throw new Error("deleteSession: userID required");
  if (!ev) throw new Error("deleteSession: event required");
  if (!sid) throw new Error("deleteSession: sessionID required");

  const result = await apiDelete(
    `/api/session/${encodeURIComponent(id)}/${encodeURIComponent(ev)}/${encodeURIComponent(sid)}`
  );
  invalidateSessionsCache(id);
  return result;
};
