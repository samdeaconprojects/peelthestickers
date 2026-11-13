import { toApiUrl } from "./api";
import { getAuthToken } from "./auth";

export function createSocialEventSource(userID, { onEvent, onSync, onOpen, onError } = {}) {
  const id = String(userID || "").trim();
  if (!id || typeof window === "undefined" || typeof EventSource === "undefined") {
    return null;
  }

  // EventSource cannot send headers, so the token rides in the query string.
  const token = getAuthToken();
  if (!token) return null;
  const source = new EventSource(
    toApiUrl(
      `/api/notifications/stream/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`
    )
  );

  source.addEventListener("open", (event) => {
    onOpen?.(event);
  });

  source.addEventListener("social", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      onEvent?.(payload);
    } catch (error) {
      console.warn("Failed to parse social event payload:", error);
    }
  });

  // Solve/session changes made on the user's other devices (see publishSolveSync).
  if (typeof onSync === "function") {
    source.addEventListener("sync", (event) => {
      try {
        onSync(JSON.parse(event.data || "{}"));
      } catch (error) {
        console.warn("Failed to parse sync event payload:", error);
      }
    });
  }

  source.addEventListener("connected", (event) => {
    try {
      const payload = JSON.parse(event.data || "{}");
      onEvent?.(payload);
    } catch (error) {
      console.warn("Failed to parse social connection payload:", error);
    }
  });

  source.addEventListener("error", (event) => {
    onError?.(event);
  });

  return source;
}
