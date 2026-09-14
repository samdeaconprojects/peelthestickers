import { apiGet, apiPost } from "./api.js";

// Client for the "Live Room" broadcast feature: a host keeps solving
// normally with "Go Live" on, and anyone who joins (from the host's
// profile) gets a live feed of the host's exact scrambles plus a small
// leaderboard. Separate from the group/battle messaging system.

export const openRoom = async ({ hostID, hostName = "", hostColor = "", event = "333" } = {}) => {
  const id = String(hostID || "").trim();
  if (!id) throw new Error("openRoom: hostID required");

  const data = await apiPost("/api/room/open", {
    hostID: id,
    hostName: String(hostName || id).trim(),
    hostColor: String(hostColor || "").trim(),
    event: String(event || "333").trim(),
  });

  return data?.item || null;
};

export const closeRoom = async ({ roomID, hostID } = {}) => {
  const id = String(roomID || "").trim();
  const host = String(hostID || "").trim();
  if (!id) throw new Error("closeRoom: roomID required");
  if (!host) throw new Error("closeRoom: hostID required");

  return apiPost(`/api/room/${encodeURIComponent(id)}/close`, { hostID: host });
};

export const publishRoomScramble = async ({ roomID, hostID, index, event, scramble } = {}) => {
  const id = String(roomID || "").trim();
  const host = String(hostID || "").trim();
  if (!id) throw new Error("publishRoomScramble: roomID required");
  if (!host) throw new Error("publishRoomScramble: hostID required");
  if (!Number.isFinite(Number(index))) throw new Error("publishRoomScramble: index required");
  if (!String(scramble || "").trim()) throw new Error("publishRoomScramble: scramble required");

  return apiPost(`/api/room/${encodeURIComponent(id)}/scramble`, {
    hostID: host,
    index: Number(index),
    event: String(event || "333").trim(),
    scramble: String(scramble || "").trim(),
  });
};

export const getRoomByHost = async (hostID) => {
  const id = String(hostID || "").trim();
  if (!id) return null;
  const data = await apiGet(`/api/room/byHost/${encodeURIComponent(id)}`);
  return data?.item ? { ...data.item, memberCount: data.memberCount || 0 } : null;
};

export const joinRoom = async ({ roomID, userID, name = "", color = "" } = {}) => {
  const id = String(roomID || "").trim();
  const uid = String(userID || "").trim();
  if (!id) throw new Error("joinRoom: roomID required");
  if (!uid) throw new Error("joinRoom: userID required");

  const data = await apiPost(`/api/room/${encodeURIComponent(id)}/join`, {
    userID: uid,
    name: String(name || uid).trim(),
    color: String(color || "").trim(),
  });

  return {
    item: data?.item || null,
    scrambles: Array.isArray(data?.scrambles) ? data.scrambles : [],
    leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard : [],
  };
};

export const leaveRoom = async ({ roomID, userID } = {}) => {
  const id = String(roomID || "").trim();
  const uid = String(userID || "").trim();
  if (!id || !uid) return;
  return apiPost(`/api/room/${encodeURIComponent(id)}/leave`, { userID: uid });
};

export const reportRoomSolve = async ({ roomID, userID, index, time = null } = {}) => {
  const id = String(roomID || "").trim();
  const uid = String(userID || "").trim();
  if (!id || !uid) return;
  if (!Number.isFinite(Number(index))) return;

  return apiPost(`/api/room/${encodeURIComponent(id)}/solve`, {
    userID: uid,
    index: Number(index),
    time,
  });
};

export const getRoomState = async (roomID, fromIndex = 0) => {
  const id = String(roomID || "").trim();
  if (!id) return null;
  const data = await apiGet(
    `/api/room/${encodeURIComponent(id)}/state?fromIndex=${Math.max(0, Number(fromIndex) || 0)}`
  );
  return {
    item: data?.item || null,
    scrambles: Array.isArray(data?.scrambles) ? data.scrambles : [],
    leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard : [],
  };
};

export const getRoomLeaderboard = async (roomID) => {
  const id = String(roomID || "").trim();
  if (!id) return [];
  const data = await apiGet(`/api/room/${encodeURIComponent(id)}/leaderboard`);
  return Array.isArray(data?.leaderboard) ? data.leaderboard : [];
};
