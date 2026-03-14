import { apiPost } from "./api.js";

export async function syncWcaImport(userID, payload = {}) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("syncWcaImport: userID required");

  const data = await apiPost("/api/wca/import", {
    userID: id,
    ...payload,
  });

  return data || {};
}
