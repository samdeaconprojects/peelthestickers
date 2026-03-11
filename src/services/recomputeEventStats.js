// src/services/recomputeEventStats.js
export const recomputeEventStats = async (userID, event) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();

  if (!id) throw new Error("recomputeEventStats: userID is required");
  if (!ev) throw new Error("recomputeEventStats: event is required");

  const res = await fetch("/api/recomputeEventStats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      userID: id,
      event: ev,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `recomputeEventStats failed (${res.status})`);
  }

  const data = await res.json();
  if (!data?.item) {
    throw new Error("recomputeEventStats: server returned no item");
  }

  return data.item;
};