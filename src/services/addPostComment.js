// src/services/addPostComment.js
//
// Adds one comment to a post. The server fills in the author from the
// signed-in user and returns the post's full comment list.
import { apiPost } from "./api.js";

export const addPostComment = async (ownerUserID, timestamp, text) => {
  const id = String(ownerUserID || "").trim();
  const ts = String(timestamp || "").trim();
  if (!id) throw new Error("addPostComment: ownerUserID required");
  if (!ts) throw new Error("addPostComment: timestamp required");

  return apiPost(`/api/postComments/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`, {
    text,
  });
};

export const addGroupPostComment = async (groupID, timestamp, text) => {
  const gid = String(groupID || "").trim();
  const ts = String(timestamp || "").trim();
  if (!gid) throw new Error("addGroupPostComment: groupID required");
  if (!ts) throw new Error("addGroupPostComment: timestamp required");

  return apiPost(
    `/api/groupPostComments/${encodeURIComponent(gid)}/${encodeURIComponent(ts)}`,
    { text }
  );
};
