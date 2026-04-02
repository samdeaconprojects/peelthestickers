import { apiGet } from "./api.js";

export async function getDayBuckets(
  userID,
  { event = "", mainOnly = false, startDay = "", endDay = "", timeZone = "" } = {}
) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getDayBuckets: userID required");

  const params = new URLSearchParams();
  const ev = String(event || "").trim().toUpperCase();
  if (ev) params.set("event", ev);
  if (mainOnly) params.set("mainOnly", "true");
  if (startDay) params.set("startDay", String(startDay).trim());
  if (endDay) params.set("endDay", String(endDay).trim());
  if (timeZone) params.set("timeZone", String(timeZone).trim());

  const query = params.toString();
  return apiGet(`/api/dayBuckets/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}
