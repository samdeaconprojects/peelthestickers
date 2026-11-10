import { apiGet } from "./api.js";

export async function getDayBuckets(
  userID,
  { event = "", events = [], mainOnly = false, startDay = "", endDay = "", timeZone = "" } = {}
) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getDayBuckets: userID required");

  const params = new URLSearchParams();
  const ev = String(event || "").trim().toUpperCase();
  const evList = (Array.isArray(events) ? events : [])
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);
  // A list of events returns per-day buckets merged across them (plus eventItems).
  if (evList.length) params.set("events", evList.join(","));
  else if (ev) params.set("event", ev);
  if (mainOnly) params.set("mainOnly", "true");
  if (startDay) params.set("startDay", String(startDay).trim());
  if (endDay) params.set("endDay", String(endDay).trim());
  if (timeZone) params.set("timeZone", String(timeZone).trim());

  const query = params.toString();
  return apiGet(`/api/dayBuckets/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
}
