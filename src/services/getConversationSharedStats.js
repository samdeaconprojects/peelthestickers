import { apiGet } from "./api.js";

// Shared-session stats for one conversation. The server keeps a single copy
// on the conversation itself, so this is how an open chat stays current.
export const getConversationSharedStats = async (conversationID) => {
  const id = String(conversationID || "").trim();
  if (!id) throw new Error("getConversationSharedStats: conversationID required");
  const data = await apiGet(`/api/conversation/${encodeURIComponent(id)}/shared-stats`);
  return data?.sharedStats || null;
};
