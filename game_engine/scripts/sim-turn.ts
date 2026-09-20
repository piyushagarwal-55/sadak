/**
 * Walks a scripted conversation against the LIVE turn route: npm run sim:turn
 *
 * The smoke test proves the engine in isolation; this proves the whole loop —
 * prompt, Groq, the action layer, the ladder, the assent gate — against a
 * server that is actually running. It is the only way to catch the class of bug
 * that lives between a correct engine and a model that does not read: a clerk
 * quoting a fixed fare five turns running, or a price spoken that differs from
 * the price charged.
 *
 *   npm run sim:turn                 the bazaar haggle, in authored phrases
 *   npm run sim:turn -- station      the ticket counter
 *   npm run sim:turn -- free         the bazaar in sentences nobody wrote down
 *
 * The `free` script is the one that matters now. Not one of its lines is in the
 * phrase bank, so if the conversation still gets to a sale, the gate really is
 * the language and the meaning rather than a list of strings. Run it twice: the
 * seed is random per run and the vendor is meant to be different company each
 * time, so two identical transcripts would mean the obstacle deck is dead
 * again.
 */
import { SCENARIOS } from "../lib/sim/scenarios";
import { openingState, validateScenario, type WorldState } from "../lib/sim/schema";

const SCRIPTS: Record<string, { who: string; lines: string[] }> = {
  free: {
    who: "lakshmi",
    lines: [
      "నమస్కారం అమ్మా, ఎలా ఉన్నారు?",
      "టమాటా ధర ఎంత చెప్పండి",
      "అబ్బా, అంత ఇవ్వలేను, కొంచెం తగ్గించండి",
      "రెండు కిలోలు కావాలి",
      "అలాగే, ప్యాక్ చేయండి",
    ],
  },
  "hyderabad-bazaar": {
    who: "lakshmi",
    lines: ["నమస్కారం", "కిలో ఎంత?", "చాలా ఎక్కువ, కొంచెం తగ్గించండి", "సరే, ఇస్తాను"],
  },
  "hyderabad-station": {
    who: "srinivas",
    lines: ["నమస్కారం", "సికింద్రాబాద్ కి ఒక టికెట్", "రెండు టికెట్లు", "ఏ ప్లాట్‌ఫారం?"],
  },
};

async function main() {
  const want = process.argv[2] ?? "bazaar";
  const scenario =
    want === "free"
      ? SCENARIOS.find((s) => s.id.includes("bazaar"))!
      : (SCENARIOS.find((s) => s.id.includes(want)) ?? SCENARIOS[0]);
  const script = want === "free" ? SCRIPTS.free : SCRIPTS[scenario.id];
  // A different market day per invocation, exactly as the browser draws one.
  const seed = Number(process.env.SIM_SEED ?? Math.floor(Math.random() * 997));
  // SIM_BAND=advanced puts the woman ahead of you in the queue into the
  // exchange. There is no other way to see her: the band is what decides.
  const difficulty = process.env.SIM_BAND ?? "intermediate";
  console.log(`seed ${seed} · ${difficulty}`);

  const issues = validateScenario(scenario);
  console.log(`\n${scenario.title} — validation ${issues.length ? "FAILED" : "clean"}`);
  if (issues.length) {
    console.log(issues.map((i) => `  ${i.path}: ${i.problem}`).join("\n"));
    process.exit(1);
  }

  let state: WorldState = openingState(scenario, "probe");
  for (const said of script.lines) {
    const res = await fetch("http://localhost:3000/api/sim/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characterId: script.who,
        text: said,
        state,
        scenarioId: scenario.id,
        seed,
        difficulty,
        baseLang: process.env.SIM_BASE ?? "en-IN",
      }),
    });
    const j = await res.json();
    if (j.error) {
      console.log("ERROR", j.error);
      process.exit(1);
    }
    state = j.state;
    console.log(`\nYOU  ${said}`);
    console.log(`NPC  ${j.reply?.native}`);
    console.log(`     ${j.reply?.roman ?? ""}`);
    console.log(`     = ${j.reply?.en ?? "(no meaning came back)"}`);
    if (j.aside) console.log(`     ${j.aside.name}: ${j.aside.native}`);
    console.log(
      `     heard=${j.heard ?? "-"}  act=${j.act?.verb}/${j.act?.target ?? "-"} ok=${j.act?.ok}` +
        `${j.act?.reason ? ` (${j.act.reason})` : ""}  ${j.turn?.points ?? "-"}% ${j.turn?.label ?? ""}` +
        `  wallet=₹${state.facts.wallet}`
    );
  }
  console.log("\nmissions :", JSON.stringify(state.missions));
  console.log("functions:", JSON.stringify(state.functions));
}
main();
