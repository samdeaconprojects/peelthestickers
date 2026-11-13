// One random ID per open tab (per page load). Sent with every API request as
// X-PTS-Client so the server can tag sync messages with the tab that caused them,
// and this tab can ignore its own echoes. Not stored: a reload is a new tab.
function makeClientTabID() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const CLIENT_TAB_ID = makeClientTabID();
