/**
 * WHAT TO SAY BACK.
 *
 * The panel has always shown one phrase, and for a long time it chose that
 * phrase by asking which language function this learner had produced least.
 * That is a good way to decide what somebody needs PRACTICE at and a useless
 * way to answer the question they are actually asking, which is "she just said
 * something to me — what do I say now?". A learner who had been greeted was
 * shown "hello" again, because greeting was the thing they had done least.
 *
 * So the suggestion follows the conversation. She quotes a price, it offers you
 * a way to push back. She comes down, it offers you a quantity. She could not
 * hear you, it offers you "say it again".
 *
 * IT FOLLOWS WHAT HAPPENED, NOT WHAT THE MODEL PROPOSED
 *
 * This is the distinction the first version got wrong, and the bug was a good
 * one. The player said something; the model proposed `accept`; the engine
 * refused it, threw the model's words away and had her say the hand-written
 * "what did you say? say it again". The panel was told the act was `accept` and
 * advised "It is done. Thank her." — advice for a sentence that never got said,
 * printed directly underneath the sentence that did.
 *
 * `LastMove` therefore carries `ok` and the refusal reason, and a refused act is
 * coached as what the engine actually said. Everything else in this codebase
 * already works this way; the coach was the one place still taking the model's
 * word for what had happened.
 *
 * AND IT IS CHECKED AGAINST THE WORLD
 *
 * Whatever the conversation suggests, `pointless()` drops anything the world has
 * nothing to attach it to — thanking somebody who has not given you anything,
 * haggling before a price exists. If that empties the list, the errand's own
 * next step stands in, read from facts. The card is never blank, and it is never
 * advice for a world other than this one.
 *
 * NOTHING HERE IS WRITTEN BY A MODEL
 *
 * Every suggestion is a phrase from the scenario's own bank, chosen by a pure
 * function of (what just happened, what this errand still needs, what you have
 * already produced). A model that invented the learner's lines could invent a
 * sentence that is wrong, and a learner has no way to tell — they are learning
 * it from us. So the bank is hand-written and reviewed, and this file only ever
 * picks from it. Same rule that keeps the model out of the economy, applied to
 * the part of the product that teaches.
 *
 * IT IS A SUGGESTION AND NOT A STEP
 *
 * Saying something else entirely is not worse and is not blocked. `assent` in
 * `actions.ts` gates on the language and on what the model heard, never on
 * this. The suggestion exists because "I do not know how to say anything" is
 * the actual wall a beginner hits in a market, and staring at a microphone is
 * not a lesson.
 */

import type {
  LanguageFunction,
  MissionNode,
  PhraseSpec,
  Scenario,
  WorldState,
} from "./schema";
import type { Verb } from "./actions";

/**
 * What answers what.
 *
 * Keyed by the act the character took on the last turn — the engine's own
 * record of what she DID, not a reading of what she said, so this cannot
 * disagree with the world. The lists are language functions in preference
 * order; anything not named is still eligible, just ranked below.
 */
const ANSWERS: Record<Verb | "opening", { wants: LanguageFunction[]; because: string }> = {
  opening: {
    wants: ["greet", "ask_price", "ask_location"],
    because: "Open with hello — she will not talk business before you do.",
  },
  greet: {
    wants: ["ask_price", "ask_location", "greet"],
    because: "She has said hello. Tell her what you came for.",
  },
  quote: {
    wants: ["negotiate", "refuse", "specify_quantity"],
    because: "She has named her price. Push back, or say how much you want.",
  },
  concede: {
    wants: ["specify_quantity", "negotiate", "thank"],
    because: "She has come down. Say how much you want and close it.",
  },
  refuse: {
    wants: ["specify_quantity", "compare", "accept_substitute"],
    because: "She is holding her price. Take it, or say it is cheaper elsewhere.",
  },
  clarify: {
    wants: ["clarify", "ask_price", "specify_quantity"],
    because: "She did not catch that. Say it again, or ask her to slow down.",
  },
  tell: {
    wants: ["thank", "ask_location", "ask_price"],
    because: "She has told you. Thank her.",
  },
  point: {
    wants: ["thank", "ask_location"],
    because: "She has sent you down the lane. Thank her.",
  },
  accept: {
    wants: ["thank", "ask_location", "greet"],
    because: "It is done. Thank her — or ask her where the next thing is.",
  },
  end: {
    wants: ["thank", "greet"],
    because: "She is finished with you. Say thank you and walk on.",
  },
};

