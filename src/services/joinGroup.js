import { apiPost } from "./api.js";

export const joinGroup = async ({ userID, groupID = "", roomCode = "" } = {}) => {
  const id = String(userID || "").trim();
  const code = String(groupID || roomCode || "").trim();

  if (!id) throw new Error("joinGroup: userID required");
  if (!code) throw new Error("joinGroup: room code required");

  const data = await apiPost("/api/group/join", {
    userID: id,
    groupID: code,
  });

  return {
    item: data?.item || null,
    members: Array.isArray(data?.members) ? data.members : [],
    existed: !!data?.existed,
  };
};
