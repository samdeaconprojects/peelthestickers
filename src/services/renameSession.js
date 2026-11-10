import { apiPut } from "./api.js";
import { invalidateSessionsCache } from "./getSessions.js";

export const renameSession = async (userID, event, sessionID, sessionName) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").trim();
  const sid = String(sessionID || "main").trim() || "main";
  const name = String(sessionName || "").trim();

  if (!id) throw new Error("renameSession: userID required");
  if (!ev) throw new Error("renameSession: event required");
  if (!name) throw new Error("renameSession: sessionName required");

  const data = await apiPut(
    `/api/session/${encodeURIComponent(id)}/${encodeURIComponent(ev)}/${encodeURIComponent(sid)}`,
    { sessionName: name }
  );
  invalidateSessionsCache(id);
  return data?.item;
};
