// Run with: npm test  (from server/)
const test = require("node:test");
const assert = require("node:assert");

const {
  getRelationship,
  canView,
  buildViewerAccess,
  sanitizeProfileForViewer,
  normalizePrivacy,
} = require("./visibility");

function profile(id, extra = {}) {
  return { PK: `USER#${id}`, SK: "PROFILE", Friends: [], Followers: [], ...extra };
}

test("relationship: self, friend, follower, public", () => {
  const alice = profile("alice", { Friends: ["bob"] });
  const bob = profile("bob", { Friends: ["alice"] });
  const carol = profile("carol", { Friends: ["alice"] });
  const dave = profile("dave");

  assert.strictEqual(getRelationship("alice", alice, alice), "self");
  assert.strictEqual(getRelationship("bob", alice, bob), "friend");
  assert.strictEqual(getRelationship("carol", alice, carol), "follower");
  assert.strictEqual(getRelationship("dave", alice, dave), "public");
  // Owner following the viewer alone is not enough.
  assert.strictEqual(getRelationship("bob", profile("x", { Friends: ["bob"] }), bob), "public");
  assert.strictEqual(getRelationship("dave", alice, dave, { isAdmin: true }), "self");
});

test("defaults: profile page public, full stats only for people shared with", () => {
  const owner = profile("alice");
  assert.deepStrictEqual(normalizePrivacy(undefined), {
    profileStats: "public",
    posts: "public",
    friendsList: "public",
    liveRoom: "followers",
    fullStats: "private",
    Version: 2,
  });

  assert.strictEqual(canView("profileStats", "public", owner), true);
  assert.strictEqual(canView("posts", "public", owner), true);
  assert.strictEqual(canView("liveRoom", "public", owner), false);
  assert.strictEqual(canView("liveRoom", "follower", owner), true);
  assert.strictEqual(canView("fullStats", "friend", owner), false);
  assert.strictEqual(canView("fullStats", "self", owner), true);
});

test("saved choices apply; unversioned (backfilled) maps fall back to defaults", () => {
  const backfilled = profile("alice", { Privacy: { posts: "followers", stats: "friends" } });
  assert.strictEqual(canView("posts", "public", backfilled), true);

  const owner = profile("alice", {
    Privacy: { Version: 2, posts: "friends", fullStats: "followers", bogus: "public" },
  });
  assert.strictEqual(canView("posts", "follower", owner), false);
  assert.strictEqual(canView("posts", "friend", owner), true);
  assert.strictEqual(canView("fullStats", "follower", owner), true);
  assert.strictEqual(canView("fullStats", "public", owner), false);
  // Invalid audiences fall back to the default.
  assert.strictEqual(normalizePrivacy({ Version: 2, posts: "everyone" }).posts, "public");
});

test("private account hides public sections from non-followers only", () => {
  const owner = profile("alice", { PrivateAccount: true });
  assert.strictEqual(canView("posts", "public", owner), false);
  assert.strictEqual(canView("profileStats", "public", owner), false);
  assert.strictEqual(canView("posts", "follower", owner), true);
});

test("StatsAllowedFriends grants full stats and profile stats, nothing else", () => {
  const owner = profile("alice", { StatsAllowedFriends: ["dave"], PrivateAccount: true });
  assert.strictEqual(canView("fullStats", "public", owner, "dave"), true);
  assert.strictEqual(canView("profileStats", "public", owner, "dave"), true);
  assert.strictEqual(canView("posts", "public", owner, "dave"), false);
  assert.strictEqual(canView("fullStats", "friend", owner, "erin"), false);
});

test("viewer access reports pending requests and follows-you", () => {
  const owner = profile("alice", { Friends: ["dave"], FollowRequests: ["dave"], PrivateAccount: true });
  const access = buildViewerAccess("dave", owner, profile("dave"));
  assert.strictEqual(access.relationship, "public");
  assert.strictEqual(access.followRequested, true);
  assert.strictEqual(access.followsYou, true);
  assert.strictEqual(access.canView.posts, false);
});

test("sanitize strips owner-only fields and hidden follow lists", () => {
  const owner = profile("alice", {
    Privacy: { Version: 2, friendsList: "friends" },
    Friends: ["bob", "carol"],
    Followers: ["bob", "carol", "dave"],
    FollowRequests: ["erin"],
    Settings: { theme: "dark" },
    TagConfig: { x: 1 },
    StatsAllowedFriends: ["bob", "dave"],
    Name: "Alice",
  });

  const asDave = sanitizeProfileForViewer(owner, "dave", profile("dave", { Friends: ["alice"] }));
  assert.strictEqual(asDave.Name, "Alice");
  assert.strictEqual(asDave.Settings, undefined);
  assert.strictEqual(asDave.TagConfig, undefined);
  assert.strictEqual(asDave.FollowRequests, undefined);
  assert.strictEqual(asDave.Privacy, undefined);
  assert.deepStrictEqual(asDave.StatsAllowedFriends, ["dave"]);
  assert.deepStrictEqual(asDave.Friends, []);
  assert.deepStrictEqual(asDave.Followers, []);
  assert.strictEqual(asDave.FollowingCount, 2);
  assert.strictEqual(asDave.FollowerCount, 3);
  assert.strictEqual(asDave.Viewer.relationship, "follower");

  const asBob = sanitizeProfileForViewer(owner, "bob", profile("bob", { Friends: ["alice"] }));
  assert.strictEqual(asBob.Viewer.relationship, "friend");
  assert.deepStrictEqual(asBob.Friends, ["bob", "carol"]);

  const asSelf = sanitizeProfileForViewer(owner, "alice", null);
  assert.deepStrictEqual(asSelf.Settings, { theme: "dark" });
  assert.deepStrictEqual(asSelf.FollowRequests, ["erin"]);
  assert.strictEqual(asSelf.Privacy.friendsList, "friends");
});

test("stat lists: visitors only get lists marked visible", () => {
  const owner = profile("alice", {
    StatLists: [
      { id: "saved", name: "Saved Stats", items: [{}], visible: true },
      { id: "list-a", name: "PBs", items: [{}], visible: true },
      { id: "list-b", name: "Practice", items: [{}] },
    ],
  });

  const forVisitor = sanitizeProfileForViewer(owner, "dave", profile("dave"));
  assert.deepStrictEqual(
    forVisitor.StatLists.map((list) => list.id),
    ["saved", "list-a"]
  );

  const forOwner = sanitizeProfileForViewer(owner, "alice", owner);
  assert.strictEqual(forOwner.StatLists.length, 3);
});
