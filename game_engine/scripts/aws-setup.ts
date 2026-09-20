/**
 * Create the DynamoDB tables: npm run aws:setup
 *
 * Idempotent — run it as often as you like. It creates what is missing, leaves
 * what exists, and tells you which is which.
 *
 * WHY A SCRIPT AND NOT A CONSOLE CLICK
 *
 * Because the schema of a table is part of the program, and a schema that only
 * exists as somebody's memory of which buttons they pressed is a schema nobody
 * can review, diff, or recreate in a second account the morning of a demo. The
 * IAM policy in docs/AWS.md grants `CreateTable` scoped to exactly these two
 * names for this reason, and cannot make a table called anything else.
 *
 * ON-DEMAND BILLING, DELIBERATELY
 *
 * `PAY_PER_REQUEST` rather than provisioned capacity. A hackathon project has
 * no steady load to provision for — it has nothing at all for six days and then
 * forty people at once — and provisioned throughput would be both more
 * expensive at rest and throttled at exactly the wrong moment.
 */
import { config } from "dotenv";
config();

import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  UpdateTimeToLiveCommand,
} from "@aws-sdk/client-dynamodb";
import { LEARNER_TABLE, SCENARIO_TABLE, configured, tableRegion } from "../lib/sim/aws/dynamo";

// The same function the app reads with, not a parallel copy of the rule. A
// script that creates tables in one region while the app looks in another is a
// bug that only appears in production and only says "table not found".
const region = tableRegion();

type Spec = {
  name: string;
  key: string;
  /** The attribute DynamoDB watches to expire rows, if this table expires any. */
  ttl?: string;
  what: string;
};

const TABLES: Spec[] = [
  {
    name: SCENARIO_TABLE,
    key: "id",
    ttl: "expiresAt",
    what: "compiled worlds, so a generated scenario outlives the instance that built it",
  },
  {
    name: LEARNER_TABLE,
    key: "id",
    what: "what each learner can already do, per language",
  },
];

async function ensure(c: DynamoDBClient, t: Spec): Promise<void> {
  let exists = false;
  try {
    const d = await c.send(new DescribeTableCommand({ TableName: t.name }));
    console.log(`  exists   ${t.name}  (${d.Table?.TableStatus})`);
    exists = true;
  } catch (err) {
    if ((err as Error).name !== "ResourceNotFoundException") throw err;
  }

  if (!exists) {
    await c.send(
      new CreateTableCommand({
        TableName: t.name,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: t.key, AttributeType: "S" }],
        KeySchema: [{ AttributeName: t.key, KeyType: "HASH" }],
      })
    );
    console.log(`  created  ${t.name}  — ${t.what}`);

    // TTL cannot be set while the table is still CREATING, and the table is
    // usable long before that call would succeed. Poll rather than sleep a
    // guessed number of seconds.
    for (let i = 0; i < 30; i++) {
      const d = await c.send(new DescribeTableCommand({ TableName: t.name }));
      if (d.Table?.TableStatus === "ACTIVE") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ALWAYS, not just on the table this run created.
  //
  // This used to return early when the table already existed, which made the
  // script a liar: the first run failed to set TTL for want of an IAM action,
  // printed the fix, and then no amount of re-running could ever apply it —
  // the one path that would have retried was the one path that could no longer
  // be reached. "Idempotent" has to mean converging on the desired state, not
  // just declining to crash.
  if (t.ttl) await ensureTtl(c, t.name, t.ttl);
}

/**
 * Turn TTL on, and be able to say why if it will not go on.
 *
 * Asked for unconditionally rather than read first with DescribeTimeToLive,
 * because reading needs its own IAM action and the answer would only ever
 * change this to the same call. An already-enabled table says so, in an error,
 * which is a fine way to learn it.
 */
async function ensureTtl(c: DynamoDBClient, table: string, attr: string): Promise<void> {
  try {
    await c.send(
      new UpdateTimeToLiveCommand({
        TableName: table,
        TimeToLiveSpecification: { Enabled: true, AttributeName: attr },
      })
    );
    console.log(`           ttl on "${attr}" — old worlds delete themselves`);
  } catch (err) {
    const e = err as Error;
    if (/already enabled/i.test(e.message)) {
      console.log(`           ttl already on "${attr}"`);
      return;
    }
    // A table without TTL grows. That is a bill, not a bug — `restore()`
    // checks expiresAt itself — so this must not fail a setup that worked.
    if (e.name === "AccessDeniedException") {
      console.warn(
        `           ttl NOT enabled: the IAM policy is missing dynamodb:UpdateTimeToLive.\n` +
          `           Add it (docs/AWS.md) and re-run this. Nothing is broken meanwhile;\n` +
          `           old worlds just stay in the table instead of expiring.`
      );
      return;
    }
    console.warn(`           ttl could not be enabled: ${e.message}`);
  }
}

async function main() {
  if (!configured()) {
    console.error(
      "\n  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set in game_engine/.env.\n" +
        "  See docs/AWS.md.\n"
    );
    process.exit(1);
  }

  console.log(`\n  region ${region}\n`);
  const c = new DynamoDBClient({ region });
  for (const t of TABLES) await ensure(c, t);
  console.log("\n  Done.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.name}: ${err.message}\n`);
  process.exit(1);
});
