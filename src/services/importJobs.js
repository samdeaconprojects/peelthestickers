import { apiGet, apiPost } from "./api";

export async function createImportJob({
  userID,
  format = "unknown",
  sourceKey = "",
  totalSolves = 0,
  totalChunks = 0,
  label = "",
  metadata = {},
} = {}) {
  return apiPost("/api/importJobs", {
    userID,
    format,
    sourceKey,
    totalSolves,
    totalChunks,
    label,
    metadata,
  });
}

export async function getImportJob(userID, jobID) {
  return apiGet(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}`);
}

export async function listImportJobs(userID, limit = 20) {
  return apiGet(`/api/importJobs/${encodeURIComponent(userID)}?limit=${encodeURIComponent(limit)}`);
}

export async function appendImportJobChunk(userID, jobID, { solves = [], sourceKey = "" } = {}) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/chunk`, {
    solves,
    sourceKey,
  });
}

export async function finalizeImportJob(userID, jobID) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/finalize`, {});
}

export async function cancelImportJob(userID, jobID) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/cancel`, {});
}
