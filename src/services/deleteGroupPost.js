import { apiDelete } from "./api.js";

export const deleteGroupPost = async (groupID, timestamp, userID) => {
  const gid = String(groupID || "").trim();
  if (!gid) throw new Error("deleteGroupPost: groupID required");

  const ts = String(timestamp || "").trim();
  if (!ts) throw new Error("deleteGroupPost: timestamp required");

  const uid = String(userID || "").trim();
  if (!uid) throw new Error("deleteGroupPost: userID required");

  return apiDelete(
    `/api/groupPost/${encodeURIComponent(gid)}/${encodeURIComponent(ts)}/${encodeURIComponent(uid)}`
  );
};