/**
 * WHEN THE ENGINE OVERRULED HER.
 *
 * What she actually said on a refused turn is the engine's own line, so the
 * engine's reason is what has to be answered. `wants: null` means "whatever this
 * errand still needs" — used where the refusal says nothing about what to say
 * next, only that the last attempt did not land.
 */
const AFTER_REFUSAL: Record<string, { wants: LanguageFunction[] | null; because: string }> = {
  no_assent: {
    wants: null,
    because: "She did not follow that. Say it again, and say it clearly.",
  },
  not_the_language: {
    wants: null,
    because: "That was not her language. Nothing moves until it is — try this.",
  },
  unclear: { wants: null, because: "She could not make that out. Try it again." },
  no_money: {
    wants: ["negotiate", "compare", "specify_quantity"],
    because: "You cannot afford that. Get her down, or ask for less.",
  },
  no_stock: {
    wants: ["ask_location", "accept_substitute"],
    because: "She has run out. Ask where else you can get it.",
  },
  not_mine: {
    wants: ["ask_price", "ask_location"],
    because: "She does not sell that. Ask about what she has.",
  },
  below_floor: {
    wants: ["specify_quantity", "accept_substitute"],
    because: "She will not go lower than that. Take it, or leave it.",
  },
  dont_know: {
    wants: ["ask_location", "clarify"],
    because: "She does not know that. Ask her something she would know.",
  },
  away: { wants: ["greet"], because: "She has stepped away. Get her attention." },
  generic: { wants: null, because: "That did not go through. Try it another way." },
};

/**
 * WHAT THIS ERRAND STILL NEEDS, from facts alone.
 *
 * The goal-shaped half of the advice, and the fallback whenever the
 * conversation-shaped half has nothing sensible left. It is the same reading of
 * the world that `wantsOf` gives the shopkeeper, from the other side of the
 * counter: no price named means ask the price, a price on the table means argue
 * with it or say how many, bought means you are done here.
 */
function needsNext(state: WorldState, mission: MissionNode | null): LanguageFunction[] {
  const t = mission?.template;
  if (!t) return ["greet", "ask_price", "ask_location"];

  if (t.kind === "ask") {
    return state.facts[`info.${t.infoKey}`] === true
      ? ["thank", "ask_price"]
      : ["ask_location", "clarify"];
  }

  const priced = typeof state.facts[`rung.${t.slot}.${t.item}`] === "number";
  const bought = state.facts[`bought.${t.slot}.${t.item}`] === true;
  if (bought) return ["thank", "ask_location"];

  // SHE HAS RUN OUT, SO THE ERRAND IS SOMEWHERE ELSE NOW.
  //
  // This used to read only the price ladder, so with an empty stall it still
  // said "ask her the price" — and when she told the player the tomatoes were
  // finished, the only moves on the list were about buying them from her.
  // Asking where else to get it is the move, and it is the one `sold_out` was
  // written to drill.
  if (Number(state.facts[`stock.${t.slot}.${t.item}`] ?? 1) <= 0) {
    return ["ask_location", "accept_substitute", "clarify"];
  }

  if (!priced) return ["ask_price", "greet"];
  return ["negotiate", "specify_quantity", "refuse"];
}

/** The sentence for the goal-shaped advice, when the conversation had none. */
function goalBecause(state: WorldState, mission: MissionNode | null): string {
  const t = mission?.template;
  if (!t) return "Say something and see what she does.";
  if (t.kind === "ask") {
    return state.facts[`info.${t.infoKey}`] === true
      ? "You have what you came for. Thank her."
      : "You came here to find something out. Ask her.";
  }
  if (state.facts[`bought.${t.slot}.${t.item}`] === true) {
    return "You have it. Thank her, or ask where the next thing is.";
  }
  return typeof state.facts[`rung.${t.slot}.${t.item}`] === "number"
    ? "There is a price on the table. Argue with it, or say how much you want."
    : "You do not know what it costs yet. Ask her.";
}

