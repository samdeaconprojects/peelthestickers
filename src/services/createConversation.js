import { apiPost } from "./api.js";

export const createConversation = async ({
  conversationType = "DM",
  memberIDs = [],
  createdBy = "",
  name = "",
  conversationID = "",
} = {}) => {
  const members = Array.isArray(memberIDs)
    ? memberIDs.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (members.length < 2) {
    throw new Error("createConversation: at least 2 memberIDs required");
  }

  const data = await apiPost("/api/conversation", {
    conversationType,
    memberIDs: members,
    createdBy: String(createdBy || "").trim(),
    name: String(name || "").trim(),
    conversationID: String(conversationID || "").trim(),
  });

  return {
    item: data?.item || null,
    members: Array.isArray(data?.members) ? data.members : [],
    existed: !!data?.existed,
  };
};
