import { toApiUrl } from "./api";

export function createSocialEventSource(userID, { onEvent, onOpen, onError } = {}) {
  const id = String(userID || "").trim();
  if (!id || typeof window === "undefined" || typeof EventSource === "undefined") {
    return null;
  }

  const source = new EventSource(
    toApiUrl(`/api/notifications/stream/${encodeURIComponent(id)}`)
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
