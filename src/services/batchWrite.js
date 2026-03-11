// src/services/batchWrite.js
import { apiPost } from "./api";

const MAX_REQUESTS_PER_CALL = 200;

export async function batchWrite({ requests = [] } = {}) {
  if (!Array.isArray(requests) || requests.length === 0) return { wrote: 0, ok: true };

  let wrote = 0;

  for (let i = 0; i < requests.length; i += MAX_REQUESTS_PER_CALL) {
    const chunk = requests.slice(i, i + MAX_REQUESTS_PER_CALL);
    const out = await apiPost("/api/batchWrite", { requests: chunk });
    wrote += out?.wrote ?? 0;
  }

  return { wrote, ok: true };
}

export const putReq = (Item) => ({ PutRequest: { Item } });
export const delReq = (Key) => ({ DeleteRequest: { Key } });
