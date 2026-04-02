import { apiGet } from "./api.js";

function normalizeSession(item) {
  if (!item || typeof item !== "object") return item;

  const sessionID = String(item.SessionID || item.sessionID || "").trim();
  const sessionName = String(
    item.SessionName || item.sessionName || item.Name || item.name || ""
  ).trim();

  if (sessionID !== "main") return item;

  if (!sessionName || sessionName === "Main Session") {
    return {
      ...item,
      SessionName: "Main",
    };
  }

  return item;
}

export const getSessions = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getSessions: userID required");

  const data = await apiGet(`/api/sessions/${encodeURIComponent(id)}`);
  return Array.isArray(data?.items) ? data.items.map(normalizeSession) : [];
};
