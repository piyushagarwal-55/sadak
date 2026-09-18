/**
 * FROM A SCENARIO TO A WORLD.
 *
 * The scenario says "Lakshmi sells tomatoes and Noor sells bangles". The world
 * says "there are four vegetable stalls and two bangle stalls, here". This
 * turns the first into the arguments the second needs.
 *
 * It is deliberately thin, and it runs on the SCENARIO side rather than inside
 * the archetype, because it is the one piece that has to change when a second
 * archetype arrives: a station hall binds a cast to counters, not to stalls.
 */

import { goodById } from "./goods";
import type { Scenario } from "../schema";

export type CastMember = {
  /** Character id, so the turn loop knows who the player is talking to. */
  id: string;
  /** Shown on the interaction prompt, in the target script. */
  name: string;
  /** Which kind of stall to stand them behind. */
  stallKind: string;
  /** Logical slot id from the mission template, if this is a `buy` vendor. */
  slot?: string;
};

export type WorldBinding = {
  cast: CastMember[];
  /** Stall kinds that must be built regardless of the density roll. */
  requiredStalls: string[];
};

/**
 * Works out who needs to be standing where.
 *
 * A character is only placed if a mission actually sends the player to them —
 * a cast member with nothing to do is a person the player will walk up to,
 * press E on, and get nothing from, which reads as a bug rather than as
 * scenery. Scenery is what `MarketLife`'s unnamed keepers are for.
 */
export function bindingFor(scenario: Scenario): WorldBinding {
  const cast: CastMember[] = [];
  const kinds = new Set<string>();

  for (const mission of scenario.missions) {
    if (cast.some((c) => c.id === mission.characterId)) continue;

    const character = scenario.characters.find((c) => c.id === mission.characterId);
    if (!character) continue;

    // A `buy` mission names the stall kind through its good. An `ask` mission
    // does not, so its character is placed by whichever `buy` mission they also
    // hold — which is why the loop skips characters already cast.
    if (mission.template.kind !== "buy") continue;

    const good = goodById(mission.template.item);
    if (!good) continue;

    cast.push({ id: character.id, name: character.name, stallKind: good.stallKind, slot: mission.template.slot });
    kinds.add(good.stallKind);
  }

  // Anyone left over — a character who only ever answers questions — goes
  // behind whatever stall is still unclaimed, in scenario order.
  //
  // Bystanders are not cast at all. The woman ahead of you in the queue is a
  // voice in the exchange, not a stall to walk up to, and giving her a body
  // would give her an E prompt and a panel with no errand behind it — the exact
  // "reads as a bug rather than as scenery" this function was written to avoid.
  for (const character of scenario.characters) {
    if (character.bystander) continue;
    if (cast.some((c) => c.id === character.id)) continue;
    cast.push({ id: character.id, name: character.name, stallKind: "veg_stall" });
    kinds.add("veg_stall");
  }

  // Only the bazaar force-builds stalls. A station has fixed counters, so
  // asking it for a `counter` stall kind would send `buildStalls` looking for
  // something the kit does not contain.
  return {
    cast,
    requiredStalls: scenario.archetype === "bazaar" ? [...kinds].filter((k) => k !== "counter") : [],
  };
}
