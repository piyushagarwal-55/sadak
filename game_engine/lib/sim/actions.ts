/**
 * THE ACTION LAYER — where a model's proposal meets the engine.
 *
 * Everything else in `lib/sim` describes the world. This file is the only place
 * a conversation is allowed to change it, and it is therefore the whole of
 * "the model controls behaviour, it never controls reality" as executable code.
 *
 * The model returns an act: a verb and at most one target, both drawn from
 * lists rendered into the same prompt. It returns no numbers at all. This file
 * decides whether the act is legal, does the arithmetic itself, and hands
 * `state.ts` a list of mutations that `vet()` still gets the last word on.
 *
 * TWO GUARDS DO ALL THE WORK
 *
 * **The assent gate.** Before `accept`, `tell` or `point` writes anything, the
 * player's own last utterance must align with one of the mission's authored key
 * phrases — `scoreAttempt` from the shipped lesson scorer, no model involved.
 * Without it every one of these verbs could fire while the player sat silent or
 * spoke English, because the model is the one proposing them and the model is
 * perfectly willing. With it, a run cannot be completed in English: an English
 * sentence does not align with a Telugu phrase. That is structural, not a
 * scoring penalty, and it survives the failure everybody feared — if Saaras
 * transliterates English into Telugu letters, "how much is this" still does not
 * align with `కిలో ఎంత?`.
 *
 * **The answer token.** `tell` and `point` are the two places the engine would
 * otherwise be taking the model's word that information had been conveyed. So
 * the reply must actually contain the thing: the board name for a stall, the
 * digits for a closing time. A substring test, sub-millisecond, and it is
 * deterministic evidence that the sentence was said rather than claimed.
 *
 * HARD AND SOFT
 *
 * A soft act that fails is dropped and the model's line is still spoken —
 * nothing material moved, so nothing was misrepresented. A hard act that fails
 * discards the line entirely and speaks a hand-written refusal instead, because
 * the alternative is a voice saying "here are your tomatoes" over a bag that
 * stayed empty.
 */

import { scoreAttempt } from "@/lib/game/speech-score";
import { looksLikeTargetScript } from "@/lib/game/prompt";
import { SAY, sayIn, type RefusalReason } from "./say";
import type {
  LanguageFunction,
  MissionNode,
  Mutation,
  PhraseClass,
  PhraseSpec,
  Scenario,
  SimCharacter,
  WorldState,
} from "./schema";

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

export const VERBS = [
  "greet",
  "clarify",
  "quote",
  "concede",
  "accept",
  "refuse",
  "point",
  "tell",
  "end",
] as const;

export type Verb = (typeof VERBS)[number];

/** Hard verbs move something material and are refused loudly when illegal. */
const HARD: ReadonlySet<Verb> = new Set(["accept", "point", "tell"]);

/** What the model returns, once the JSON has been parsed. No numbers, ever. */
export type ProposedAct = {
  verb: Verb;
  /** An item id, a slot id or an info key, depending on the verb. */
  target?: string;
  /** The NPC's line, in the target script. Checked for answer tokens. */
  replyNative: string;
};

export type ActOutcome = {
  ok: boolean;
  /** Why it was refused, for the log and the debrief. Null when it landed. */
  reason: string | null;
  /** Proposed to `applyMutations`; `vet()` may still refuse any of them. */
  mutations: Mutation[];
  /**
   * When a HARD act is refused, the line the vendor speaks instead. The model's
   * own reply is discarded, because it described something that did not happen.
   */
  overrideReply: string | null;
  /** Language functions the player produced this turn, from the assent match. */
  produced: LanguageFunction[];
};

/* ------------------------------------------------------------------ *
 * Refusals — hand-written, never generated
 * ------------------------------------------------------------------ */

/**
 * THE LINES THE ENGINE SAYS ITSELF.
 *
 * Four tables used to live here — refusals, their English, the price line, the
 * greeting — and every one of them covered Telugu, Hindi and Tamil and fell
 * back to Hindi for the other seven languages. Nobody noticed, because the only
 * worlds anybody played were Telugu, until somebody opened Amritsar and the
 * Punjabi shopkeeper said "आइए, क्या चाहिए?".
 *
 * They are one total map over every language now, in `say.ts`, where adding an
 * eleventh breaks the build rather than falling back. What is left here is the
 * five functions that read it, because the rest of the engine asks for a line
 * by reason and by verb and should not know where the sentences live.
 */
