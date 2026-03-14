export const recomputeTagStats = async (
  userID,
  { event, sessionID = "", tagKey, tagValue } = {}
) => {
  const id = String(userID || "").trim();
  const ev = String(event || "").toUpperCase();
  const sid = String(sessionID || "").trim();
  const key = String(tagKey || "").trim();
  const value = String(tagValue || "").trim();

  if (!id) throw new Error("recomputeTagStats: userID is required");
  if (!ev) throw new Error("recomputeTagStats: event is required");
  if (!key) throw new Error("recomputeTagStats: tagKey is required");
  if (!value) throw new Error("recomputeTagStats: tagValue is required");

  const res = await fetch("/api/recomputeTagStats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userID: id,
      event: ev,
      sessionID: sid,
      tagKey: key,
      tagValue: value,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `recomputeTagStats failed (${res.status})`);
  }

  const data = await res.json();
  if (!data?.item) {
    throw new Error("recomputeTagStats: server returned no item");
  }
  return data.item;
};
