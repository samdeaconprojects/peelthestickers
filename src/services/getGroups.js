import { apiGet } from "./api.js";

export const getGroups = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getGroups: userID required");

  const data = await apiGet(`/api/groups/${encodeURIComponent(id)}`);
  return Array.isArray(data?.items) ? data.items : [];
};
