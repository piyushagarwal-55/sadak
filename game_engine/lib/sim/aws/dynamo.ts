/**
 * The DynamoDB client, and the decision about whether there is one at all.
 *
 * WHY THIS IS ALLOWED A DEPENDENCY WHEN BEDROCK WAS NOT
 *
 * `bedrock.ts` says it: "If this ever moves to IAM role credentials, that is
 * when the SDK earns its place, and not before." Bedrock uses a bearer token,
 * so it is one `Authorization` header and a `fetch`. DynamoDB uses an IAM key
 * pair, which means SigV4 — a canonical request, a signed header set, a payload
 * hash and a derived key, all of which fail silently and identically when they
 * are subtly wrong. Hand-rolling that to save a package is how a demo dies at
 * 2am to a trailing newline.
 *
 * EVERYTHING HERE IS OPTIONAL, ON PURPOSE
 *
 * `table()` returns null when AWS is not configured, and every caller treats
 * null as "carry on without me". That is not defensive habit — it is the only
 * way the laptop with no `.env` and the deployed instance can run the same
 * code, and it means adding AWS cannot regress a machine that does not use it.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Hung off `globalThis` for the same reason the scenario cache's Map is: Next
 * gives each route handler its own module graph in development, so a plain
 * module-level singleton is constructed once per route and the connection reuse
 * this exists for never happens.
 */
const KEY = Symbol.for("sadak.aws.dynamo");
const ref = globalThis as unknown as Record<symbol, DynamoDBDocumentClient | null | undefined>;

/**
 * Where the TABLES are, which is not the same question as where this code runs.
 *
 * `AWS_REGION` is deliberately not consulted. On Lambda — and therefore on
 * Amplify's SSR compute — the runtime sets it automatically to the *function's*
 * region, so reading it would point the client at whichever region the app
 * happened to be deployed in and then report `ResourceNotFoundException` for
 * tables that plainly exist. That is a very slow thing to debug from a log line
 * that says a table is missing.
 *
 * The tables were created in ap-south-1 by `npm run aws:setup` and that is a
 * property of them, not of the caller. `SADAK_DDB_REGION` overrides it for
 * anyone who ran the setup script somewhere else — and it is not `AWS_`
 * prefixed on purpose, because Amplify reserves that prefix.
 */
export function tableRegion(): string {
  return process.env.SADAK_DDB_REGION || "ap-south-1";
}

/**
 * Is there any way to reach AWS from here?
 *
 * This used to ask only "are there static keys in the environment", which is
 * true on a laptop with a `.env` and FALSE on Amplify, Lambda and ECS — where
 * there are no keys to find because the compute has a role instead. It would
 * have disabled DynamoDB precisely in production, which is the one place the
 * third cache tier is load-bearing: `tmpdir()` there belongs to one instance,
 * so without this every compiled world 404s on the second request. The bug
 * would have shipped looking like a broken microphone, which is the exact
 * failure that tier was written to prevent.
 *
 * So: keys, or any of the markers a role-bearing AWS runtime sets. Still a
 * check rather than an unconditional yes, because a laptop with no AWS at all
 * should not spend `READ_BUDGET_MS` discovering that on every compile.
 */
export function configured(): boolean {
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) return true;
  return Boolean(
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_WEB_IDENTITY_TOKEN_FILE
  );
}

export function dynamo(): DynamoDBDocumentClient | null {
  if (ref[KEY] !== undefined) return ref[KEY] ?? null;
  if (!configured()) return (ref[KEY] = null);

  const base = new DynamoDBClient({
    region: tableRegion(),
    // Two attempts, not the SDK's default three. This sits behind two caches
    // that already answered for most of a year; a third attempt is a third
    // second of a player staring at a stalled microphone, and the fallback is
    // "compile it again", which is worse but finite.
    maxAttempts: 2,
  });

  return (ref[KEY] = DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  }));
}

export const SCENARIO_TABLE = process.env.AWS_TABLE_SCENARIOS || "sadak-scenarios";
export const LEARNER_TABLE = process.env.AWS_TABLE_LEARNER || "sadak-learner";

/**
 * A ceiling on how long the turn path will wait for AWS.
 *
 * The cache this backs is read on the way into a turn, so every millisecond
 * here is a millisecond of silence after somebody finishes speaking. Two
 * seconds is long enough for Mumbai on a bad connection and short enough that
 * giving up still leaves the request inside its own budget.
 */
export const READ_BUDGET_MS = 2000;

export function budget(ms = READ_BUDGET_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
