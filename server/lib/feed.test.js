const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFeed, toProfileCard } = require("./feed");

const post = (author, iso) => ({ SK: `POST#${iso}`, CreatedAt: iso, author });
const day = (n) => `2026-11-${String(n).padStart(2, "0")}T12:00:00.000Z`;

test("merges authors newest first and caps at limit", async () => {
  const posts = { a: [post("a", day(5)), post("a", day(1))], b: [post("b", day(3))] };
  const { items } = await buildFeed({
    authors: [{ userID: "a" }, { userID: "b" }],
    limit: 2,
    fetchPosts: async ({ userID }) => posts[userID],
  });
  assert.deepEqual(items.map((p) => p.CreatedAt), [day(5), day(3)]);
  assert.equal(items[0].AuthorID, "a");
});

test("stops reading authors whose last post is older than the cutoff", async () => {
  const authors = Array.from({ length: 300 }, (_, i) => ({
    userID: `u${i}`,
    lastPostAt: day(1 + (i % 20)),
  }));
  const read = new Set();
  const { items, authorsRead } = await buildFeed({
    authors,
    limit: 25,
    concurrency: 16,
    fetchPosts: async ({ userID, lastPostAt }) => {
      read.add(userID);
      return [post(userID, lastPostAt)];
    },
  });
  assert.equal(items.length, 25);
  assert.ok(authorsRead < 100, `read ${authorsRead}`);
  // The 25 newest must all be from day 20/19 (15 authors each per day bucket).
  assert.ok(items.every((p) => p.CreatedAt >= day(19)));
});

test("authors with no lastPostAt are always read", async () => {
  const authors = [
    ...Array.from({ length: 40 }, (_, i) => ({ userID: `new${i}`, lastPostAt: day(20) })),
    { userID: "legacy" },
  ];
  const { items } = await buildFeed({
    authors,
    limit: 5,
    concurrency: 8,
    fetchPosts: async ({ userID }) => [post(userID, userID === "legacy" ? day(25) : day(20))],
  });
  assert.equal(items[0].author, "legacy");
});

test("one author failing doesn't sink the feed", async () => {
  const { items } = await buildFeed({
    authors: [{ userID: "a" }, { userID: "b" }],
    fetchPosts: async ({ userID }) => {
      if (userID === "a") throw new Error("boom");
      return [post("b", day(2))];
    },
  });
  assert.equal(items.length, 1);
});

test("profile cards drop follow lists but keep counts", () => {
  const card = toProfileCard({ Name: "x", Friends: ["a"], Followers: ["b"], FollowRequests: [], FollowerCount: 1 });
  assert.equal(card.Friends, undefined);
  assert.equal(card.Followers, undefined);
  assert.equal(card.FollowerCount, 1);
});
