// src/services/auth.js
//
// Token storage plus the sign-up / sign-in calls. The token is attached to
// every request by services/api.js and to the notification stream URL by
// services/socialEvents.js.

import { apiGet, apiPost } from "./api.js";

const TOKEN_KEY = "pts.authToken";
export const AUTH_EXPIRED_EVENT = "pts:auth-expired";

export function getAuthToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, String(token));
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the session just won't survive a reload.
  }
}

export function clearAuthToken() {
  setAuthToken("");
}

// Called by api.js when the server answers 401. Clears the token and lets the
// app know so it can drop back to the signed-out state.
export function handleAuthExpired() {
  if (!getAuthToken()) return;
  clearAuthToken();
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  } catch {
    // Non-browser environment.
  }
}

export async function signUp(username, password) {
  const data = await apiPost("/api/auth/signup", { username, password });
  if (data?.token) setAuthToken(data.token);
  return data;
}

export async function signIn(username, password) {
  const data = await apiPost("/api/auth/signin", { username, password });
  if (data?.token) setAuthToken(data.token);
  return data;
}

export async function fetchMe() {
  if (!getAuthToken()) return null;
  return apiGet("/api/auth/me");
}

export async function changePassword(currentPassword, newPassword) {
  const data = await apiPost("/api/auth/password", { currentPassword, newPassword });
  if (data?.token) setAuthToken(data.token);
  return data;
}
