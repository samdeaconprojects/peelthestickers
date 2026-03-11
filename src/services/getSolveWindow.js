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
  const sid = String(sessionID || "main").trim() || "main";
  const ref = String(startSolveRef || "").trim();
  const count = Math.max(1, Math.min(50, Number(n || 5)));

  if (!id) throw new Error("getSolveWindowFromStart: userID required");
  if (!ev) throw new Error("getSolveWindowFromStart: event required");
  if (!ref) throw new Error("getSolveWindowFromStart: startSolveRef required");

  const qs = new URLSearchParams({
    event: ev,
    sessionID: sid,
    startSolveRef: ref,
    n: String(count),
  });

  const out = await apiGet(`/api/solveWindow/${encodeURIComponent(id)}?${qs.toString()}`);
  return out?.items || [];
};
