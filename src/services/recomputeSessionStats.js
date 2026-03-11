// src/services/recomputeSessionStats.js
export const recomputeSessionStats = async (userID, event, sessionID) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "main");

  if (!id) throw new Error("recomputeSessionStats: userID is required");
  if (!ev) throw new Error("recomputeSessionStats: event is required");

  const res = await fetch("/api/recomputeSessionStats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      userID: id,
      event: ev,
      sessionID: sid,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `recomputeSessionStats failed (${res.status})`);
  }

  const data = await res.json();
  if (!data?.item) {
    throw new Error("recomputeSessionStats: server returned no item");
  }

  return data.item;
};