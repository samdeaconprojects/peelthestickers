// src/services/getUser.js
import { apiGet } from "./api.js";

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return "";
}

function normalizeHexColor(value, fallback = "#2EC4B6") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const short = raw.slice(1);
    return `#${short[0]}${short[0]}${short[1]}${short[1]}${short[2]}${short[2]}`;
  }
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }

  return fallback;
}

function normalizeUserRecord(user) {
  if (!user || typeof user !== "object") return user;

  const derivedUserID = firstNonEmpty(
    user.UserID,
    user.userID,
    typeof user.PK === "string" && user.PK.startsWith("USER#") ? user.PK.slice(5) : "",
    user.Username,
    user.username,
    user.Name,
    user.name
  );

  const name = firstNonEmpty(user.Name, user.name, user.Username, user.username, derivedUserID);
  const username = firstNonEmpty(user.Username, user.username, derivedUserID, name);
  const profileEvent = firstNonEmpty(
    user.ProfileEvent,
    user.profileEvent,
    user.Event,
    user.event,
    "333"
  );
  const profileScramble = firstNonEmpty(
    user.ProfileScramble,
    user.profileScramble,
    user.AvatarScramble,
    user.avatarScramble,
    user.Scramble,
    user.scramble
  );

  return {
    ...user,
    UserID: derivedUserID,
    userID: user.userID ?? derivedUserID,
    Name: name,
    name: user.name ?? name,
    Username: username,
    username: user.username ?? username,
    Color: normalizeHexColor(user.Color ?? user.color),
    color: normalizeHexColor(user.color ?? user.Color),
    ProfileEvent: profileEvent,
    profileEvent: user.profileEvent ?? profileEvent,
    ProfileScramble: profileScramble,
    profileScramble: user.profileScramble ?? profileScramble,
    WCAID: firstNonEmpty(user.WCAID, user.wcaid),
    wcaid: firstNonEmpty(user.wcaid, user.WCAID),
  };
}

export const getUser = async (userID) => {
  const id = String(userID || "").trim();
  if (!id) throw new Error("getUser: userID required");
  const data = await apiGet(`/api/user/${encodeURIComponent(id)}`);
  return normalizeUserRecord(data?.user ?? null);
};