export function refusalFor(language: string, reason: string): string {
  const pack = sayIn(language).refusals;
  return pack[reason as RefusalReason] ?? pack.generic;
}

/**
 * What the engine's own refusal MEANS, in English.
 *
 * English rather than the player's language because these are fixed strings:
 * they go through `gloss()` at render, so the translation belongs in the
 * catalogue with every other piece of UI copy rather than in a model call.
 */
export function refusalMeaning(reason: string): string {
  const pack = SAY["en-IN"].refusals;
  return pack[reason as RefusalReason] ?? pack.generic;
}

/**
 * The price, said by the engine rather than by the model.
 *
 * Used when the model named a number the ladder did not sanction. Measured on a
 * live conversation: told to say ₹40 it said "యాభై" — fifty — and the player was
 * then charged off the rung. Hearing one price and paying another is the
 * failure this whole design exists to prevent, and it arrives through the reply
 * text rather than through the action, where nothing was checking.
 */
export function priceLineFor(language: string, amount: number): string {
  return sayIn(language).price(amount);
}

/** The same sentence in English, for the subtitle under it. */
export function priceMeaningFor(amount: number): string {
  return SAY["en-IN"].price(amount);
}

/**
 * WHAT SHE SAYS WHEN THE ENGINE MOVED HER ACT.
 *
 * `settleAct` repairs an act that its own extraction or the world does not
 * support, and when it does, the model's words are about the act it picked
 * rather than the one it got — "here, take it, here is your change" attached to
 * a turn where nothing changed hands. Those words cannot go on the screen.
 *
 * For a price this is already solved: `priceLineFor` says the number the ladder
 * sanctioned. These two cover the rest. They fire rarely — the stage block in
 * the prompt exists so the model does not get here — but a shopkeeper saying
 * something ordinary beats one describing a sale that did not happen.
 */
export function downgradeReply(
  language: string,
  verb: Verb
): { native: string; en: string } | null {
  if (verb === "greet") return sayIn(language).greetBack;
  if (verb === "clarify") {
    return { native: refusalFor(language, "no_assent"), en: refusalMeaning("no_assent") };
  }
  // quote and concede are covered by the price line, which has to say the
  // number the ladder sanctioned anyway.
  return null;
}


/**
 * Every rupee figure this character could possibly be quoting.
 *
 * Both ends of each ladder they can see, and the rung between. Used to tell a
 * price apart from a platform number or a quantity, which is the only hard part
 * of noticing that somebody has named a price they are not charging.
 */
export function ladderNumbers(state: WorldState, character: SimCharacter): Set<number> {
  const out = new Set<number>();
  for (const key of character.knows) {
    if (!key.startsWith("price.")) continue;
    const [, slot, item] = key.split(".");
    if (!slot || !item) continue;
    for (const n of ladder(state, slot, item)) if (n > 0) out.add(n);
  }
  return out;
}

/**
 * THE PRICE SHE IS NOT CHARGING.
 *
 * Measured twice, on two different seeds: two turns after taking the money for
 * the tomatoes, Lakshmi said "ఇవ్వండి ₹70" — a figure for a sale that had
 * already closed, at a total nobody had ever been charged. No rupee moved,
 * because the engine had long since done the arithmetic and `accept` on a
 * finished mission writes nothing. But the player HEARS ₹70, and a voice asking
 * for money that is not owed is indistinguishable, from the other side of the
 * screen, from a broken economy.
 *
 * Telling her not to in the prompt was tried first and did not hold. So the
 * sentence is dropped instead — but only ever a sentence that is about money,
 * and only on a turn with no sale live in it.
 *
 * ₹ IS THE MARKER, NOT THE DIGITS
 *
 * The first cut matched digits against her price ladder, which misses the thing
 * it was written for: ₹70 was two kilos at ₹35 and appears on no ladder at all.
 * The second cut matched every number, which eats "platform 4" at the station.
 * The rupee sign is the honest test, and it is already guaranteed — the price
 * block demands prices in digits written as "₹40" precisely so the engine can
 * find them. A ladder figure without the sign is caught as well, because that
 * is exactly the shape of a re-quote.
 */
