/**
 * WHAT STANDS BETWEEN THE PLAYER AND THE ERRAND.
 *
 * The task model has two templates, `buy` and `ask`, and that is on purpose: a
 * family is only real if a closed action can prove it happened. But two
 * templates played straight is the same conversation every run — ask the price,
 * say make it less, say alright — and a learner who runs five errands having
 * only ever produced those three sentences has learnt three things and repeated
 * them fifteen times.
 *
 * Variety does not come from more templates. It comes from what goes wrong.
 *
 * The same `buy` mission is a completely different conversation depending on
 * whether the vendor has run out and sends you down the lane, mishears you,
 * quotes you a tourist price, will not break a kilo, is serving somebody else,
 * or will not name a price until you have greeted her properly. None of those
 * is a new mission type. Each is one clause in the vendor's context and,
 * usually, one fact set differently at compile time — so none of them touches
 * `completeWhen`, and none of them is a new way for the demo to break.
 *
 * WHICH ONE YOU GET IS NOT RANDOM
 *
 * Each obstacle forces one language function. The chooser looks at what the
 * learner has actually produced — `WorldState.functions`, written by the action
 * layer when an utterance assents to a phrase — and picks obstacles that drill
 * the COLDEST ones. So the run adapts to what you cannot do yet, which is the
 * difference between practice and repetition.
 *
 * WHAT AN OBSTACLE MAY NOT DO
 *
 * It may not make a mission impossible. Every obstacle either leaves the
 * original route open or opens a named alternative, because a generated errand
 * that cannot be finished is the worst thing this system could produce and the
 * validator cannot catch it — it proves the goal graph is connected, not that a
 * human can get through it.
 */

import type { LanguageFunction, MissionNode, Mutation, Scenario, WorldState } from "./schema";

export type Obstacle = {
  id: string;
  /** Shown in the debrief: what this run made you do that the last one did not. */
  label: string;
  /** The function it forces. The chooser biases toward the coldest. */
  drills: LanguageFunction;
  /** Which templates it can attach to. */
  appliesTo: ("buy" | "ask")[];
  /**
   * One line added to the vendor's context, in English, as an instruction about
   * BEHAVIOUR. Never a number, never a fact — those come from the world.
   */
  vendorClause: string;
  /** Phrase ids the player will need. Added to the mission's `keyPhrases`. */
  phrases: string[];
  /**
   * Facts to set differently at compile time. Given the mission so it can name
   * the right slot. Locked facts are refused by `vet()` like anything else, so
   * an obstacle cannot quietly rewrite the floor.
   */
  setup?: (mission: MissionNode) => Mutation[];
};

/** Where the price ladder is stored, for obstacles that shift the opening. */
function slotOf(mission: MissionNode): { slot: string; item: string } | null {
  return mission.template.kind === "buy"
    ? { slot: mission.template.slot, item: mission.template.item }
    : null;
}

export const OBSTACLES: Obstacle[] = [
  {
    id: "must_greet",
    label: "She would not talk business until you said hello",
    drills: "greet",
    appliesTo: ["buy", "ask"],
    vendorClause:
      "You are old-fashioned about manners. Until the customer has greeted you properly, you do not " +
      "name a price and you do not answer questions — you say something like 'first say hello, then we talk'. " +
      "Once they have greeted you, drop it entirely and be warm.",
    phrases: ["p_greet"],
  },
  {
    id: "mishears",
    label: "She could not hear you over the lane",
    drills: "clarify",
    appliesTo: ["buy", "ask"],
    vendorClause:
      "The lane is loud and you are half deaf. Roughly every other turn, you mishear the customer and " +
      "ask them to say it again — never mocking them, just genuinely not catching it. If they repeat " +
      "themselves or say it differently, you get it and move on.",
    phrases: ["p_repeat", "p_slow"],
  },
  {
    id: "tourist_price",
    label: "She tried you at the tourist price",
    drills: "refuse",
    appliesTo: ["buy"],
    vendorClause:
      "You have decided this customer does not know the going rate, so you have opened high and you are " +
      "unhurried about it. If they push back, or mention what another stall charges, you come down " +
      "readily and without taking offence — you were trying it on, not cheating them.",
    phrases: ["p_too_much", "p_other_shop"],
    setup: (m) => {
      const s = slotOf(m);
      // Only the RUNG moves, never the floor: the floor is locked physics and
      // `vet()` would refuse it anyway. Starting at rung 0 of a raised ladder
      // is what a tourist price is, and the floor is still reachable.
      return s ? [{ kind: "fact", key: `rung.${s.slot}.${s.item}`, value: 0 }] : [];
    },
  },
  {
    id: "kilo_only",
    label: "She would not break a kilo",
    drills: "specify_quantity",
    appliesTo: ["buy"],
    vendorClause:
      "You sell by the kilo and you are not weighing out a quarter for anybody at this hour. If the " +
      "customer asks for a small amount, tell them the smallest you will do. Quantity words are the " +
      "thing they have to get right, so make them say it, then serve them.",
    phrases: ["p_one_kilo", "p_half_kilo"],
  },
  {
    id: "sold_out",
    label: "She had run out and sent you down the lane",
    drills: "ask_location",
    appliesTo: ["buy"],
    vendorClause:
      "You have sold the last of it. Say so plainly and, if they ask, tell them which way to go for it " +
      "— you know every stall in this gali. Do not pretend to have stock you do not have.",
    phrases: ["p_where_else"],
    setup: (m) => {
      const s = slotOf(m);
      return s ? [{ kind: "fact", key: `stock.${s.slot}.${s.item}`, value: 0 }] : [];
    },
  },
  {
    id: "offers_other",
    label: "She talked you into something else",
    drills: "accept_substitute",
    appliesTo: ["buy"],
    vendorClause:
      "What they asked for is not your best today, and you would rather sell them the good stuff. Push " +
      "the alternative once, warmly. If they still want the original, sell it to them without sulking.",
    phrases: ["p_ok_that_one"],
  },
  {
    id: "busy",
    label: "You had to wait your turn",
    drills: "greet",
    appliesTo: ["buy", "ask"],
    vendorClause:
      "You are in the middle of serving somebody else. For the first turn or two you are half-attending " +
      "— 'one minute', 'yes yes, coming' — and only then do you turn to this customer properly. Do not " +
      "drag it out past two turns.",
    phrases: ["p_greet"],
  },
  {
    id: "fast_talker",
    label: "She talked fast and you had to slow her down",
    drills: "clarify",
    appliesTo: ["buy", "ask"],
    vendorClause:
      "You talk fast and in long runs, the way someone does in their own language at the end of a long " +
      "day. Two or three clauses at a time, not one short sentence. If the customer asks you to slow " +
      "down or repeat, do it properly and shortly.",
    phrases: ["p_slow", "p_repeat"],
  },
];

