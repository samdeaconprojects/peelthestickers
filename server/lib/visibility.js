// server/lib/visibility.js
//
// Who may see which parts of a profile. Pure functions so the rules can be
// tested without DynamoDB; server.js loads the two profiles and calls these.
//
// Social model:
//   - profile.Friends is the list of accounts this user FOLLOWS (the name is
//     kept for compatibility with existing data and client code).
//   - profile.Followers is the reverse list, maintained by the follow routes.
//   - A "friend" is a mutual follow.
//   - profile.PrivateAccount: follows become requests in profile.FollowRequests
//     until approved, and non-followers only see the profile card.
//   - profile.Privacy: per-section audience, see PRIVACY_SECTIONS.
//   - profile.StatsAllowedFriends: people the owner shares full stats with.

const AUDIENCES = ["public", "followers", "friends", "private"];

// Rank of each relationship; a viewer may see a section when their rank is at
// least the rank its audience needs.
const RELATIONSHIP_RANK = { public: 0, follower: 1, friend: 2, self: 3 };
const AUDIENCE_RANK = { public: 0, followers: 1, friends: 2, private: 3 };

// profileStats: the stat cards on the profile page (recent solves only).
// fullStats: the whole stats page, as the owner sees it.
// Defaults: the profile page is public, full stats only go to people the owner
// shares with (StatsAllowedFriends).
const PRIVACY_SECTIONS = {
  profileStats: "public",
  posts: "public",
  friendsList: "public",
  liveRoom: "followers",
  fullStats: "private",
};

// Privacy maps saved before this version were written by a backfill, not by
// the user, so they are ignored in favour of the defaults.
const PRIVACY_VERSION = 2;

// Sections a StatsAllowedFriends grant opens regardless of relationship.
const STATS_GRANT_SECTIONS = new Set(["profileStats", "fullStats"]);

// Profile fields only the owner ever receives.
const OWNER_ONLY_FIELDS = ["Settings", "TagConfig", "FollowRequests", "Privacy", "StatsAllowedFriends"];

function cleanIDList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((id) => String(id || "").trim()).filter(Boolean)));
}

function profileUserID(profile) {
  const pk = String(profile?.PK || "");
  if (pk.startsWith("USER#")) return pk.slice(5);
  return String(profile?.UserID || "").trim();
}

function getFollowing(profile) {
  return cleanIDList(profile?.Friends);
}

function getFollowers(profile) {
  return cleanIDList(profile?.Followers);
}

function getFollowRequests(profile) {
  return cleanIDList(profile?.FollowRequests);
}

function normalizePrivacy(privacy) {
  const out = { ...PRIVACY_SECTIONS, Version: PRIVACY_VERSION };
  if (!privacy || typeof privacy !== "object" || privacy.Version !== PRIVACY_VERSION) return out;
  for (const section of Object.keys(PRIVACY_SECTIONS)) {
    const audience = String(privacy[section] || "").trim();
    if (AUDIENCES.includes(audience)) out[section] = audience;
  }
  return out;
}

// relationship of viewer to owner: "self" | "friend" | "follower" | "public".
// Following is read from the viewer's own list so the answer does not depend on
// the owner's Followers list being in sync.
function getRelationship(viewerID, ownerProfile, viewerProfile, { isAdmin = false } = {}) {
  const viewer = String(viewerID || "").trim();
  const owner = profileUserID(ownerProfile);
  if (isAdmin || (viewer && viewer === owner)) return "self";
  if (!viewer || !owner) return "public";

  const viewerFollowsOwner = getFollowing(viewerProfile).includes(owner);
  if (!viewerFollowsOwner) return "public";
  const ownerFollowsViewer = getFollowing(ownerProfile).includes(viewer);
  return ownerFollowsViewer ? "friend" : "follower";
}

function canView(section, relationship, ownerProfile, viewerID = "") {
  if (relationship === "self") return true;
  if (!Object.prototype.hasOwnProperty.call(PRIVACY_SECTIONS, section)) return false;

  if (
    STATS_GRANT_SECTIONS.has(section) &&
    viewerID &&
    cleanIDList(ownerProfile?.StatsAllowedFriends).includes(String(viewerID).trim())
  ) {
    return true;
  }

  // A private account shows nothing but the profile card to non-followers.
  if (ownerProfile?.PrivateAccount === true && relationship === "public") return false;

  const audience = normalizePrivacy(ownerProfile?.Privacy)[section];
  const rank = RELATIONSHIP_RANK[relationship] ?? 0;
  return rank >= AUDIENCE_RANK[audience];
}

function buildViewerAccess(viewerID, ownerProfile, viewerProfile, opts = {}) {
  const relationship = getRelationship(viewerID, ownerProfile, viewerProfile, opts);
  const access = {};
  for (const section of Object.keys(PRIVACY_SECTIONS)) {
    access[section] = canView(section, relationship, ownerProfile, viewerID);
  }
  return {
    relationship,
    followsYou: getFollowing(ownerProfile).includes(String(viewerID || "").trim()),
    followRequested: getFollowRequests(ownerProfile).includes(String(viewerID || "").trim()),
    canView: access,
  };
}

// The profile as the viewer may see it. The owner gets everything; others lose
// owner-only fields and, without friendsList access, the follow lists (counts
// stay).
function sanitizeProfileForViewer(ownerProfile, viewerID, viewerProfile, opts = {}) {
  if (!ownerProfile) return null;
  const viewer = buildViewerAccess(viewerID, ownerProfile, viewerProfile, opts);
  const following = getFollowing(ownerProfile);
  const followers = getFollowers(ownerProfile);

  const out = {
    ...ownerProfile,
    FollowingCount: following.length,
    FollowerCount: followers.length,
    PrivateAccount: ownerProfile.PrivateAccount === true,
    Viewer: viewer,
  };

  if (viewer.relationship === "self") {
    out.Privacy = normalizePrivacy(ownerProfile.Privacy);
    return out;
  }

  const viewerIDTrim = String(viewerID || "").trim();
  const grantedStats = cleanIDList(ownerProfile.StatsAllowedFriends).includes(viewerIDTrim);
  for (const field of OWNER_ONLY_FIELDS) delete out[field];
  // Clients check StatsAllowedFriends.includes(me); keep only that answer.
  out.StatsAllowedFriends = grantedStats ? [viewerIDTrim] : [];

  if (!viewer.canView.friendsList) {
    out.Friends = [];
    out.Followers = [];
  }
  // Stat lists are private unless the owner marked them visible.
  if (Array.isArray(ownerProfile.StatLists)) {
    out.StatLists = ownerProfile.StatLists.filter((list) => list && list.visible === true);
  }
  return out;
}

module.exports = {
  AUDIENCES,
  PRIVACY_SECTIONS,
  PRIVACY_VERSION,
  cleanIDList,
  profileUserID,
  getFollowing,
  getFollowers,
  getFollowRequests,
  normalizePrivacy,
  getRelationship,
  canView,
  buildViewerAccess,
  sanitizeProfileForViewer,
};
