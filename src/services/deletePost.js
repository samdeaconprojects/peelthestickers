// src/services/deletePost.js
import { apiDelete } from "./api.js";

export const deletePost = async (userID, timestamp) => {
  const id = String(userID || "").trim();
  const ts = String(timestamp || "").trim();
  if (!id) throw new Error("deletePost: userID required");
  if (!ts) throw new Error("deletePost: timestamp required");

  return apiDelete(`/api/post/${encodeURIComponent(id)}/${encodeURIComponent(ts)}`);
};