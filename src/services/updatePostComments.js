// src/services/updatePostComments.js
import { apiPut } from "./api.js";

export const updatePostComments = async (userID, timestamp, comments) => {
  const id = String(userID || "").trim();
  const ts = String(timestamp || "").trim();

  if (!id) throw new Error("updatePostComments: userID required");
  if (!ts) throw new Error("updatePostComments: timestamp required");

  return apiPut(`/api/postComments/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`, {
    comments,
  });
};