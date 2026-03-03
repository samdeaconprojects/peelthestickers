// src/services/createPost.js
import { apiPost } from "./api.js";

export const createPost = async (userID, note, event, solveList, comments) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("createPost: userID required");

  const data = await apiPost("/api/post", {
    userID: id,
    note,
    event,
    solveList,
    comments,
  });

  return data?.item;
};