import { apiPut } from "./api.js";

export const updateGroupPostComments = async (groupID, timestamp, userID, comments) => {
  const gid = String(groupID || "").trim();
  if (!gid) throw new Error("updateGroupPostComments: groupID required");

  const ts = String(timestamp || "").trim();
  if (!ts) throw new Error("updateGroupPostComments: timestamp required");

  const uid = String(userID || "").trim();
  if (!uid) throw new Error("updateGroupPostComments: userID required");

  if (!Array.isArray(comments)) {
    throw new Error("updateGroupPostComments: comments must be an array");
  }

  return apiPut(
    `/api/groupPostComments/${encodeURIComponent(gid)}/${encodeURIComponent(ts)}`,
    {
      userID: uid,
      comments,
    }
  );
};