/**
 * THINGS THERE IS NO POINT SAYING YET.
 *
 * The veto that would have caught the bug on its own. "Thank you" is a fine
 * answer to somebody who has just handed you a bag of tomatoes and a strange one
 * to somebody who has not, and haggling needs a price on the table to haggle
 * about. Read from facts, so it cannot disagree with the world.
 */
function pointless(
  fn: LanguageFunction,
  state: WorldState,
  mission: MissionNode | null,
  characterId = ""
): boolean {
  const t = mission?.template;
  const priced = t?.kind === "buy" && typeof state.facts[`rung.${t.slot}.${t.item}`] === "number";
  const bought = t?.kind === "buy" && state.facts[`bought.${t.slot}.${t.item}`] === true;
  const answered = t?.kind === "ask" && state.facts[`info.${t.infoKey}`] === true;

  switch (fn) {
    case "negotiate":
    case "refuse":
    case "compare":
    case "specify_quantity":
    case "accept_substitute":
      // Nothing to argue about until she has named a number, and nothing left
      // to close once it is closed.
      return !priced || bought;
    case "greet":
      // YOU ONLY SAY HELLO ONCE.
      //
      // Measured: four turns into a conversation, with her explaining that the
      // tomatoes had run out, the alternatives still offered "ਸਤ ਸ੍ਰੀ ਅਕਾਲ ·
      // Hello". Greeting passed every filter there was, because there is
      // nothing in the world a greeting needs — which is true right up to the
      // moment somebody has already done it.
      return !!characterId && state.facts[`greeted.${characterId}`] === true;

    case "thank":
      // With no errand live there is nothing left to be owed, and thanking
      // somebody you have finished with is always reasonable. Measured: right
      // after she gave the directions and the errand settled, `thank` was
      // vetoed — because the veto could not tell "nothing has been handed over"
      // apart from "there is nothing left to hand over" — and the card said
      // "where is the bangle shop?" under the words "She has told you. Thank
      // her."
      if (!t) return false;
      return !bought && !answered;
    default:
      return false;
  }
}

/**
 * THE GOAL, FOR THE MODEL THAT IS ABOUT TO WRITE THE SUGGESTION.
 *
 * Exported because the turn route needs it BEFORE the model is called, to tell
 * it what the customer is trying to do — where everything else in this file is
 * used after, to explain the suggestion that came back. Purely state-driven:
 * no last act, because the act being answered has not been chosen yet.
 */
