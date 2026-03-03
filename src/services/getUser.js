// src/services/getUser.js
import { apiGet } from "./api.js";

export const getUser = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getUser: userID required");
  const data = await apiGet(`/api/user/${encodeURIComponent(id)}`);
  return data?.user ?? null;
};