import { apiGet } from "./api.js";

export async function getWcaCompetitions(userID) {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getWcaCompetitions: userID required");
  const data = await apiGet(`/api/wca/competitions/${encodeURIComponent(id)}`);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function getWcaCompetition(userID, competitionID) {
  const id = String(userID || "").trim();
  const compID = String(competitionID || "").trim();
  if (!id || !compID) throw new Error("getWcaCompetition: userID and competitionID required");
  return apiGet(
    `/api/wca/competitions/${encodeURIComponent(id)}/${encodeURIComponent(compID)}`
  );
}