export function dropPhantomPrice(reply: string, prices: Set<number>): string {
  const parts = reply.split(/(?<=[।.!?])\s+/).filter(Boolean);
  const aboutMoney = (part: string) =>
    part.includes("₹") || (part.match(/\d+/g) ?? []).some((n) => prices.has(Number(n)));

  const kept = parts.filter((p) => !aboutMoney(p));
  if (kept.length) return kept.join(" ");
  // Never returns nothing. A vendor struck silent by her own bookkeeping is a
  // worse bug than the one this fixes, so when every sentence is about money the
  // money comes out and the sentences stay.
  const stripped = reply
    .replace(/₹\s?\d+/g, "")
    .replace(/\d+/g, (n) => (prices.has(Number(n)) ? "" : n))
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped || reply;
}

/**
 * The rupee amount this act should have spoken, or null if it names no price.
 *
 * Read AFTER the act has been applied, so the rung is the one the customer is
 * actually being offered.
 */
export function expectedAmount(
  state: WorldState,
  mission: MissionNode | null,
  verb: Verb
): number | null {
  const t = mission?.template;
  if (!t || t.kind !== "buy") return null;
  // NOT `accept`. Naming the price is the whole content of a quote and of a
  // concession, so a quote whose digits are missing or wrong has to be replaced.
  // An acceptance is a different sentence: "alright, here you go" is exactly
  // what somebody says while handing over a bag, and forcing the engine's
  // "₹35. That is all." over the top of it made her sound like a till. The
  // money itself was never at risk either way — the engine has already charged
  // the ladder.
  if (verb !== "quote" && verb !== "concede") return null;
  const rung = currentRung(state, t.slot, t.item);
  if (rung === null) return null;
  return ladder(state, t.slot, t.item)[Math.min(rung, 2)];
}

/* ------------------------------------------------------------------ *
 * Assent
 * ------------------------------------------------------------------ */

/**
 * WHAT THE PLAYER JUST DID, as the model heard it.
 *
 * This is the extraction, and it is the thing that replaced a phrase checklist.
 * The old gate asked "did they say one of these five authored sentences", which
 * is a perfectly sound way to guarantee somebody spoke Telugu and a terrible
 * way to have a conversation — every run walked the same list in the same order
 * and felt like a form with a microphone attached.
 *
 * So the model now reports what it HEARD as a separate field from what it DOES,
 * and the two are cross-checked. It is the pattern `gideon-ai-voice` uses for
 * the same reason its own note gives: the free-form reply text never becomes
 * the source of truth, a structured read of the user's turn does.
 */
export const HEARD = ["greet", "ask", "haggle", "accept", "refuse", "english", "silence", "unclear"] as const;

export type Heard = (typeof HEARD)[number];

/** Which readings of the player's turn authorise which verb. */
const HEARD_ALLOWS: Partial<Record<Verb, readonly Heard[]>> = {
  // NOT `haggle`. It was there on the theory that pushing back can close a
  // deal, and measured against a real run it collapsed the sale: the player
  // said "come down a little", the model read it as a haggle, and she went
  // straight from ₹35 to the floor and handed the bag over. Agreeing has to be
  // agreeing. Making the close explicit is also most of what turns a two-line
  // exchange into a conversation with an arc.
  accept: ["accept"],
  tell: ["ask"],
  point: ["ask"],
};

/** Readings that can never authorise anything material. */
const NEVER_ENOUGH: readonly Heard[] = ["english", "silence", "unclear"];

