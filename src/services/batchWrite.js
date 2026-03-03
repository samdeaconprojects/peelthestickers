// src/services/batchWrite.js
import { apiPost } from "./api";

export async function batchWrite({ requests = [] } = {}) {
  if (!Array.isArray(requests) || requests.length === 0) return { wrote: 0, ok: true };
  const out = await apiPost("/api/batchWrite", { requests }); // ✅ no tableName
  return { wrote: out.wrote ?? 0, ok: !!out.ok };
}

export const putReq = (Item) => ({ PutRequest: { Item } });
export const delReq = (Key) => ({ DeleteRequest: { Key } });