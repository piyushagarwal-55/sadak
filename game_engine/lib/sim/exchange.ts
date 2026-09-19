/**
 * WHERE THIS EXCHANGE HAS GOT TO. ONE ANSWER, READ BY EVERYTHING.
 *
 * The bug the player kept hitting, four times in four different costumes:
 *
 *   the card said "close it" and the line under it offered "hello"
 *   the card said "thank her" over a sentence that argued about the price
 *   the card said "tell her what you came for" while she asked where they lived
 *   the card said "ask the price" after she had answered it twice
 *
 * Every one of those is two parts of the same screen having reached a different
 * conclusion about the same moment. And they reached different conclusions
 * because each of them worked it out for itself: `stageOf` for the prompt,
 * `needsNext` for the coach, `missionFor` for the panel, `intent` for the
 * ending. Four readings of one conversation, none of them able to contradict
 * the others out loud, all of them able to contradict each other on screen.
 *
 * WHAT GIDEON DOES INSTEAD
 *
 * `gideon-ai-voice` runs a call through one `CallPhase` with a declared table
 * of legal edges. The LLM may PROPOSE a transition; `CallOrchestrator` is the
 * only thing that applies one, and it refuses any edge not in the table. Every
 * prompt, every tool and the UI all read that same field. Nothing downstream
 * recomputes it, so nothing downstream can disagree with it.
 *
 * This is that, for a market exchange.
 *
 * DERIVED, NOT STORED — WITH ONE EXCEPTION
 *
 * Gideon stores the phase because a legal intake has no other record of where
 * it is. Here almost all of it is already in the world: a price on the table
 * means bargaining, a bag in your hand means settled. Deriving it from facts is
 * strictly better than storing it, because derived state cannot drift out of
 * step with the thing it describes.
 *
 * The exception is the end. "There is nothing left to say to each other" is not
 * a fact about tomatoes; it is a reading of the conversation, and the model is
 * the only participant in a position to make it. So `DONE` is the one phase
 * that must be proposed — and `advance` is the only thing that may grant it,
 * and only from a phase the table allows it from.
 */

import type { Scenario, WorldState } from "./schema";
import { missionFor } from "./state";

export const ExchangePhase = {
  /** Nobody has said anything of substance yet. */
  GREETING: "GREETING",
  /** They are here for something and have not been given a price or an answer. */
  ASKING: "ASKING",
  /** A price is on the table and is being argued with. */
  BARGAINING: "BARGAINING",
  /** Everything owed has changed hands. There is nothing left but talk. */
  SETTLED: "SETTLED",
  /** Over. The panel stops asking for another sentence and offers a way out. */
  DONE: "DONE",
} as const;

export type ExchangePhase = (typeof ExchangePhase)[keyof typeof ExchangePhase];

/**
 * The only moves this conversation can make.
 *
 * Read it as a claim about markets rather than about code. You can walk up to a
 * stall and buy without a word of small talk, so GREETING reaches everything.
 * You cannot un-sell a bag of tomatoes, so nothing comes back out of SETTLED
 * except a NEW errand at the same stall — which is ASKING again, honestly, and
 * is why that edge exists. And nothing at all comes out of DONE.
 */
export const PHASE_EDGES: Record<ExchangePhase, ExchangePhase[]> = {
  GREETING: ["ASKING", "BARGAINING", "SETTLED"],
  ASKING: ["BARGAINING", "SETTLED"],
  BARGAINING: ["ASKING", "SETTLED"],
  SETTLED: ["ASKING", "BARGAINING", "DONE"],
  DONE: [],
};

export function isPhaseMoveAllowed(from: ExchangePhase, to: ExchangePhase): boolean {
  return from === to || PHASE_EDGES[from].includes(to);
}

/**
 * Where the WORLD says this exchange is, from facts alone.
 *
 * Never returns DONE. Nothing in the world can tell you two people have
 * finished talking — see the note above.
 */
