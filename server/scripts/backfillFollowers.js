require("dotenv").config();

// Builds every profile's Followers list from everyone's Friends (following)
// lists, and fills in the privacy defaults. Run once after deploying follows.
//
//   node scripts/backfillFollowers.js           # dry run, prints changes
//   node scripts/backfillFollowers.js --apply   # writes them

const { ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const { getFollowing, getFollowers, normalizePrivacy, profileUserID } = require("../lib/visibility");

const APPLY = process.argv.includes("--apply");

async function scanProfiles() {
  const profiles = [];
  let cursor;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: "SK = :sk",
        ExpressionAttributeValues: { ":sk": "PROFILE" },
        ExclusiveStartKey: cursor,
      })
    );
    profiles.push(...(out.Items || []));
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return profiles;
}

async function main() {
  const profiles = await scanProfiles();
  const byID = new Map(profiles.map((p) => [profileUserID(p), p]));

  const followersOf = new Map();
  for (const [id, p] of byID) {
    for (const target of getFollowing(p)) {
      if (!byID.has(target) || target === id) continue;
      if (!followersOf.has(target)) followersOf.set(target, new Set());
      followersOf.get(target).add(id);
    }
  }

  let changed = 0;
  for (const [id, p] of byID) {
    const next = Array.from(followersOf.get(id) || []).sort();
    const current = getFollowers(p).slice().sort();
    const needsFollowers = JSON.stringify(next) !== JSON.stringify(current);
    const needsDefaults = !p.Privacy || typeof p.PrivateAccount !== "boolean" || !Array.isArray(p.FollowRequests);
    if (!needsFollowers && !needsDefaults) continue;

    changed += 1;
    console.log(`${id}: followers ${current.length} -> ${next.length}${needsDefaults ? " (+privacy defaults)" : ""}`);
    if (!APPLY) continue;

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { PK: p.PK, SK: "PROFILE" },
        UpdateExpression:
          "SET Followers = :f, Privacy = :p, PrivateAccount = :pa, FollowRequests = :fr",
        ExpressionAttributeValues: {
          ":f": next,
          ":p": normalizePrivacy(p.Privacy),
          ":pa": p.PrivateAccount === true,
          ":fr": Array.isArray(p.FollowRequests) ? p.FollowRequests : [],
        },
      })
    );
  }

  console.log(`${profiles.length} profiles, ${changed} ${APPLY ? "updated" : "would change"}.`);
  if (!APPLY && changed) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