/**
 * WHEN THE MODEL CONTRADICTS ITSELF.
 *
 * It reports what it HEARD and it chooses what it DOES, and those two fields
 * sometimes disagree: it hears a greeting and reaches for `accept`, or hears
 * somebody agreeing and reaches for `tell`. The gate then refuses the act, her
 * words are discarded, and she says the engine's "what did you say? say it
 * again" — to a player whose Telugu was perfectly good and who had simply said
 * hello. Measured: a clean 75% greeting answered with a refusal.
 *
 * The extraction is the more trustworthy of the two. It is a report about
 * something that already happened, where the act is a decision about what
 * happens next, and everything else in this design treats the report as the
 * load-bearing one. So the act is brought into line with it rather than the
 * turn being thrown away: a greeting gets greeted back, and anything else that
 * does not add up becomes "I did not catch that", which is honest and is what a
 * person would say.
 *
 * This is not a way past the gate. `greet` and `clarify` write nothing anybody
 * could want — a flag and a counter — so an act downgraded here has been
 * downgraded out of mattering. What it buys is that the refusal path is left
 * for things that are actually refusals.
 */
/**
 * WHAT A PERSON WOULD DO, GIVEN WHAT THEY HEARD.
 *
 * Reached only when the act the model chose is not one its own extraction
 * supports. `clarify` used to be the catch-all here and it was much too harsh:
 * measured, the customer asked "కిలో ఎంతా?" — a clean price question at 80% —
 * the model reached for `accept` as it always does, and the engine replaced her
 * words with "ఏమన్నారు? మళ్ళీ చెప్పండి". She went deaf at the exact moment the
 * player did the right thing, twice in a row, and the card froze telling them
 * to ask a price she had already named.
 *
 * So the repair answers what was HEARD rather than punishing what was chosen. A
 * question gets a price, a push-back gets a concession, a greeting gets a
 * greeting, a refusal gets her holding her ground. Only something genuinely
 * unintelligible gets "say it again", which is the one case where it is true.
 */
const RESPONSE_TO: Partial<Record<Heard, Verb>> = {
  greet: "greet",
  ask: "quote",
  haggle: "concede",
  refuse: "refuse",
};

export function settleVerb(verb: Verb, heard: Heard | null, sells = true): Verb {
  const needs = HEARD_ALLOWS[verb];
  if (!needs || !heard) return verb;
  if (needs.includes(heard)) return verb;

  const answer = RESPONSE_TO[heard];
  if (!answer) return "clarify";

  // `quote` and `concede` are about a price, so they need something priced. A
  // character with nothing for sale answering a question is just talking, and
  // `greet` is the verb that means talking.
  if (!sells && (answer === "quote" || answer === "concede")) return "greet";
  return answer;
}

/**
 * THE ACT, RECONCILED WITH EVERYTHING THAT IS TRUE.
 *
 * Two repairs, in order, and both of them exist because the model is asked for
 * one word and sometimes picks a word that the rest of its own answer — or the
 * rest of the world — does not support.
 *
 * ITS OWN EXTRACTION. It reports what it HEARD and separately chooses what it
 * DOES, and those disagree: it hears a greeting and reaches for `accept`. The
 * report is the more trustworthy of the two — it is about something that has
 * already happened, where the act is a guess about what happens next — so the
 * act is brought into line with it. A greeting gets greeted back; anything else
 * that does not add up becomes "I did not catch that".
 *
 * THE WORLD. You cannot hand over what you have not priced. Measured one turn
 * into a run: "here, take it, here is your change", before any price existed.
 * The engine refused it, correctly, and the refusal made her say a canned line
 * — so the sale was safe and the conversation was ruined. Turning it into the
 * naming of a price instead is both what she should have done and what the
 * player needed to hear.
 *
 * `changed` is the whole reason this returns an object. When the verb moves,
 * the model's words described the act it picked, not the one it got, and the
 * caller has to replace them. Words that describe something that did not happen
 * are the one thing this architecture exists to prevent.
 */
