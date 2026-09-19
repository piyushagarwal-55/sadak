import { NextResponse } from "next/server";
import { DEFAULT_SCENARIO_ID, scenarioById } from "@/lib/sim/scenarios";
import { recallScenario } from "@/lib/sim/compile/cache";
import { tuneScenario } from "@/lib/sim/tune";
import { TurnOrchestrator } from "@/lib/sim/turn/orchestrator";
import type { Difficulty, WorldState } from "@/lib/sim/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * ONE TURN — THE HTTP EDGE OF IT.
 *
 * This file is what `entry.ts` is in `gideon-ai-voice`: it accepts the world,
 * checks the shape of it, constructs the thing that actually knows what a turn
 * is, and serialises whatever comes back. There is no business logic here and
 * there should never be any again.
 *
 * It was seven hundred lines. It parsed a request, tuned a scenario, derived
 * eleven prompt fragments, called two models, reconciled their answers, vetted
 * a suggestion, did the money, scored the turn, wrote the history record and
 * built a response — and every `state = ...` in the codebase lived inside it.
 * Two of the worst bugs this branch shipped were "a fragment was never
 * assembled", which is a class of bug that only exists when assembly is spread
 * across a function rather than owned by an object. `lib/sim/turn/context.ts`
 * owns that now, and `lib/sim/turn/orchestrator.ts` owns the world.
 *
 * STATE COMES FROM THE CLIENT, FOR NOW
 *
 * There is no session table in the loop yet, so the browser posts the state it
 * holds and gets the next one back. That is fine while this is a local demo and
 * is NOT fine in production — a client that can post its own wallet can post
 * itself a bigger one. Swapping the two `state` lines below for a Supabase
 * read and write is the only change needed.
 */

type Body = {
  characterId?: string;
  text?: string;
  state?: WorldState;
  /** How the words arrived. The scorer excludes turns we could not hear. */
  input?: "voice" | "text";
  /** False when STT came back empty on audio that was actually recorded. */
  heard?: boolean;
  /** The band the client is playing. The server tunes to it before judging. */
  difficulty?: Difficulty;
  /** Which situation. The server owns the scenario; the client only names it. */
  scenarioId?: string;
  /** The run's seed, so the server plays the same obstacles the client showed. */
  seed?: number;
  /** What the PLAYER reads. Not what they are learning. Subtitles only. */
  baseLang?: string;
  /**
   * What this learner has produced across every run, from their profile.
   *
   * Sent for the same reason `seed` is. `tuneScenario` picks the obstacles from
   * it, so if the browser tunes against a profile and the server tunes against
   * an empty object, the vendor plays an obstacle the hints never mentioned —
   * which is the exact bug the seed was added to fix, one argument along.
   */
  history?: Record<string, number>;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const base =
    await recallScenario(body.scenarioId) ??
    scenarioById(body.scenarioId) ??
    scenarioById(DEFAULT_SCENARIO_ID)!;

  // Shape-checked, not just presence-checked. A half-built state — facts but no
  // missions map — crashed `activeMissions` with a 500 rather than a 400, which
  // is the route blaming itself for a caller's mistake.
  const posted = body.state;
  if (!posted || typeof posted.facts !== "object" || typeof posted.missions !== "object") {
    return NextResponse.json({ error: "Malformed world state." }, { status: 400 });
  }
  const state: WorldState = {
    ...posted,
    log: posted.log ?? [],
    turns: posted.turns ?? {},
    history: posted.history ?? [],
    functions: posted.functions ?? {},
  };

  // THE SEED IS THE CLIENT'S AND THE SERVER MUST USE THE SAME ONE.
  //
  // The browser picked one at random when the run opened. Without it the server
  // tuned at seed 0 while the browser tuned at 7, so the obstacle the player
  // could see in the hints was never the obstacle the vendor was playing — the
  // whole deck ran twice, differently, and neither copy reached the model.
  const run = tuneScenario(
    base,
    body.difficulty ?? "intermediate",
    body.history ?? state.functions,
    body.seed ?? 0
  );
  const character = run.scenario.characters.find((c) => c.id === body.characterId);
  if (!character) {
    return NextResponse.json({ error: `Unknown character "${body.characterId}".` }, { status: 404 });
  }

  const orchestrator = new TurnOrchestrator({
    scenario: run.scenario,
    character,
    state,
    obstacles: run.obstacles,
    seed: body.seed ?? 0,
    baseLang: body.baseLang ?? "en-IN",
  });

  return NextResponse.json(
    await orchestrator.run({
      said: body.text ?? "",
      input: body.input ?? "text",
      heardAudio: body.heard !== false,
    })
  );
}
