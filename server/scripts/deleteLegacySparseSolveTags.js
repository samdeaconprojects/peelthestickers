require("dotenv").config();

const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");
const { batchWriteAll } = require("../lib/ptsCore");

const MAIN_TAG_PREFIXES = ["SOLVETAG#CubeModel#", "SOLVETAG#CrossColor#", "SOLVETAG#Method#"];

async function queryTagItems(userID, prefix) {
  let cursor = undefined;
  const items = [];

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :pfx)",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
          ":pfx": prefix,
        },
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    if (out.Items?.length) items.push(...out.Items);
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  return items;
}

async function main() {
  const [, , userIDRaw] = process.argv;
  const userID = String(userIDRaw || "").trim();

  if (!userID) {
    console.error("Usage: node scripts/deleteLegacySparseSolveTags.js <userID>");
    process.exit(1);
  }

  let deleted = 0;

  for (const prefix of MAIN_TAG_PREFIXES) {
    const items = await queryTagItems(userID, prefix);
    if (!items.length) continue;

    const requests = items.map((item) => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
      },
    }));

    await batchWriteAll(ddb, TABLE, requests);
    deleted += items.length;

    console.log(JSON.stringify({ prefix, deleted: items.length }));
  }

  console.log(JSON.stringify({ userID, deletedTotal: deleted }));
}

main().catch((err) => {
  console.error("deleteLegacySparseSolveTags failed:", err);
  process.exit(1);
});
