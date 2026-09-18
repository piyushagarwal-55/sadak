/**
 * EVERY SCENARIO THAT EXISTS WITHOUT THE COMPILER.
 *
 * One place, so a route never hardcodes a scenario and a new hand-written one
 * becomes playable by being added to a list. When the compiler lands it hands
 * back the same `Scenario` shape and goes through the same lookup, keyed by
 * session rather than by id — nothing downstream will be able to tell which
 * produced the world it is running.
 */

import type { Scenario } from "../schema";
import { HYDERABAD_BAZAAR } from "./hyderabad-bazaar";
import { HYDERABAD_STATION } from "./hyderabad-station";

export const SCENARIOS: Scenario[] = [HYDERABAD_BAZAAR, HYDERABAD_STATION];

export const DEFAULT_SCENARIO_ID = HYDERABAD_BAZAAR.id;

export function scenarioById(id: string | undefined): Scenario | null {
  if (!id) return null;
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export { HYDERABAD_BAZAAR, HYDERABAD_STATION };
