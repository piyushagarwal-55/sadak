import { NextResponse } from "next/server";
import { validateScenario, type Scenario } from "@/lib/sim/schema";
import { recallScenario, rememberScenario } from "@/lib/sim/compile/cache";
import { scenarioById } from "@/lib/sim/scenarios";

export const runtime = "nodejs";

/**
 * TAKE BACK A WORLD THE SERVER HAS FORGOTTEN.
 *
 * The browser keeps the compiled scenario in `sessionStorage` so it can draw
 * it; the server keeps the authoritative copy so nobody can quietly rewrite a
 * floor price. When those two fall out of step — a deploy, a dev restart, a
 * cache older than the sweep — the player is left holding a world they can see
 * and cannot talk to, and the only advice the panel could give was "go back and
 * describe it again", which throws away a run they were in the middle of.
 *
 * So the client offers its copy back and the server adopts it, but only after
 * the same checks a freshly compiled one goes through, plus a sanity pass on
 * the economy. An already-known id is never overwritten: whatever the server
 * still holds wins, so this can repair a gap and never replace a truth.
 *
 * WHAT THIS DOES AND DOES NOT GIVE AWAY
 *
 * It is a real widening. A crafted scenario with a low floor gets a player a
 * discount — in a single-player language game, on their own wallet, in a run
 * whose score does not reach the shipped leaderboard. Weighed against a dead
 * end mid-run, that is the right way round, and the price checks below make
 * the forgery more work than replaying the errand honestly.
 */

/** Rupee bounds a real Indian street stays inside. */
const MIN_PRICE = 5;
const MAX_PRICE = 5000;
const MAX_WALLET = 20000;

function economyLooksReal(scenario: Scenario): string | null {
  let wallet = 0;
  for (const fact of scenario.facts) {
    if (fact.key === "wallet") wallet = Number(fact.value ?? 0);
    if (!fact.key.startsWith("price.") && !fact.key.startsWith("floor.")) continue;

    const value = Number(fact.value);
    if (!Number.isFinite(value) || value < MIN_PRICE || value > MAX_PRICE) {
      return `${fact.key} is ₹${fact.value}`;
    }
    // A floor is not allowed above its own opening, and a scenario where a
    // vendor's lowest price is a rupee is not a scenario, it is a cheat.
    if (fact.key.startsWith("floor.")) {
      const opening = Number(
        scenario.facts.find((f) => f.key === fact.key.replace("floor.", "price."))?.value ?? 0
      );
      if (opening && value > opening) return `${fact.key} is above its asking price`;
      if (opening && value < opening * 0.4) return `${fact.key} is far below its asking price`;
    }
    // Locked, always. This is the guarantee the whole design rests on and it
    // does not get waived for a scenario that arrived over the wire.
    if (fact.mutable) return `${fact.key} is not locked`;
  }
  if (wallet < 0 || wallet > MAX_WALLET) return `wallet is ₹${wallet}`;
  return null;
}

export async function POST(req: Request) {
  let body: { scenario?: Scenario };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const scenario = body.scenario;
  if (!scenario?.id) return NextResponse.json({ error: "No scenario supplied." }, { status: 400 });

  // Never shadow an authored scenario, and never overwrite one the server
  // already holds. Adoption fills a gap; it does not win an argument.
  if (scenarioById(scenario.id)) return NextResponse.json({ adopted: false, reason: "authored" });
  if (await recallScenario(scenario.id)) return NextResponse.json({ adopted: true, reason: "already held" });
  if (!scenario.id.startsWith("gen-")) {
    return NextResponse.json({ error: "Not a compiled scenario." }, { status: 400 });
  }

  const issues = validateScenario(scenario);
  if (issues.length) {
    return NextResponse.json(
      { error: `Scenario is not valid: ${issues[0].path} — ${issues[0].problem}` },
      { status: 400 }
    );
  }

  const economy = economyLooksReal(scenario);
  if (economy) {
    return NextResponse.json({ error: `Scenario prices are not plausible: ${economy}` }, { status: 400 });
  }

  rememberScenario(scenario);
  return NextResponse.json({ adopted: true });
}
