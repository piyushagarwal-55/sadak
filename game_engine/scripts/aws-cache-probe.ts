/**
 * Does a compiled world outlive the instance that built it? npm run aws:cache
 *
 * This is the bug the third tier exists for, reproduced honestly: remember a
 * scenario, then destroy BOTH of the tiers in front of DynamoDB — the in-memory
 * Map and the file on disk — and ask for it back. That is exactly what a second
 * serverless instance sees, and before the third tier existed the answer was
 * null, which surfaces to a player as every turn 404ing with "Unknown
 * character" and reads as a broken microphone.
 *
 * It deletes the disk file for real rather than mocking the miss. A test that
 * simulates the failure it is testing proves the simulation.
 */
import { config } from "dotenv";
config();

import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { recallScenario, rememberScenario } from "../lib/sim/compile/cache";
import { configured } from "../lib/sim/aws/dynamo";
import { SCENARIOS } from "../lib/sim/scenarios";
import type { Scenario } from "../lib/sim/schema";

const ok = (b: boolean, s: string) => console.log(`  ${b ? "PASS" : "FAIL"}  ${s}`);

async function main() {
  if (!configured()) {
    console.error("\n  AWS is not configured; nothing to prove. See docs/AWS.md.\n");
    process.exit(1);
  }

  const id = `gen-probe${Date.now().toString(36)}`;
  const scenario: Scenario = { ...SCENARIOS[0], id };

  console.log(`\n  scenario ${id}\n`);

  rememberScenario(scenario);
  ok(Boolean(await recallScenario(id)), "readable straight away (memory)");

  // `archive` is deliberately not awaited by `rememberScenario` — the compile
  // path should not wait on Mumbai — so the write is genuinely in flight here.
  await new Promise((r) => setTimeout(r, 2500));

  // Tier 1 and tier 2, gone. This is the whole test.
  const MEMORY = (globalThis as unknown as Record<symbol, Map<string, Scenario>>)[
    Symbol.for("sadak.sim.scenarioCache")
  ];
  MEMORY.delete(id);
  rmSync(join(tmpdir(), "sadak-sim-scenarios", `${id}.json`), { force: true });
  ok(!MEMORY.has(id), "memory cleared and the file deleted");

  const t0 = Date.now();
  const back = await recallScenario(id);
  const ms = Date.now() - t0;

  ok(Boolean(back), `came back from DynamoDB in ${ms}ms`);
  ok(back?.id === id, "and it is the same world");
  ok(Boolean(back?.missions?.length), `with its ${back?.missions?.length ?? 0} missions intact`);
  ok(MEMORY.has(id), "and it is back in memory, so the next turn is free");

  // An id nobody ever stored must not resolve, or the cache is answering
  // questions it was never asked and every typo becomes a world.
  ok((await recallScenario(`gen-nope${Date.now().toString(36)}`)) === null, "an unknown id is still null");

  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
