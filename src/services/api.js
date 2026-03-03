// src/services/api.js

// If REACT_APP_API_BASE is set (e.g. "https://api.ptstimer.com"), use it.
// Otherwise, use relative URLs so CRA proxy works in dev.
const API_BASE = (process.env.REACT_APP_API_BASE || "").trim().replace(/\/+$/, "");

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  const text = await res.text().catch(() => "");
  return { text };
}

function toUrl(path) {
  if (!path) return API_BASE || "";
  // absolute passthrough
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  // IMPORTANT: if no base, return relative path (this is the old working behavior)
  if (!API_BASE) return path;

  // base + path
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function apiGet(path) {
  const res = await fetch(toUrl(path), { headers: { Accept: "application/json" } });
  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = data?.error || data?.text || `GET ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function apiPost(path, body) {
  const res = await fetch(toUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = data?.error || data?.text || `POST ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function apiPut(path, body) {
  const res = await fetch(toUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = data?.error || data?.text || `PUT ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function apiDelete(path) {
  const res = await fetch(toUrl(path), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  const data = await parseResponse(res);

  if (!res.ok) {
    const msg = data?.error || data?.text || `DELETE ${path} failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}