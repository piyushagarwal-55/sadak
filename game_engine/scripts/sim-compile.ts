/**
 * Compiles a sentence into a world and then PLAYS a turn of it: npm run sim:compile
 *
 * The compile route and the turn route are only really connected by the
 * server-side cache, and a cache miss looks exactly like a working compiler
 * until somebody tries to talk to the person it invented.
 */
import { openingState, validateScenario, type Scenario, type WorldState } from "../lib/sim/schema";

async function main() {
  const request = process.argv.slice(2).join(" ") || "Sunday market shopping, vegetables and a gift";

  const compiled = await fetch("http://localhost:3000/api/sim/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request, cityId: "charminar-lane", language: "te-IN", difficulty: "intermediate" }),
  }).then((r) => r.json());

  if (compiled.error) { console.log("compile ERROR:", compiled.error); process.exit(1); }
  const scenario = compiled.scenario as Scenario;
  console.log(`\n"${request}"`);
  console.log(`  -> ${scenario.title}  [${scenario.archetype}]  generated=${compiled.generated}`);
  console.log(`  cast    : ${scenario.characters.map((c) => `${c.name} (${c.role})`).join(", ")}`);
  console.log(`  errands : ${scenario.missions.map((m) => m.title).join(" / ")}`);

  const issues = validateScenario(scenario);
  console.log(`  validates: ${issues.length ? issues.map((i) => i.path).join(", ") : "clean"}`);
  if (issues.length) process.exit(1);

  // Now talk to somebody in it. This is what proves the cache handover works.
  const who = scenario.characters[0];
  let state: WorldState = openingState(scenario, "compiled-probe");
  for (const said of ["నమస్కారం", "ఎంత?"]) {
    const j = await fetch("http://localhost:3000/api/sim/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterId: who.id, text: said, state, scenarioId: scenario.id }),
    }).then((r) => r.json());
    if (j.error) { console.log("  turn ERROR:", j.error); process.exit(1); }
    state = j.state;
    console.log(`\n  YOU  ${said}`);
    console.log(`  NPC  ${j.reply?.native}   [${j.act?.verb} ok=${j.act?.ok}]`);
  }
  console.log("\n  the compiled world is playable.\n");
}
main();