export function settleAct(
  verb: Verb,
  heard: Heard | null,
  state: WorldState,
  mission: MissionNode | null,
  /** The info keys this character actually holds, and what she aimed at. */
  known: { info: readonly string[]; target?: string } = { info: [] }
): { verb: Verb; changed: boolean; mute: boolean } {
  const t0 = mission?.template;
  let settled = settleVerb(verb, heard, t0?.kind === "buy");

  // Answering a question about something she was never told is not telling
  // them anything, but it is not a crime either. Measured: "do you have
  // tomatoes?" was answered with `tell`, refused for `dont_know`, and she said
  // the canned "I do not know" about the only thing on her stall. It is chat,
  // so it becomes chat — and her own words stand, because they were true.
  if (
    (settled === "tell" || settled === "point") &&
    !known.info.includes(known.target ?? "")
  ) {
    settled = "greet";
  }

  const priced = t0?.kind === "buy" && currentRung(state, t0.slot, t0.item) !== null;
  if (!priced && (settled === "accept" || settled === "concede")) settled = "quote";

  // WHETHER HER WORDS SURVIVE IS A SEPARATE QUESTION FROM WHETHER THE VERB DID.
  //
  // Only `accept` and `concede` write a sentence about something changing
  // hands — "here, take it, here is your change". When one of those is moved,
  // the words described a transfer that did not happen and cannot be said out
  // loud. A `tell` that turns out to be chat wrote an ordinary sentence about
  // her tomatoes, and throwing that away for a canned line is how the whole
  // thing started sounding like a form again.
  const transfers = verb === "accept" || verb === "concede";
  return { verb: settled, changed: settled !== verb, mute: transfers && settled !== verb };
}

export type AssentResult = {
  ok: boolean;
  phrase: PhraseSpec | null;
  accuracy: number;
  /** Which signal refused it, so the vendor can say something apt. */
  reason?: string;
};

/**
 * Did the player actually say something that authorises this?
 *
 * Scored against the mission's own key phrases, filtered to the classes that
 * may authorise this verb. The class filter is what stops a reciter: firing the
 * price question eleven times assents to `tell` forever and never to `accept`,
 * because the price question is `ask`-class and `accept` only takes `close` or
 * `haggle`.
 *
 * The best-scoring phrase is returned even when it fails, so the caller can log
 * how close the player got — which is the difference between "nothing happened"
 * and "you were nearly there".
 */
/**
 * MAY THIS ACT MOVE THE WORLD?
 *
 * Two independent signals, and both must hold. Neither is a checklist.
 *
 *   SCRIPT   the transcript has to contain characters of the target script.
 *            Deterministic, free, and it is what makes "you cannot finish this
 *            run in English" a fact about the code rather than a scoring
 *            penalty.
 *
 *   HEARD    the model's structured read of what the customer just did, which
 *            has to be consistent with the act. A shopkeeper who says `accept`
 *            while reporting that she heard silence is overruled.
 *
 * The phrase bank is still there, and still matters — it is what the hints are
 * drawn from and what the per-word score paints against — but it is no longer
 * the gate. A learner may say the thing any way they like.
 *
 * WHY TWO AND NOT ONE
 *
 * Script alone passes English transliterated into Telugu letters, which is the
 * exact failure Saaras produces most often. `heard: "english"` catches it.
 * `heard` alone puts the guarantee inside the model, which is the one place
 * this architecture refuses to put anything load-bearing. Together they need
 * both a transcript that looks like the language and a model willing to say so.
 */
export function assent(
  scenario: Scenario,
  verb: Verb,
  transcript: string,
  heard: Heard | null
): AssentResult {
  const needs = HEARD_ALLOWS[verb];
  if (!needs) return { ok: true, phrase: null, accuracy: 1 };

  const said = transcript.trim();
  if (!said) return { ok: false, phrase: null, accuracy: 0, reason: "silence" };

  if (!looksLikeTargetScript(said, scenario.script)) {
    return { ok: false, phrase: null, accuracy: 0, reason: "not_the_language" };
  }
  if (!heard || NEVER_ENOUGH.includes(heard)) {
    return { ok: false, phrase: null, accuracy: 0, reason: heard ?? "unclear" };
  }
  if (!needs.includes(heard)) {
    return { ok: false, phrase: null, accuracy: 0, reason: "wrong_intent" };
  }

  // Passed. The phrase match is reported for the score, never for the gate.
  const best = closestPhrase(scenario, said);
  return { ok: true, phrase: best.phrase, accuracy: best.accuracy };
}

