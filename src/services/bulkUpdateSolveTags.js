import { apiPost } from "./api.js";

export async function bulkUpdateSolveTags(userID, updates = []) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("bulkUpdateSolveTags: userID required");

  const normalizedUpdates = (Array.isArray(updates) ? updates : [])
    .map((entry) => ({
      solveRef: String(entry?.solveRef || "").trim(),
      tags: entry?.tags && typeof entry.tags === "object" ? entry.tags : {},
    }))
    .filter((entry) => entry.solveRef);

  if (!normalizedUpdates.length) return { ok: true, updated: 0, items: [] };

  return apiPost("/api/solves/bulk-tags", {
    userID: id,
    updates: normalizedUpdates,
  });
}
