// server/scripts/copyTableCrossAccount.js
//
// Copy every item from the source table (personal AWS account, creds from
// server/.env) into one or more tables in another AWS account (creds from a
// named profile in ~/.aws/credentials). Target tables are created with the
// same key schema + GSIs if they don't exist.
//
// Items are copied as raw DynamoDB AttributeValues, so types (numbers, sets,
// binary, nested maps) are preserved exactly. Writes are idempotent puts, so
// the script is safe to re-run; it also checkpoints scan progress and resumes.
//
// Usage (from server/):
//   node scripts/copyTableCrossAccount.js --plan
//   node scripts/copyTableCrossAccount.js --create
//   node scripts/copyTableCrossAccount.js --copy
//   node scripts/copyTableCrossAccount.js --verify
//
// Options:
//   --source PTSProd              source table (default: PTS_TABLE from .env)
//   --targets PTSDev,PTSProd      target table names in the other account
//   --protect PTSProd             targets that get PITR + deletion protection
//   --profile pts-company         ~/.aws/credentials profile for the target account
//   --target-region us-east-1
//   --segments 8                  parallel scan segments
//   --reset                       ignore the saved checkpoint and start over
//   --target-endpoint URL         (testing) point the target at a local emulator
//   --max-pages N                 (testing) stop each segment after N scan pages

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  UpdateContinuousBackupsCommand,
  ScanCommand,
  BatchWriteItemCommand,
  waitUntilTableExists,
} = require("@aws-sdk/client-dynamodb");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const SOURCE_TABLE = args.source || process.env.PTS_TABLE || "PTSProd";
const SOURCE_REGION = process.env.AWS_REGION || "us-east-1";
const TARGETS = String(args.targets || "PTSDev,PTSProd").split(",").map((s) => s.trim()).filter(Boolean);
const PROTECT = new Set(String(args.protect || "PTSProd").split(",").map((s) => s.trim()).filter(Boolean));
const PROFILE = args.profile || "pts-company";
const TARGET_REGION = args["target-region"] || "us-east-1";
const SEGMENTS = Number(args.segments || 8);
const TARGET_ENDPOINT = args["target-endpoint"] || undefined;
const MAX_PAGES = args["max-pages"] ? Number(args["max-pages"]) : Infinity;
const CHECKPOINT = path.join(__dirname, `.copy-checkpoint-${SOURCE_TABLE}-${TARGETS.join("+")}.json`);

function readProfile(name) {
  const file = process.env.AWS_SHARED_CREDENTIALS_FILE || path.join(os.homedir(), ".aws", "credentials");
  if (!fs.existsSync(file)) throw new Error(`No credentials file at ${file}`);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let current = null;
  const out = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) {
      current = m[1].trim();
      continue;
    }
    if (current !== name) continue;
    const eq = line.indexOf("=");
    if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if (!out.aws_access_key_id || !out.aws_secret_access_key) {
    throw new Error(`Profile [${name}] not found (or missing keys) in ${file}`);
  }
  return {
    accessKeyId: out.aws_access_key_id,
    secretAccessKey: out.aws_secret_access_key,
    ...(out.aws_session_token ? { sessionToken: out.aws_session_token } : {}),
  };
}

const source = new DynamoDBClient({ region: SOURCE_REGION, maxAttempts: 10 });
let _target = null;
function target() {
  if (!_target) {
    _target = new DynamoDBClient({
      region: TARGET_REGION,
      credentials: readProfile(PROFILE),
      maxAttempts: 10,
      ...(TARGET_ENDPOINT ? { endpoint: TARGET_ENDPOINT } : {}),
    });
  }
  return _target;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function describe(client, table) {
  try {
    return (await client.send(new DescribeTableCommand({ TableName: table }))).Table;
  } catch (e) {
    if (e.name === "ResourceNotFoundException") return null;
    throw e;
  }
}

function createInputFrom(src, name) {
  const gsis = (src.GlobalSecondaryIndexes || []).map((g) => ({
    IndexName: g.IndexName,
    KeySchema: g.KeySchema,
    Projection: g.Projection,
  }));
  if (src.LocalSecondaryIndexes && src.LocalSecondaryIndexes.length) {
    throw new Error("Source has LSIs; this script doesn't handle them.");
  }
  return {
    TableName: name,
    KeySchema: src.KeySchema,
    AttributeDefinitions: src.AttributeDefinitions,
    BillingMode: "PAY_PER_REQUEST",
    ...(gsis.length ? { GlobalSecondaryIndexes: gsis } : {}),
    DeletionProtectionEnabled: PROTECT.has(name),
    Tags: [{ Key: "app", Value: "peelthestickers" }, { Key: "env", Value: /prod/i.test(name) ? "prod" : "dev" }],
  };
}

async function plan() {
  const src = await describe(source, SOURCE_TABLE);
  if (!src) throw new Error(`Source table ${SOURCE_TABLE} not found in ${SOURCE_REGION}`);
  console.log(`Source: ${src.TableArn}`);
  console.log(`  ~${src.ItemCount} items, ~${(src.TableSizeBytes / 1e6).toFixed(0)} MB, GSIs: ${(src.GlobalSecondaryIndexes || []).map((g) => g.IndexName).join(", ")}`);
  console.log(`Target profile [${PROFILE}] region ${TARGET_REGION}`);
  for (const name of TARGETS) {
    const t = await describe(target(), name);
    console.log(`  ${name}: ${t ? `exists (${t.TableStatus}) ${t.TableArn}` : "will be created"}${PROTECT.has(name) ? " [PITR + deletion protection]" : ""}`);
    if (t && t.TableArn.split(":")[4] === src.TableArn.split(":")[4]) {
      throw new Error(`Target ${name} is in the SAME account as the source — check the [${PROFILE}] profile.`);
    }
  }
  return src;
}

async function create() {
  const src = await plan();
  for (const name of TARGETS) {
    let t = await describe(target(), name);
    if (!t) {
      console.log(`Creating ${name}...`);
      await target().send(new CreateTableCommand(createInputFrom(src, name)));
    }
    await waitUntilTableExists({ client: target(), maxWaitTime: 900 }, { TableName: name });
    // GSIs are created with the table; wait until they're ACTIVE too.
    for (;;) {
      t = await describe(target(), name);
      const pending = (t.GlobalSecondaryIndexes || []).filter((g) => g.IndexStatus !== "ACTIVE");
      if (t.TableStatus === "ACTIVE" && !pending.length) break;
      await sleep(5000);
    }
    if (t.TableArn.split(":")[4] === src.TableArn.split(":")[4]) {
      throw new Error(`Target ${name} is in the SAME account as the source — aborting.`);
    }
    if (PROTECT.has(name)) {
      await target().send(
        new UpdateContinuousBackupsCommand({
          TableName: name,
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        })
      );
    }
    console.log(`  ${name} ACTIVE: ${t.TableArn}`);
  }
}

async function batchPut(table, items) {
  let pending = items.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; pending.length; attempt++) {
    const res = await target().send(new BatchWriteItemCommand({ RequestItems: { [table]: pending } }));
    pending = (res.UnprocessedItems && res.UnprocessedItems[table]) || [];
    if (pending.length) {
      if (attempt > 20) throw new Error(`Gave up on ${pending.length} unprocessed items in ${table}`);
      await sleep(Math.min(5000, 100 * 2 ** attempt));
    }
  }
}