export function goalFor(
  scenario: Scenario,
  state: WorldState,
  mission: MissionNode | null,
  characterId = ""
): { example: PhraseSpec | null; because: string; wants: LanguageFunction[] } {
  const wants = needsNext(state, mission).filter((fn) => !pointless(fn, state, mission, characterId));
  const mine = new Set(mission?.keyPhrases ?? []);
  const ranked = scenario.phrases
    .map((p) => ({
      p,
      key: [
        wants.indexOf(p.drills) === -1 ? 99 : wants.indexOf(p.drills),
        mine.has(p.id) ? 0 : 1,
        state.functions[p.drills] ?? 0,
      ],
    }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);

  return { example: ranked[0]?.p ?? null, because: goalBecause(state, mission), wants };
}

/**
 * A SUGGESTION THE MODEL WROTE, CHECKED BEFORE IT IS TAUGHT.
 *
 * The headline used to be picked from the phrase bank by a pure function, which
 * made it correct and made it the same sentence every run. The complaint was
 * exactly right: a market does not hand you the same five sentences, and a
 * suggestion that cannot respond to what was actually just said is a checklist
 * wearing a conversation's clothes.
 *
 * So the model writes it — in the same call that writes her line, which is what
 * makes them match. One context, one turn, nothing to drift: it is the shared
 * context a pair of agents would have been built to approximate, in the one
 * place where it cannot disagree with itself.
 *
 * WHAT IS CHECKED, AND WHY EACH ONE
 *
 *   SCRIPT    it is what the learner will say out loud into a Saaras call and
 *             read off a card. Latin letters break both.
 *   LENGTH    one sentence. A paragraph is not a thing anybody can repeat.
 *   ECHO      models answer their own line when they are tired. Being told to
 *             say back what was just said to you teaches nothing.
 *   MEANING   without it the card is a spelling test, which is the bug this
 *             panel has already been fixed for once.
 *
 * Anything that fails falls back to the phrase bank, so the worst case is the
 * behaviour this replaced rather than a blank card or a wrong lesson.
 */
export function vetCoachLine(
  line:
    | { native?: string; roman?: string; meaning?: string; move?: string }
    | null
    | undefined,
  opts: {
    script: string;
    /** Her line this turn. Being told to repeat it back teaches nothing. */
    saidByThem: string;
    /** The player's line this turn. Measured: it suggested the same question
     *  they had just asked and she had just answered. */
    saidByYou: string;
    /** True when the errand settled on this turn, so the advice is for a world
     *  that no longer exists — it was written before the act resolved. */
    stale: boolean;
    /**
     * The bank phrase the model was told to expand on.
     *
     * A suggestion no longer than that is one the model did not expand — it
     * copied the phrasebook entry back, or wrote something shorter. Rejecting
     * it costs nothing, because the fallback IS the bank phrase: the card ends
     * up showing the same length of sentence either way, and at least the
     * authored one has been read by a person.
     */
    example: string;
    /**
     * The moves this turn actually calls for. The model reports which one its
     * sentence makes and it has to be one of these.
     *
     * Measured: told the move was to push back on a ₹40 quote, it wrote
     * "చాలా సరైంది, ధన్యవాదాలు" — "that is very fair, thank you" — which is a
     * perfectly good Telugu sentence that accepts the price it was supposed to
     * argue with. Prose telling it not to did not hold, and a learner reading
     * the card has no way to know. Asking it to name the move turns a matter of
     * tone into a set membership test, which is the same trade `heard` makes
     * against the same failure.
     */
    wants: readonly string[];
    inScript: (s: string, script: string) => boolean;
  }
): { native: string; roman: string; en: string } | null {
  const native = (line?.native ?? "").trim();
  const meaning = (line?.meaning ?? "").trim();

  if (!native || !meaning) return null;
  if (opts.stale) return null;
  // An empty `wants` means nothing in particular is called for, so anything
  // goes; otherwise the move it names has to be one of them.
  if (opts.wants.length && !opts.wants.includes((line?.move ?? "").trim())) return null;
  // Long enough for a real sentence, short enough to say in one breath. It was
  // 90, which is a phrasebook entry — and between that and a prompt asking for
  // "one short sentence", the card was handing out two-word fragments.
  if (native.length > 170) return null;
  if (!opts.inScript(native, opts.script)) return null;

  // NO LATIN LETTERS, even one. The script check only asks whether ANY of the
  // target script is present, so a sentence that is mostly right survives with
  // a foreign word wedged in it — measured, a Marathi card read "तुम्ही किती
  // cobrar करता?", with the Spanish for "charge" sitting in the middle of it.
  // A reply can carry a stray word and still be understood; a card is the
  // sentence the learner is about to say out loud, and half of it has to be
  // wrong before they notice. Digits and ₹ are fine and stay.
  if (/[A-Za-z]/.test(native)) return null;

  // Not an expansion. See `example`: several languages were coming back with
  // two-word cards — "எவ்வளவு?", "టమాటా ఎంత?" — while Hindi got a whole
  // sentence, because the only worked example in the prompt was written in
  // Telugu and everybody else was guessing at what "a whole sentence" meant.
  if (opts.example && native.length <= opts.example.trim().length) return null;

  const same = (a: string, b: string) =>
    a.replace(/\s+/g, "") === b.replace(/\s+/g, "") && a.length > 0;
  if (same(native, opts.saidByThem.trim())) return null;
  if (same(native, opts.saidByYou.trim())) return null;

  return { native, roman: (line?.roman ?? "").trim(), en: meaning };
}

/**
 * WHY THIS SENTENCE, KEYED ON WHAT IT ACTUALLY DOES.
 *
 * `because` used to be derived from her ACT, which the engine knows, and the
 * card from the suggestion, which the engine does not write. They disagreed the
 * moment those two came apart — measured: she said the tomatoes were finished,
 * the card correctly offered "when will you have more?", and the line under it
 * still read "She has said hello. Tell her what you came for.", because her act
 * that turn was `greet`.
 *
 * The suggestion reports its own move and the engine validates it against the
 * moves this turn allows, so once it has passed that check it is the honest
 * description of what the card is doing. English and engine-owned: the model
 * writes the sentence, never the explanation of it.
 */
const BECAUSE_FOR_MOVE: Record<LanguageFunction, string> = {
  greet: "Open with hello — she will not talk business before you do.",
  ask_price: "Ask her what it costs.",
  negotiate: "Push back on the price.",
  clarify: "Tell her you did not catch that.",
  refuse: "Tell her that is too much.",
  ask_location: "Ask where else you can get it.",
  specify_quantity: "Say how much you want.",
  compare: "Tell her it is cheaper at the next stall.",
  accept_substitute: "Take what she is offering instead.",
  thank: "Thank her.",
  answer: "She asked you something. Answer her first.",
};

export function becauseForMove(move: string | undefined): string | null {
  return move && move in BECAUSE_FOR_MOVE
    ? BECAUSE_FOR_MOVE[move as LanguageFunction]
    : null;
}

export type Coaching = {
  /** The one to say. Null only when the scenario has no phrases at all. */
  say: PhraseSpec | null;
  /**
   * The moves this turn calls for, AFTER the act resolved.
   *
   * The route checks the model's suggestion against the union of these and the
   * ones it was given before the call. The gap is real and unavoidable: the
   * goal is computed before the model chooses an act, the suggestion answers
   * the act it chose, and checking against the earlier set alone rejected a
   * perfectly good "push back" written in reply to a quote that did not exist
   * when the prompt was built.
   */
  wants: LanguageFunction[];
  /** Others that would work just as well here. Never more than two. */
  also: PhraseSpec[];
  /** One line of English explaining why this one, for the panel. */
  because: string;
};

/** What happened on the last turn, exactly as the turn route reported it. */
export type LastMove = {
  verb: Verb;
  /** False when the engine refused the act and said its own line instead. */
  ok: boolean;
  reason?: string | null;
};

/**
 * @param last what happened last turn, from the turn route's `act`. Null when
 *        the conversation has only just opened. It carries `ok` because a
 *        refused `accept` is not an acceptance, and advising the player to say
 *        thank you for one is how this went wrong the first time.
 */
export function coachFor(
  scenario: Scenario,
  state: WorldState,
  mission: MissionNode | null,
  last: LastMove | null,
  characterId = ""
): Coaching {
  const refused =
    last && !last.ok ? (AFTER_REFUSAL[last.reason ?? "generic"] ?? AFTER_REFUSAL.generic) : null;

  const plan = refused
    ? { wants: refused.wants ?? needsNext(state, mission), because: refused.because }
    : (ANSWERS[last?.verb ?? "opening"] ?? ANSWERS.opening);

  // The veto, then the fallback. If the conversation's answer has nothing left
  // that the world can attach to, the errand's own next step stands in.
  const usable = plan.wants.filter((fn) => !pointless(fn, state, mission, characterId));
  const fallback = needsNext(state, mission).filter(
    (fn) => !pointless(fn, state, mission, characterId)
  );

  /**
   * THE ERRAND LEADS, THE CONVERSATION FOLLOWS.
   *
   * `ANSWERS` is a generic reading of a shopkeeper's move and the errand is the
   * specific reason you are standing there, so when both have something to say
   * the errand goes first. Measured: on "ask Lakshmi where the bangle stall
   * is", she said hello, and the card offered "how much a kilo?" — a fine
   * answer to a greeting and nothing to do with why the player had walked over.
   *
   * ONLY AFTER A GREETING, though, and the tests are why. "Hello" is the one
   * move that carries no information about what to do next, so the errand is
   * the only thing that can fill the gap. Everywhere else the conversation is
   * specific and it wins: letting the goal lead after a concession offered
   * another round of haggling instead of closing, and after `clarify` it told a
   * player to ask a price at the exact moment the shopkeeper had said she could
   * not hear them. Before anybody has spoken at all, you say hello.
   */
  const goalLeads = !refused && last?.verb === "greet";
  const wants = usable.length
    ? goalLeads
      ? [...fallback.filter((fn) => usable.includes(fn)), ...usable]
      : usable
    : fallback;
  const because = usable.length
    ? plan.because
    : (refused?.because ?? goalBecause(state, mission));

  // The errand's own phrases first. They are the ones somebody chose for this
  // conversation; the rest of the bank is the fallback so that a learner is
  // never shown an empty card, which reads as the software giving up on them.
  const mine = new Set(mission?.keyPhrases ?? []);
  const pool = scenario.phrases.filter((p) => mine.has(p.id));
  const rest = scenario.phrases.filter((p) => !mine.has(p.id));

  const rank = (p: PhraseSpec, ownIt: boolean) => {
    const wanted = wants.indexOf(p.drills);
    return [
      wanted === -1 ? 99 : wanted, // does it answer what just happened
      ownIt ? 0 : 1, // is it this errand's own phrase
      state.functions[p.drills] ?? 0, // and then: what have you used least
    ];
  };

  const scored = [
    ...pool.map((p) => ({ p, key: rank(p, true) })),
    ...rest.map((p) => ({ p, key: rank(p, false) })),
  ].sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);

  /**
   * THE TIE-BREAK NEEDS ROOM, BUT NOT ALWAYS.
   *
   * Sorted strictly, the practice count never decides anything: the first
   * function in `wants` wins every time, because no two phrases with different
   * `drills` can tie on it. The first version of this file claimed the coldest
   * function survived as a tie-break and it did not — the test caught it.
   *
   * The fix is not to widen the band by default. Widening it always broke the
   * case that matters most: she could not hear you, and the card offered a
   * price question instead of "say it again", because the price question
   * belonged to the errand and outranked it on the second key. When she has
   * misheard you there is one right answer and no appetite for variety.
   *
   * So the band opens only once the best answer has gone stale — when this
   * learner has produced that function three times already. Then "come down a
   * little" and "that is too much" are treated as equally correct, which they
   * are, and the one used less wins.
   */
  const STALE = 3;
  const head = scored[0];
  const ordered =
    !head || head.key[2] < STALE
      ? scored
      : [...scored].sort((a, b) => {
          const near = (x: typeof a) => (x.key[0] <= head.key[0] + 1 ? 0 : 1);
          return (
            near(a) - near(b) || a.key[2] - b.key[2] || a.key[1] - b.key[1] || a.key[0] - b.key[0]
          );
        });

  /**
   * THE ALTERNATIVES ANSWER THE SAME TURN THE HEADLINE DOES.
   *
   * They used to be "the next things in the ranking that are not pointless",
   * which let anything the world had not explicitly vetoed through — so
   * mid-haggle, with ₹45 on the table and the card saying close it, the line
   * underneath offered "ਸਤ ਸ੍ਰੀ ਅਕਾਲ · Hello".
   *
   * That was the third surface on this card computed by its own route: the
   * headline comes from the model and is vetted against `wants`, the reason
   * comes from the engine's read of the errand, and these came from the bank
   * filtered only by the veto. Three paths, one card, and they could disagree
   * with each other in front of the player. They are all `wants` now.
   *
   * If that leaves nothing, the card shows no alternatives. An empty line is
   * better than a wrong one: a learner reading "or: hello" halfway through a
   * negotiation has been told the software is not following.
   */
  const say = ordered[0]?.p ?? null;
  const also: PhraseSpec[] = [];
  for (const { p } of ordered.slice(1)) {
    if (also.length >= 2) break;
    if (!say || p.drills === say.drills) continue;
    if (!wants.includes(p.drills)) continue;
    if (also.some((q) => q.drills === p.drills)) continue;
    if (pointless(p.drills, state, mission, characterId)) continue;
    also.push(p);
  }

  return { say, also, because, wants };
}
