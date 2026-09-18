import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Scenario } from "../schema";
import { SCENARIO_TABLE, budget, dynamo } from "../aws/dynamo";

/**
 * COMPILED SCENARIOS, SERVER-SIDE.
 *
 * A generated scenario is not in the authored registry, so the turn route
 * cannot look it up by id — and the obvious shortcut, having the browser post
 * the whole scenario with every turn, gives away the thing this architecture
 * exists to protect. A client that can send its own `Scenario` can send one
 * whose tomato floor is ₹1, and `vet()` would enforce it perfectly, because
 * `vet()` enforces the scenario it is handed.
 *
 * So the compiler keeps it here and hands the browser an id.
 *
 * WHY THIS TOUCHES THE DISK
 *
 * It was a Map in module scope, and that failed in the most confusing way
 * available: compile a world, restart the dev server, reload the page, and the
 * browser still holds the scenario in `sessionStorage` while the server has
 * forgotten it. Every turn then 404s with "Unknown character", which looks like
 * a broken microphone rather than a missing cache entry. A file survives the
 * restart, and a hackathon laptop restarts its dev server a great deal.
 *
 * It is also the right trade for a DEMO specifically. `sim_spec_cache` exists
 * in the migrations and is where this belongs in production, but it puts a
 * network round trip in the turn path, and venue wifi is already the largest
 * risk in the room. Disk has no such failure mode.
 *
 * The in-memory Map stays in front of it as the fast path, hung off
 * `globalThis` because Next gives each route handler its own module graph in
 * development and a plain module-level Map is written by one route and read —
 * empty — by another.
 *
 * AND WHY THERE IS NOW A THIRD TIER BEHIND BOTH
 *
 * Everything above is still true and none of it changed. What it does not
 * cover is deployment. `tmpdir()` on a serverless host belongs to one instance
 * and dies with it, so the failure this file was written to fix — compile a
 * world, lose it, every turn 404s with "Unknown character" and it reads as a
 * broken microphone — comes back in production STRONGER than it ever was
 * locally, because there is no restart to blame it on. Two requests landing on
 * two instances is enough.
 *
 * So DynamoDB sits behind the disk, and the order matters: memory, then disk,
 * then the network, and the network is only ever reached on a genuine miss —
 * which is precisely the case where the alternative is not a slower answer but
 * no answer at all. The turn path on a warm instance still touches nothing but
 * a Map. The paragraph above about venue wifi was right, and this does not
 * contradict it; it just declines to let it be the reason a deployed build is
 * broken.
 *
 * All of it is optional. With no AWS configured, `archive` and `restore` do
 * nothing and this file behaves exactly as it did before.
 */

const KEY = Symbol.for("sadak.sim.scenarioCache");
type Store = Map<string, Scenario>;
const globalRef = globalThis as unknown as Record<symbol, Store | undefined>;
const MEMORY: Store = (globalRef[KEY] ??= new Map());

const DIR = join(tmpdir(), "sadak-sim-scenarios");
/** Older than this and a scenario nobody is playing any more. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const LIMIT = 200;

function ensureDir(): boolean {
  try {
    mkdirSync(DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/** Ids are ours (`gen-<base36>`), but this is the file system. */
function safe(id: string): string | null {
  return /^[a-z0-9-]{1,64}$/i.test(id) ? id : null;
}

export function rememberScenario(scenario: Scenario): Scenario {
  MEMORY.set(scenario.id, scenario);
  const name = safe(scenario.id);
  if (name && ensureDir()) {
    try {
      writeFileSync(join(DIR, `${name}.json`), JSON.stringify(scenario), "utf8");
      sweep();
    } catch {
      // The memory copy still works for this process. A cache that cannot
      // write is slower to recover, not broken.
    }
  }
  // Not awaited, and the caller stays synchronous. The compile route has
  // already spent seconds in a model; making the player wait on Mumbai as well
  // to durably store something they can currently play from memory would be
  // paying the cost of the third tier on the one path that does not need it.
  void archive(scenario);
  return scenario;
}

export async function recallScenario(id: string | undefined): Promise<Scenario | null> {
  if (!id) return null;
  const hit = MEMORY.get(id);
  if (hit) return hit;

  const name = safe(id);
  if (!name) return null;
  try {
    const scenario = JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as Scenario;
    if (scenario?.missions?.length) {
      MEMORY.set(id, scenario);
      return scenario;
    }
  } catch {
    /* fall through to the network — a cold instance has no file to read */
  }

  const stored = await restore(name);
  if (stored) MEMORY.set(id, stored);
  return stored;
}

/** Old worlds should stop costing money. Twelve hours, same as the sweep. */
function expiryEpochSeconds(): number {
  return Math.floor((Date.now() + MAX_AGE_MS) / 1000);
}

/**
 * Put a compiled world somewhere an instance that has never seen it can find it.
 *
 * Never throws. A world that failed to archive is playable right now on this
 * instance and will fail later somewhere else — which is exactly what happened
 * before this function existed, so it cannot be a regression, and it is not
 * worth failing a compile that otherwise succeeded.
 */
async function archive(scenario: Scenario): Promise<void> {
  const db = dynamo();
  if (!db) return;
  try {
    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    await db.send(
      new PutCommand({
        TableName: SCENARIO_TABLE,
        Item: {
          id: scenario.id,
          scenario: JSON.stringify(scenario),
          expiresAt: expiryEpochSeconds(),
        },
      }),
      { abortSignal: budget() }
    );
  } catch (err) {
    console.warn("[sim] could not archive scenario:", (err as Error).message.slice(0, 120));
  }
}

async function restore(id: string): Promise<Scenario | null> {
  const db = dynamo();
  if (!db) return null;
  try {
    const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
    const out = await db.send(
      new GetCommand({ TableName: SCENARIO_TABLE, Key: { id } }),
      { abortSignal: budget() }
    );

    const row = out.Item as { scenario?: string; expiresAt?: number } | undefined;
    if (!row?.scenario) return null;

    // Checked here rather than left to DynamoDB's TTL. TTL deletes on its own
    // schedule — within days, not at the second — and a world that came back
    // three days stale would be handed to `tuneScenario` as if it were fresh.
    // This also means the whole thing stays correct on an account where TTL was
    // never enabled, which is the account we have.
    if (row.expiresAt && row.expiresAt * 1000 < Date.now()) return null;

    const scenario = JSON.parse(row.scenario) as Scenario;
    return scenario?.missions?.length ? scenario : null;
  } catch (err) {
    console.warn("[sim] could not restore scenario:", (err as Error).message.slice(0, 120));
    return null;
  }
}

/** Oldest out first. A directory that only grows is a leak with a nicer name. */
function sweep() {
  try {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const path = join(DIR, f);
        return { path, at: statSync(path).mtimeMs };
      })
      .sort((a, b) => b.at - a.at);

    const now = Date.now();
    for (const [i, f] of files.entries()) {
      if (i >= LIMIT || now - f.at > MAX_AGE_MS) unlinkSync(f.path);
    }
  } catch {
    /* a sweep that fails is a directory that is slightly too big */
  }
}
