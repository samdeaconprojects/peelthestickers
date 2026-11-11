// server/scripts/backfillUsernameIndex.js
//
// Adds USERNAME#<lowercase> -> UserID items for accounts created before
// usernames were case-insensitive, so nobody can sign up as "Sam" next to an
// existing "sam". Safe to re-run: it never overwrites an existing index item.
// Accounts with a password (AUTH) claim their name before profile-only ones.
//
//   AWS_PROFILE=pts-company node scripts/backfillUsernameIndex.js --table PTSDev --dry-run
//   AWS_PROFILE=pts-company node scripts/backfillUsernameIndex.js --table PTSProd

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const args = process.argv.slice(2);
const table = args[args.indexOf("--table") + 1];
const dryRun = args.includes("--dry-run");
if (!args.includes("--table") || !table || table.startsWith("--")) {
  console.error("usage: node scripts/backfillUsernameIndex.js --table <TableName> [--dry-run]");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" })
);

async function scanAccounts() {
  const auth = new Set();
  const profiles = new Set();
  const segments = 8;
  await Promise.all(
    [...Array(segments).keys()].map(async (segment) => {
      let key;
      do {
        const out = await ddb.send(
          new ScanCommand({
            TableName: table,
            Segment: segment,
            TotalSegments: segments,
            ExclusiveStartKey: key,
            ProjectionExpression: "PK, SK",
            FilterExpression: "SK IN (:a, :p) AND begins_with(PK, :u)",
            ExpressionAttributeValues: { ":a": "AUTH", ":p": "PROFILE", ":u": "USER#" },
          })
        );
        for (const item of out.Items || []) {
          const userID = String(item.PK).slice(5);
          (item.SK === "AUTH" ? auth : profiles).add(userID);
        }
        key = out.LastEvaluatedKey;
      } while (key);
    })
  );
  return { auth, profiles };
}

(async () => {
  console.log(`${dryRun ? "[dry run] " : ""}Backfilling username index in ${table}`);
  const { auth, profiles } = await scanAccounts();
  const ordered = [...auth, ...[...profiles].filter((id) => !auth.has(id))];
  const claimed = new Map(); // lower -> userID
  let written = 0;
  let existed = 0;
  const conflicts = [];

  for (const userID of ordered) {
    const lower = userID.toLowerCase();
    if (claimed.has(lower)) {
      if (claimed.get(lower) !== userID) conflicts.push([lower, claimed.get(lower), userID]);
      continue;
    }
    claimed.set(lower, userID);
    if (dryRun) continue;
    try {
      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: {
            PK: `USERNAME#${lower}`,
            SK: "USERNAME",
            ItemType: "USERNAME_INDEX",
            UserID: userID,
            CreatedAt: new Date().toISOString(),
            Backfilled: true,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        })
      );
      written += 1;
    } catch (e) {
      if (e?.name !== "ConditionalCheckFailedException") throw e;
      existed += 1;
    }
  }

  console.log(
    `accounts: ${auth.size} with password, ${profiles.size} profiles; ` +
      `${dryRun ? `would write ${claimed.size}` : `wrote ${written}, already indexed ${existed}`}`
  );
  if (conflicts.length) {
    console.log("Names that differ only by case (first one keeps the name, others sign in by exact spelling):");
    for (const [lower, kept, other] of conflicts) console.log(`  ${lower}: kept ${kept}, also ${other}`);
  }
})().catch((e) => {
  console.error("FAILED:", e.name, e.message);
  process.exit(1);
});
