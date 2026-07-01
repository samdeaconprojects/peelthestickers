import { apiPost } from "./api.js";
import { createConversation } from "./createConversation.js";

export const createGroup = async ({
  ownerID,
  name,
  memberIDs = [],
  color = "",
  photo = "",
  groupID = "",
  isJoinable = false,
  isStreamRoom = false,
} = {}) => {
  const owner = String(ownerID || "").trim();
  if (!owner) throw new Error("createGroup: ownerID required");

  const groupName = String(name || "").trim();
  if (!groupName) throw new Error("createGroup: name required");

  const members = Array.isArray(memberIDs)
    ? memberIDs.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  const data = await apiPost("/api/group", {
    ownerID: owner,
    name: groupName,
    memberIDs: members,
    color: String(color || "").trim(),
    photo: String(photo || "").trim(),
    groupID: String(groupID || "").trim(),
    isJoinable: isJoinable === true,
    isStreamRoom: isStreamRoom === true || isJoinable === true,
  }).catch(async (error) => {
    if (isJoinable === true || isStreamRoom === true) {
      throw new Error(
        `Room creation failed before the joinable room could be saved: ${error?.message || error}`
      );
    }

    const fallbackGroupID =
      String(groupID || "").trim() ||
      `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const conversationID = `GROUP#${fallbackGroupID}`;

    try {
      const fallbackConversation = await createConversation({
        conversationType: "GROUP",
        memberIDs: [owner, ...members],
        createdBy: owner,
        name: groupName,
        conversationID,
      });

      return {
        item: {
          GroupID: fallbackGroupID,
          Name: groupName,
          ConversationID: fallbackConversation?.item?.ConversationID || conversationID,
          IsJoinable: isJoinable === true,
          JoinCode: fallbackGroupID,
          IsStreamRoom: isStreamRoom === true || isJoinable === true,
          FallbackOnly: true,
        },
        members: fallbackConversation?.members || [],
        existed: !!fallbackConversation?.existed,
      };
    } catch (fallbackError) {
      const combined = new Error(
        `createGroup failed: ${error?.message || error}. Fallback conversation create also failed: ${fallbackError?.message || fallbackError}`
      );
      throw combined;
    }
  });

  return {
    item: data?.item || null,
    members: Array.isArray(data?.members) ? data.members : [],
    existed: !!data?.existed,
  };
};