/* ------------------------------------------------------------------ *
 * Choosing
 * ------------------------------------------------------------------ */

export type ObstacleChoice = { mission: MissionNode; obstacle: Obstacle };

/**
 * Picks one obstacle per mission, coldest language function first.
 *
 * `history` is what the learner has produced across previous runs. Pass an
 * empty object on a first run and it degrades to "spread the functions out",
 * which is the right behaviour for someone with no history.
 *
 * `seed` breaks ties. Without it, two learners with identical histories get
 * identical runs, and one learner replaying gets the same run twice — which is
 * the exact complaint this file exists to answer.
 */
export function chooseObstacles(
  scenario: Scenario,
  history: Partial<Record<LanguageFunction, number>>,
  seed = 0
): ObstacleChoice[] {
  const used = new Set<string>();
  const spent = { ...history };
  const out: ObstacleChoice[] = [];

  scenario.missions.forEach((mission, i) => {
    const candidates = OBSTACLES.filter(
      (o) => o.appliesTo.includes(mission.template.kind) && !used.has(o.id)
    );
    if (!candidates.length) return;

    // Coldest first. Ties broken by the seed, so the same history twice does
    // not produce the same run twice.
    const ranked = candidates
      .map((o, j) => ({ o, n: spent[o.drills] ?? 0, jitter: (seed + i * 7 + j * 13) % 5 }))
      .sort((a, b) => a.n - b.n || a.jitter - b.jitter);

    const pick = ranked[0].o;
    used.add(pick.id);
    // Count it as practised so the next mission in the same run does not pick
    // another obstacle drilling the very same thing.
    spent[pick.drills] = (spent[pick.drills] ?? 0) + 1;
    out.push({ mission, obstacle: pick });
  });

  return out;
}

/**
 * Folds the chosen obstacles into a scenario.
 *
 * Returns a new `Scenario` — the original is the immutable premise and stays
 * that way. Key phrases are unioned rather than replaced, so an obstacle can
 * only ever give the player more ways to satisfy assent, never fewer: an
 * obstacle that removed a phrase could make a mission uncompletable, which is
 * the one thing this system is not allowed to do.
 */
export function applyObstacles(scenario: Scenario, choices: ObstacleChoice[]): Scenario {
  const byMission = new Map(choices.map((c) => [c.mission.id, c.obstacle]));
  const known = new Set(scenario.phrases.map((p) => p.id));

  return {
    ...scenario,
    missions: scenario.missions.map((m) => {
      const o = byMission.get(m.id);
      if (!o) return m;
      const extra = o.phrases.filter((p) => known.has(p) && !m.keyPhrases.includes(p));
      return { ...m, keyPhrases: [...m.keyPhrases, ...extra] };
    }),
  };
}

/** The setup mutations for a run, to apply to the opening state. */
export function obstacleSetup(choices: ObstacleChoice[]): Mutation[] {
  return choices.flatMap((c) => c.obstacle.setup?.(c.mission) ?? []);
}

/**
 * The clause for one character, to render into their turn prompt.
 *
 * Returns null when nothing is in their way, which is most vendors most of the
 * time — an obstacle on every stall is its own kind of monotony.
 */
export function clauseFor(choices: ObstacleChoice[], characterId: string): string | null {
  const hit = choices.find((c) => c.mission.characterId === characterId);
  return hit?.obstacle.vendorClause ?? null;
}

/**
 * How many distinct language functions the learner has produced.
 *
 * The number the debrief should lead with, and the one that answers "am I
 * learning anything or just doing the same errand again". Missions completed
 * does not answer it: five errands closed with the same two sentences is five
 * repetitions.
 */
export function breadth(state: WorldState): { produced: LanguageFunction[]; cold: LanguageFunction[] } {
  const produced = Object.entries(state.functions)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([k]) => k as LanguageFunction);
  const cold = OBSTACLES.map((o) => o.drills).filter((f) => !produced.includes(f));
  return { produced, cold: [...new Set(cold)] };
}
