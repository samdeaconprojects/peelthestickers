// src/services/updateUser.js
import { apiPut } from "./api.js";

export const updateUser = async (userID, updates) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("updateUser: userID required");
  if (!updates || typeof updates !== "object") throw new Error("updateUser: updates required");

  const data = await apiPut(`/api/user/${encodeURIComponent(id)}`, { updates });
  return data?.item;
};