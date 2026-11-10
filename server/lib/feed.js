// Home feed across everyone a user follows, built on the server so the
// client makes one request instead of two per followed account.
//
// Each author carries lastPostAt (the profile's LastPostAt, set when they
// post; never earlier than their newest post). Authors are read newest first
// in small waves, and reading stops once the remaining authors can't have
// anything newer than the posts already collected. An author with no
// lastPostAt (posted before the field existed) is always read.

function postTimestamp(post) {
  const raw =
    post?.CreatedAt ||
    (typeof post?.SK === "string" && post.SK.startsWith("POST#") ? post.SK.slice(5) : "");
  return String(raw || "");
}

function newestFirst(a, b) {
  const ta = postTimestamp(a);
  const tb = postTimestamp(b);
  return ta < tb ? 1 : ta > tb ? -1 : 0;
}

async function buildFeed({ authors = [], limit = 25, concurrency = 16, fetchPosts }) {
  const ordered = [...authors]
    .filter((a) => a && a.userID)
    .sort((a, b) => {
      // Unknown recency first, then newest.
      const ta = a.lastPostAt ? String(a.lastPostAt) : "￿";
      const tb = b.lastPostAt ? String(b.lastPostAt) : "￿";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });

  const collected = [];
  let authorsRead = 0;
  let i = 0;

  while (i < ordered.length) {
    if (collected.length >= limit) {
      collected.sort(newestFirst);
      const cutoff = postTimestamp(collected[limit - 1]);
      const next = ordered[i];
      if (next.lastPostAt && String(next.lastPostAt) < cutoff) break;
    }

    const wave = ordered.slice(i, i + concurrency);
    i += wave.length;
    const results = await Promise.all(
      wave.map(async (author) => {
        try {
          return (await fetchPosts(author, limit)) || [];
        } catch (err) {
          return [];
        }
      })
    );
    authorsRead += wave.length;
    results.forEach((posts, idx) => {
      for (const post of posts) collected.push({ ...post, AuthorID: post.AuthorID || wave[idx].userID });
    });
  }

  collected.sort(newestFirst);
  return { items: collected.slice(0, limit), authorsRead, authorsTotal: ordered.length };
}

// Fields a list row or feed card needs from someone else's profile. The follow
// lists are the bulk of a popular user's profile and no card shows them.
const CARD_DROP_FIELDS = ["Friends", "Followers", "FollowRequests"];

function toProfileCard(sanitizedProfile) {
  if (!sanitizedProfile) return null;
  const out = { ...sanitizedProfile };
  for (const field of CARD_DROP_FIELDS) delete out[field];
  return out;
}

module.exports = { buildFeed, toProfileCard, postTimestamp };
