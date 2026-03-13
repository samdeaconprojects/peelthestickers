// src/services/getPosts.js
import { apiGet } from "./api.js";

function normalizePost(item) {
  if (!item || typeof item !== "object") return item;

  const timestamp =
    item.DateTime ||
    item.date ||
    item.CreatedAt ||
    (typeof item.SK === "string" && item.SK.startsWith("POST#") ? item.SK.slice(5) : null) ||
    null;

  return {
    ...item,
    Note: item.Note ?? item.note ?? "",
    Event: item.Event ?? item.event ?? "",
    SolveList: Array.isArray(item.SolveList) ? item.SolveList : Array.isArray(item.solveList) ? item.solveList : [],
    Comments: Array.isArray(item.Comments) ? item.Comments : Array.isArray(item.comments) ? item.comments : [],
    StatShare: item.StatShare ?? item.statShare ?? null,
    PostType: item.PostType || item.postType || (item.StatShare || item.statShare ? "stat-share" : "solve"),
    DateTime: timestamp,
    date: timestamp,
    CreatedAt: item.CreatedAt || timestamp,
  };
}

export const getPosts = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getPosts: userID required");
  const data = await apiGet(`/api/posts/${encodeURIComponent(id)}`);
  return (data?.items || []).map(normalizePost);
};