/** The phrase this utterance came closest to, for scoring and for the hint. */
export function closestPhrase(
  scenario: Scenario,
  transcript: string
): { phrase: PhraseSpec | null; accuracy: number } {
  let phrase: PhraseSpec | null = null;
  let accuracy = 0;
  if (!transcript.trim()) return { phrase, accuracy };
  for (const candidate of scenario.phrases) {
    const r = scoreAttempt(candidate.native, transcript);
    if (r.accuracy > accuracy) {
      accuracy = r.accuracy;
      phrase = candidate;
    }
  }
  return { phrase, accuracy };
}

/**
 * Every phrase the player's utterance matched, of any class.
 *
 * Separate from `assent` because the function ledger should credit a learner
 * for producing a greeting even on a turn where they were trying to close a
 * deal. Assent decides whether the world moves; this decides what they learnt.
 */
/**
 * Credited at the GREEN band, not the assent band.
 *
 * Assent is deliberately forgiving — 0.40 — because a learner who got most of a
 * sentence out should see the world move. Crediting a language function as
 * LEARNT is a different claim and deserves a different bar. Measured on a live
 * run: "కిలో ఎంత?" (how much a kilo?) scored above 0.40 against "ఒక కిలో
 * ఇవ్వండి" (give me one kilo), because they share the word for kilo — so asking
 * a price credited the player with specifying a quantity, and the panel then
 * stopped offering the phrase they had never actually said.
 *
 * 0.72 is `speech-score`'s own green threshold, so "you can do this" means the
 * same thing here as it does on the shipped lesson meter.
 */
const CREDIT_THRESHOLD = 0.72;

/**
 * What the model's read of the turn is worth, when the phrase bank is silent.
 *
 * The bank can only credit a function if the learner said something close to a
 * sentence somebody wrote down, which was fine while that was the only way to
 * play and is now the bug it used to be the feature of: measured on the first
 * free-speech run, "టమాటా ధర ఎంత చెప్పండి" — a perfectly ordinary way to ask a
 * price — scored 0.48 against "కిలో ఎంత?" and credited nothing. The learner
 * asked a price and the ledger said they had never asked a price, so the hint
 * never faded and the run scorer marked them down for breadth they had.
 *
 * `accept` is deliberately not in here. Agreeing is the one move the world
 * already records — it moves money and a mission — and crediting a language
 * function for it as well would pay twice for the same sentence.
 */
const HEARD_FUNCTION: Partial<Record<Heard, LanguageFunction>> = {
  greet: "greet",
  ask: "ask_price",
  haggle: "negotiate",
  refuse: "refuse",
};

/**
 * Which functions this utterance counted as practising.
 *
 * Two sources, unioned. The phrase bank is the precise one — it knows that
 * "అర కిలో" is quantity and not price — and it only speaks when the learner came
 * close to something authored. The model's read is the wide one, and it is what
 * keeps a learner who says it their own way on the ledger at all.
 *
 * `verb` sharpens one case the read cannot: a question answered by the vendor
 * pointing down the lane was a question about a PLACE, whatever it sounded like.
 */
export function producedFunctions(
  scenario: Scenario,
  transcript: string,
  heard?: Heard | null,
  verb?: Verb
): LanguageFunction[] {
  if (!transcript.trim()) return [];
  const out = new Set<LanguageFunction>();
  for (const phrase of scenario.phrases) {
    if (scoreAttempt(phrase.native, transcript).accuracy >= CREDIT_THRESHOLD) {
      out.add(phrase.drills);
    }
  }
  if (heard) {
    const wide = HEARD_FUNCTION[heard];
    if (wide) out.add(heard === "ask" && (verb === "point" || verb === "tell") ? "ask_location" : wide);
  }
  return [...out];
}

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

export function ladder(state: WorldState, slot: string, item: string): [number, number, number] {
  const opening = Number(state.facts[`price.${slot}.${item}`] ?? 0);
  const floor = Number(state.facts[`floor.${slot}.${item}`] ?? 0);
  return [opening, Math.round((opening + floor) / 2 / 5) * 5, floor];
}

