// src/services/follow.js
// Follow lists (profile.Friends = following, Followers, FollowRequests) are
// only changed through these routes so both sides stay in sync.
import { apiDelete, apiPost } from "./api.js";
import { normalizeUserRecord } from "./getUser.js";

const enc = (id) => encodeURIComponent(String(id || "").trim());

function withUser(data) {
  return { ...data, user: data?.user ? normalizeUserRecord(data.user) : null };
}

// state: "following" | "friends" | "requested"
export const followUser = async (targetID) =>
  withUser(await apiPost(`/api/follow/${enc(targetID)}`, {}));

export const unfollowUser = async (targetID) =>
  withUser(await apiDelete(`/api/follow/${enc(targetID)}`));

export const respondToFollowRequest = async (userID, requesterID, accept) =>
  withUser(
    await apiPost(
      `/api/followRequests/${enc(userID)}/${enc(requesterID)}/${accept ? "accept" : "decline"}`,
      {}
    )
  );

export const removeFollower = async (userID, followerID) =>
  withUser(await apiDelete(`/api/followers/${enc(userID)}/${enc(followerID)}`));
