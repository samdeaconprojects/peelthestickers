import { apiGet } from "./api.js";

export const getSessions = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getSessions: userID required");

  const data = await apiGet(`/api/sessions/${encodeURIComponent(id)}`);
  return Array.isArray(data?.items) ? data.items : [];
};