/** Which rung is currently on the table, or null if no price has been named. */
export function currentRung(state: WorldState, slot: string, item: string): number | null {
  const v = state.facts[`rung.${slot}.${item}`];
  return typeof v === "number" ? v : null;
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

export type ActContext = {
  scenario: Scenario;
  state: WorldState;
  characterId: string;
  /** The active mission this character is on the hook for, if any. */
  mission: MissionNode | null;
  /** What the player said this turn, as Saaras transcribed it. */
  transcript: string;
  /** The model's structured read of that turn. The other half of the gate. */
  heard?: Heard | null;
  /**
   * Board names and answer tokens the reply must contain for `point` and
   * `tell` to count, keyed by target. Supplied by the world, which hung the
   * boards and therefore knows what they say.
   */
  answerTokens?: Record<string, string[]>;
};

/**
 * Turns one proposed act into mutations, or into a refusal.
 *
 * Pure. Takes state, returns what should change — so the same function runs in
 * the route handler and in a test, and neither can accidentally half-apply.
 */
export function resolveAct(ctx: ActContext, act: ProposedAct): ActOutcome {
  const { scenario, state, characterId, mission } = ctx;
  const lang = scenario.language;
  const produced = producedFunctions(scenario, ctx.transcript, ctx.heard ?? null, act.verb);

  const refuse = (reason: string): ActOutcome => ({
    ok: false,
    reason,
    mutations: [],
    overrideReply: HARD.has(act.verb) ? refusalFor(lang, reason) : null,
    produced,
  });
  const allow = (mutations: Mutation[] = []): ActOutcome => ({
    ok: true,
    reason: null,
    mutations,
    overrideReply: null,
    produced,
  });

  // A vendor who has walked off cannot do anything at all, including talk.
  if (state.facts[`away.${characterId}`] === true) return refuse("away");

  switch (act.verb) {
    case "greet":
      return allow([{ kind: "fact", key: `greeted.${characterId}`, value: true }]);

    case "end":
      return allow();

    case "clarify": {
      const key = `clarify.${characterId}`;
      return allow([{ kind: "fact", key, value: Number(state.facts[key] ?? 0) + 1 }]);
    }

    case "refuse":
      return allow();

    case "quote": {
      const t = ctx.mission?.template;
      // Nothing on the table is not the same as "I do not sell that". Measured:
      // two turns after the tomatoes were bought and paid for, every further
      // word about them got the canned "అది నా దగ్గర లేదు" — she does not have
      // it — about the thing she had just sold. She is simply allowed to talk.
      if (!t || t.kind !== "buy") return allow();
      if (act.target !== t.item) return refuse("not_mine");
      // Naming a price sets the top rung. It cannot re-open a conceded haggle:
      // a model that quotes again after conceding would otherwise walk the
      // price back up, which reads as the engine forgetting.
      if (currentRung(state, t.slot, t.item) !== null) return allow();
      return allow([{ kind: "fact", key: `rung.${t.slot}.${t.item}`, value: 0 }]);
    }

    case "concede": {
      const t = ctx.mission?.template;
      if (!t || t.kind !== "buy") return allow();
      if (act.target !== t.item) return refuse("not_mine");
      const rung = currentRung(state, t.slot, t.item);
      if (rung === null) return refuse("generic");
      // The floor is the floor. This is the line that makes the economy real.
      if (rung >= 2) return refuse("below_floor");
      return allow([{ kind: "fact", key: `rung.${t.slot}.${t.item}`, value: rung + 1 }]);
    }

    case "accept": {
      const t = ctx.mission?.template;
      // NOTHING TO SELL IS NOT A REFUSAL.
      //
      // `accept` with no live purchase behind it used to be a hard refusal, so
      // the vendor's line was thrown away and replaced with "I do not have
      // that" — which, said to a customer who has just paid and is making
      // conversation, reads as a malfunction. The world still does not move: no
      // mutations, no money, nothing. She is simply allowed to talk.
      if (!t || t.kind !== "buy") return allow();
      if (act.target !== t.item) return refuse("not_mine");

      // The gate says WHICH of its two signals refused, so the shopkeeper can
      // say something apt: "say it in Telugu" is a different sentence from
      // "what was that?", and a learner who spoke English deserves the first.
      const { ok, reason } = assent(scenario, "accept", ctx.transcript, ctx.heard ?? null);
      if (!ok) return refuse(reason === "not_the_language" ? "not_the_language" : "no_assent");

      const rung = currentRung(state, t.slot, t.item);
      if (rung === null) return refuse("generic");

      const rungs = ladder(state, t.slot, t.item);
      const unit = rungs[Math.min(rung, 2)];
      const total = unit * t.qty;

      const stock = Number(state.facts[`stock.${t.slot}.${t.item}`] ?? 0);
      if (stock < t.qty) return refuse("no_stock");

      const wallet = Number(state.facts.wallet ?? 0);
      if (wallet < total) return refuse("no_money");

      // The milestones. Every threshold this mission could care about is
      // collapsed into a boolean right here, in the code that owns the
      // arithmetic — which is why `completeWhen` never has to compare numbers
      // and why `Condition` never needed a comparison operator.
      return allow([
        { kind: "fact", key: "wallet", value: wallet - total },
        { kind: "fact", key: `bag.${t.item}`, value: Number(state.facts[`bag.${t.item}`] ?? 0) + t.qty },
        { kind: "fact", key: `stock.${t.slot}.${t.item}`, value: stock - t.qty },
        { kind: "fact", key: `deal.${t.slot}.${t.item}.price`, value: unit },
        { kind: "fact", key: `bought.${t.slot}.${t.item}`, value: true },
        { kind: "fact", key: `beat.${t.slot}.${t.item}`, value: unit < rungs[0] },
      ]);
    }

    case "tell":
    case "point": {
      const key = act.verb === "tell" ? act.target : act.target && `${act.target}_location`;
      if (!key) return refuse("dont_know");

      const factKey = `info.${key}`;
      if (!scenario.facts.some((f) => f.key === factKey)) return refuse("dont_know");

      const character = scenario.characters.find((c) => c.id === characterId);
      if (!character?.knows.includes(factKey)) return refuse("dont_know");

      const { ok, reason } = assent(scenario, act.verb, ctx.transcript, ctx.heard ?? null);
      if (!ok) return refuse(reason === "not_the_language" ? "not_the_language" : "no_assent");

      // The reply must actually carry the thing. Otherwise the engine is
      // believing the model's claim that information was conveyed, which is the
      // one thing this file exists not to do.
      const tokens = ctx.answerTokens?.[act.target!] ?? [];
      if (tokens.length && !tokens.some((tok) => act.replyNative.includes(tok))) {
        return refuse("dont_know");
      }

      return allow([{ kind: "fact", key: factKey, value: true }]);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Patience
 * ------------------------------------------------------------------ */

/**
 * Whether this turn should cost the vendor patience, and why.
 *
 * Only engine-detectable events, never a model's opinion of how it is going.
 * Never for bad grammar, a wrong script, a mis-transcription, a silent turn, or
 * asking the same question twice — the product committed to not punishing
 * anyone for speaking the language badly, and that commitment is inherited
 * literally.
 */
export function patienceCost(
  scenario: Scenario,
  state: WorldState,
  characterId: string,
  outcome: ActOutcome
): Mutation[] {
  const key = `patience.${characterId}`;
  const current = Number(state.facts[key] ?? scenario.stakes.patience);
  if (current <= 0) return [];

  const clarifyKey = `clarify.${characterId}`;
  const clarifies = Number(state.facts[clarifyKey] ?? 0);
  const turns = state.turns[characterId] ?? 0;

  let drop = false;
  if (clarifies >= 3) drop = true;
  else if (!outcome.mutations.length && turns > scenario.stakes.patienceGraceTurns) {
    // No assent and nothing moved, past the grace period. Every second such
    // turn, not every one, so a thoughtful pause is not punished at the same
    // rate as going in circles.
    drop = (turns - scenario.stakes.patienceGraceTurns) % 2 === 1;
  }
  if (!drop) return [];

  const next = Math.max(0, current - 1);
  const muts: Mutation[] = [{ kind: "fact", key, value: next }];
  if (clarifies >= 3) muts.push({ kind: "fact", key: clarifyKey, value: 0 });
  // Patience running out is a cooldown, never a mission failure: `MissionState`
  // has no path back from `failed`, so failing here would strand the graph and
  // the run would have no ending at all.
  if (next === 0) muts.push({ kind: "fact", key: `away.${characterId}`, value: true });
  return muts;
}
