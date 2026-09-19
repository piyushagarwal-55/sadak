/**
 * ONE SCENARIO, THREE DIFFICULTIES.
 *
 * A scenario is authored (or compiled) once, at full size. This bends it to the
 * band the player picked: how many errands they get, how much money they start
 * with, how long the market stays open, and what goes wrong.
 *
 * It is a pure transform — scenario in, scenario out — because the scenario is
 * the premise and must stay immutable. Nothing here writes to a running world.
 *
 * THE MONEY IS COMPUTED, NOT AUTHORED
 *
 * The wallet is a multiple of the sum of the FLOOR prices of everything the run
 * asks you to buy. That is the only definition that keeps the pressure honest
 * across bands and across generated scenarios: at 1.05 you must argue every
 * purchase down to the bone, at 1.60 you can pay the asking price everywhere,
 * and neither number has to be re-tuned by hand when the compiler invents a
 * scenario about buying a saree instead of tomatoes.
 */

import { bandFor } from "./difficulty";
import { applyObstacles, chooseObstacles, obstacleSetup, type ObstacleChoice } from "./obstacles";
import type { Difficulty, LanguageFunction, Mutation, Scenario } from "./schema";

export type TunedRun = {
  scenario: Scenario;
  /** What is in the way this run, for the prompt and the debrief. */
  obstacles: ObstacleChoice[];
  /** Facts the obstacles want set before the run opens. */
  setup: Mutation[];
};

export function tuneScenario(
  base: Scenario,
  difficulty: Difficulty,
  history: Partial<Record<LanguageFunction, number>> = {},
  seed = 0
): TunedRun {
  const band = bandFor(difficulty);

  // Trimmed from the END, never the middle: the graph unlocks forward, so
  // dropping a tail mission leaves every remaining precondition satisfiable
  // while dropping a middle one can strand the ones behind it.
  const errands = Math.max(1, Math.min(band.errands, base.missions.length));
  const missions = base.missions.slice(0, errands);

  const deadline = base.clock.startMinutes + band.minutes;
  const lastCall = deadline - 5;

  let scenario: Scenario = {
    ...base,
    difficulty,
    missions: missions.map((m) => ({
      ...m,
      hintAfterTurns: m.hintAfterTurns,
      // Three voices is a difficulty, not a decoration. Below the top band the
      // woman in the queue is simply not there — which is also why nothing
      // downstream has to ask what band it is: if `companions` is empty, there
      // is nobody to speak.
      companions: band.group ? m.companions : undefined,
      // Every mission's deadline is the band's, not the author's.
      failWhen: m.failWhen.map((c) =>
        c.kind === "clock" ? { ...c, afterMinutes: deadline } : c
      ),
    })),
    stakes: {
      ...base.stakes,
      deadlineMinutes: deadline,
      lastCallMinutes: lastCall,
      assentThreshold: band.assent,
      patience: band.patience,
      patienceGraceTurns: band.patienceGraceTurns,
    },
  };

  // The wallet, from the floors of what this run actually asks for.
  const floors = missions.reduce((sum, m) => {
    const t = m.template;
    if (t.kind !== "buy") return sum;
    const floor = base.facts.find((f) => f.key === `floor.${t.slot}.${t.item}`);
    return sum + Number(floor?.value ?? 0) * t.qty;
  }, 0);
  const wallet = Math.max(20, Math.round((floors * band.walletMargin) / 5) * 5);

  scenario = {
    ...scenario,
    facts: scenario.facts.map((f) => {
      if (f.key === "wallet") {
        return { ...f, value: wallet, label: `you have ₹${wallet} in your pocket` };
      }
      // Patience is the band's, not the author's. A fact that started at 3 in a
      // Hard run would give the player more rope than the band promised.
      if (f.key.startsWith("patience.")) return { ...f, value: band.patience };
      return f;
    }),
  };

  // Obstacles, coldest language function first, capped by the band. Beginner
  // gets none at all — a first run should be allowed to be the easy version of
  // itself, so the player finds out what the loop IS before it is complicated.
  const all = chooseObstacles(scenario, history, seed);
  const obstacles = all.slice(0, band.obstacles);

  return {
    scenario: applyObstacles(scenario, obstacles),
    obstacles,
    setup: obstacleSetup(obstacles),
  };
}
