require("dotenv").config();

const { QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../ddb");

function inferItemType(item) {
  const explicit = String(item?.ItemType || "").trim();
  if (explicit) return explicit;

  const sk = String(item?.SK || "").trim();
  if (!sk) return "UNKNOWN";

  const prefix = sk.split("#")[0];
  return prefix || "UNKNOWN";
}

function formatPercent(part, whole) {
  if (!whole) return "0.00%";
  return `${((part / whole) * 100).toFixed(2)}%`;
}

function printSummary(scopeLabel, counts, totalItems) {
  const entries = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });

  console.log(`Scope: ${scopeLabel}`);
  console.log(`Table: ${TABLE}`);
  console.log(`Total items: ${totalItems}`);

  const solveCount = counts.get("SOLVE") || 0;
  if (solveCount > 0) {
    console.log(`Solve items: ${solveCount}`);
    console.log(`Items per solve: ${(totalItems / solveCount).toFixed(2)}`);
  }

  console.log("");
  console.log("Counts by ItemType:");

  for (const [itemType, count] of entries) {
    console.log(
      `${itemType.padEnd(16)} ${String(count).padStart(10)}  ${formatPercent(count, totalItems)}`
    );
  }
}

async function countForUser(userID) {
  const counts = new Map();
  let totalItems = 0;
  let cursor = undefined;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `USER#${userID}`,
        },
        ProjectionExpression: "SK, ItemType",
        ExclusiveStartKey: cursor,
        Limit: 1000,
      })
    );

    for (const item of out.Items || []) {
      totalItems += 1;
      const itemType = inferItemType(item);
      counts.set(itemType, (counts.get(itemType) || 0) + 1);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  printSummary(`USER#${userID}`, counts, totalItems);
}

async function countWholeTable() {
  const counts = new Map();
  let totalItems = 0;
  let cursor = undefined;

  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        ProjectionExpression: "SK, ItemType",
        ExclusiveStartKey: cursor,
      })
    );

    for (const item of out.Items || []) {
      totalItems += 1;
      const itemType = inferItemType(item);
      counts.set(itemType, (counts.get(itemType) || 0) + 1);
    }

    cursor = out.LastEvaluatedKey;
  } while (cursor);

  printSummary("WHOLE_TABLE", counts, totalItems);
}

async function main() {
  const args = process.argv.slice(2);
  const wantsAll = args.includes("--all");
  const userID = args.find((arg) => arg && !arg.startsWith("--")) || "";

  if (!wantsAll && !userID) {
    console.error("Usage: node scripts/countItemsByType.js <userID>");
    console.error("   or: node scripts/countItemsByType.js --all");
    process.exit(1);
  }

  if (wantsAll) {
    await countWholeTable();
    return;
  }

  await countForUser(userID);
}

main().catch((err) => {
  console.error("countItemsByType failed:", err);
  process.exit(1);
});
