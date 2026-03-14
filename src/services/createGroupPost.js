import { apiPost } from "./api.js";

export const createGroupPost = async ({
  groupID,
  authorID,
  authorName = "",
  note = "",
  event = "",
  solveList = [],
  comments = [],
  postType = "solve",
  statShare = null,
} = {}) => {
  const gid = String(groupID || "").trim();
  if (!gid) throw new Error("createGroupPost: groupID required");

  const uid = String(authorID || "").trim();
  if (!uid) throw new Error("createGroupPost: authorID required");

  const data = await apiPost("/api/groupPost", {
    groupID: gid,
    authorID: uid,
    authorName: String(authorName || "").trim(),
    note,
    event,
    solveList,
    comments,
    postType,
    statShare,
  });

  return data?.item || null;
};