export function phaseFromWorld(
  scenario: Scenario,
  state: WorldState,
  characterId: string
): ExchangePhase {
  const mission = missionFor(scenario, state, characterId);

  if (!mission) {
    // Nothing owed. Either they finished everything here, or they never had
    // anything to do with this person in the first place.
    return ExchangePhase.SETTLED;
  }

  const t = mission.template;
  if (t.kind === "buy" && typeof state.facts[`rung.${t.slot}.${t.item}`] === "number") {
    return ExchangePhase.BARGAINING;
  }

  return state.facts[`greeted.${characterId}`] === true
    ? ExchangePhase.ASKING
    : ExchangePhase.GREETING;
}

export type PhaseResult = {
  phase: ExchangePhase;
  /** True when the model asked for a move the table does not allow. */
  rejected: boolean;
};

/**
 * The world's reading, plus at most one step the model asked for.
 *
 * The same bargain as every other thing the model reports in this codebase: it
 * proposes, the engine decides. A shopkeeper who wants to shut up shop says so
 * on half her turns — "come tomorrow", "I need to get home" — and a conversation
 * that closes while the customer still has an errand with her is a dead end they
 * cannot usefully walk out of. `phaseFromWorld` will still be BARGAINING on
 * those turns, DONE is not an edge out of BARGAINING, and the proposal is
 * refused without anybody having to write that rule down twice.
 */
export function advance(
  scenario: Scenario,
  state: WorldState,
  characterId: string,
  proposed: ExchangePhase | null
): PhaseResult {
  const world = phaseFromWorld(scenario, state, characterId);
  if (!proposed || proposed === world) return { phase: world, rejected: false };
  if (!isPhaseMoveAllowed(world, proposed)) return { phase: world, rejected: true };
  return { phase: proposed, rejected: false };
}

/** What the model reports, mapped onto the machine. Anything else is open. */
export function phaseFromIntent(intent: string | undefined): ExchangePhase | null {
  return intent === "done" ? ExchangePhase.DONE : null;
}

/**
 * What she may and may not do here, for her prompt.
 *
 * The rules were scattered across a `stageBlock`, a `wantsOf` and a money block
 * that each decided for themselves what moment this was. One phase, one
 * paragraph.
 */
export function phaseBlock(phase: ExchangePhase, agreed: boolean): string {
  switch (phase) {
    case ExchangePhase.GREETING:
      return `WHERE THIS CONVERSATION IS
They have only just walked up. Nothing has been named, agreed or handed over.
- Greet them, find out what they want, talk up what is on your stall.
- Do NOT hand anything over, take money, give change or say "here you are".
  There is nothing to hand over yet. A shopkeeper who does that has ended a
  conversation that had not started.`;

    case ExchangePhase.ASKING:
      return `WHERE THIS CONVERSATION IS
They have greeted you and you have not named a price or answered their question
yet. This is the start of a sale, not the end of one.
- Answer what they ask. Name your price when they ask for it, and not before.
- Do NOT hand anything over, take money or give change.`;

    case ExchangePhase.BARGAINING:
      return `WHERE THIS CONVERSATION IS
Your price is on the table and they are working on you.
- Come down, or hold where you are. Both are fine; do not do both at once.
- Find out HOW MANY they want before you weigh anything out.
${
        agreed
          ? '- They have agreed. Hand it over and take the money — that is what "accept" is.'
          : "- Do NOT hand anything over until they have actually said they will take it."
      }`;

    case ExchangePhase.SETTLED:
      return `WHERE THIS CONVERSATION IS
They have what they came for and they have paid. Nothing is owed either way.
- Talk to them like a person: ask if they need anything else, send them off.
- Do NOT sell it to them again, name any price, or mention money at all.
- If there is genuinely nothing left between you, say so and report intent
  "done". Wanting to get home is not the same as being finished.`;

    case ExchangePhase.DONE:
      return `WHERE THIS CONVERSATION IS
It is over. Say goodbye in one short sentence and nothing else.`;
  }
}