async function runPool(tasks, concurrency) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (i < tasks.length) await tasks[i++]();
    })
  );
}

function loadCheckpoint() {
  if (args.reset || !fs.existsSync(CHECKPOINT)) return { segments: {} };
  const cp = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
  if (cp.totalSegments !== SEGMENTS) throw new Error(`Checkpoint used ${cp.totalSegments} segments; pass --segments ${cp.totalSegments} or --reset`);
  return cp;
}

async function copy() {
  await plan();
  for (const name of TARGETS) {
    const t = await describe(target(), name);
    if (!t || t.TableStatus !== "ACTIVE") throw new Error(`${name} isn't ACTIVE — run --create first`);
  }
  const cp = loadCheckpoint();
  cp.totalSegments = SEGMENTS;
  const save = () => fs.writeFileSync(CHECKPOINT, JSON.stringify(cp));
  let copied = Object.values(cp.segments).reduce((n, s) => n + (s.count || 0), 0);
  const started = Date.now();
  const tick = setInterval(() => {
    const secs = (Date.now() - started) / 1000;
    console.log(`  copied ${copied.toLocaleString()} items (${Math.round(copied / Math.max(secs, 1))}/s since start)`);
  }, 15000);

  try {
    await Promise.all(
      Array.from({ length: SEGMENTS }, async (_, seg) => {
        const state = (cp.segments[seg] = cp.segments[seg] || { count: 0, lastKey: undefined, done: false });
        let pages = 0;
        while (!state.done && pages++ < MAX_PAGES) {
          const page = await source.send(
            new ScanCommand({
              TableName: SOURCE_TABLE,
              Segment: seg,
              TotalSegments: SEGMENTS,
              ExclusiveStartKey: state.lastKey,
            })
          );
          const items = page.Items || [];
          const tasks = [];
          for (let i = 0; i < items.length; i += 25) {
            const chunk = items.slice(i, i + 25);
            for (const name of TARGETS) tasks.push(() => batchPut(name, chunk));
          }
          await runPool(tasks, 8);
          state.count += items.length;
          copied += items.length;
          state.lastKey = page.LastEvaluatedKey;
          state.done = !page.LastEvaluatedKey;
          save();
        }
      })
    );
  } finally {
    clearInterval(tick);
  }
  console.log(`Done: ${copied.toLocaleString()} items scanned from ${SOURCE_TABLE} into ${TARGETS.join(", ")} in ${Math.round((Date.now() - started) / 1000)}s`);
}

async function count(client, table) {
  const totals = await Promise.all(
    Array.from({ length: SEGMENTS }, async (_, seg) => {
      let n = 0;
      let key;
      do {
        const r = await client.send(
          new ScanCommand({ TableName: table, Select: "COUNT", Segment: seg, TotalSegments: SEGMENTS, ExclusiveStartKey: key })
        );
        n += r.Count || 0;
        key = r.LastEvaluatedKey;
      } while (key);
      return n;
    })
  );
  return totals.reduce((a, b) => a + b, 0);
}

async function verify() {
  await plan();
  const [srcCount, ...tgtCounts] = await Promise.all([count(source, SOURCE_TABLE), ...TARGETS.map((n) => count(target(), n))]);
  console.log(`${SOURCE_TABLE} (source): ${srcCount.toLocaleString()}`);
  TARGETS.forEach((n, i) => console.log(`${n} (target): ${tgtCounts[i].toLocaleString()} ${tgtCounts[i] === srcCount ? "✓" : `✗ (diff ${tgtCounts[i] - srcCount})`}`));
}

(async () => {
  if (args.create) await create();
  else if (args.copy) await copy();
  else if (args.verify) await verify();
  else await plan();
})().catch((e) => {
  console.error(`${e.name || "Error"}: ${e.message}`);
  process.exit(1);
});
