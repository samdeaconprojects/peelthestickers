import { apiGet } from "./api.js";

export const getSolveWindowFromStart = async (
  userID,
  event,
  sessionID,
  startSolveRef,
  n = 5
) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase().trim();
  const hasSessionScope = sessionID != null && String(sessionID).trim() !== "";
  const sid = hasSessionScope ? String(sessionID).trim() : "";
  const ref = String(startSolveRef || "").trim();
  const count = Math.max(1, Math.min(1000, Number(n || 5)));

  if (!id) throw new Error("getSolveWindowFromStart: userID required");
  if (!ev) throw new Error("getSolveWindowFromStart: event required");
  if (!ref) throw new Error("getSolveWindowFromStart: startSolveRef required");

  const qs = new URLSearchParams({
    event: ev,
    startSolveRef: ref,
    n: String(count),
  });
  if (sid) qs.set("sessionID", sid);

  const out = await apiGet(`/api/solveWindow/${encodeURIComponent(id)}?${qs.toString()}`);
  return out?.items || [];
};
