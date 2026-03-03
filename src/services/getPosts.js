// src/services/getPosts.js
import { apiGet } from "./api.js";

export const getPosts = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getPosts: userID required");
  const data = await apiGet(`/api/posts/${encodeURIComponent(id)}`);
  return data?.items || [];
};