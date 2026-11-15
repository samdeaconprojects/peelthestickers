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

// Background imports: stage every chunk (any order, safe to resend), then queue the job. The
// server writes the solves and finalizes on its own; the page can close.
export async function stageImportChunk(userID, jobID, index, solves) {
  return apiPost(
    `/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/stage`,
    { index, solves },
    { gzip: true }
  );
}

export async function queueImportJob(userID, jobID, totalChunks) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/queue`, {
    totalChunks,
  });
}

export function isActiveImportJob(job) {
  const status = String(job?.status || "").toUpperCase();
  return job?.mode === "background" && ["QUEUED", "RUNNING", "FINALIZING"].includes(status);
}

export async function finalizeImportJob(userID, jobID) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/finalize`, {});
}

export async function cancelImportJob(userID, jobID) {
  return apiPost(`/api/importJobs/${encodeURIComponent(userID)}/${encodeURIComponent(jobID)}/cancel`, {});
}
