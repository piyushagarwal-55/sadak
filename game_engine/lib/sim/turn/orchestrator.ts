/**
 * THE CONTROL PLANE FOR ONE TURN.
 *
 * Ported from `gideon-ai-voice`, `apps/agent/src/orchestrator/CallOrchestrator.ts`,
 * whose docblock reads: "the business control plane. Owns CallState, decides
 * which agent is active, validates every phase transition against the explicit
 * state machine, and is the single place that knows how to construct each
 * concrete Agent for a handoff." Gideon's `entry.ts` is two hundred lines of
 * wiring and event plumbing and does not contain one line of business logic.
 *
 * SADAK's turn route was seven hundred lines and was all of it: parsing a
 * request, tuning a scenario, deriving eleven prompt fragments, calling two
 * models, reconciling their answers, vetting a suggestion, doing the money,
 * scoring the turn, writing the history record, and serialising a response.
 * Every `state = ...` in the codebase lived in that one function.
 *
 * WHAT MOVING IT BUYS
 *
 * One object owns `state`, and it is private. Nothing outside these methods can
 * assign to it, which is the property gideon has and SADAK did not: a bug where
 * two places write the world in the wrong order stops being possible rather
 * than being something you check for in review.
 *
 * `TurnContext` alongside it owns everything derived, so "somebody forgot to
 * assemble a fragment" — the shape of the two worst bugs this branch shipped —
 * also stops being possible.
 *
 * The route is what `entry.ts` is: parse, validate, hand over, serialise.
 */

import { llmJson } from "../llm";
import { looksLikeTargetScript } from "@/lib/game/prompt";
import {
  closestPhrase,
  downgradeReply,
  dropPhantomPrice,
  expectedAmount,
  ladderNumbers,
  patienceCost,
  priceLineFor,
  priceMeaningFor,
  refusalFor,
  refusalMeaning,
  resolveAct,
  settleAct,
  type ProposedAct,
  type Verb,
  VERBS,
} from "../actions";
import { applyMutations, countFunction, countTurn, missionFor, recordSay, settle } from "../state";
import { scoreTurn } from "../turnscore";
import { becauseForMove, coachFor, vetCoachLine } from "../coach";
import { ExchangePhase, advance, phaseFromIntent } from "../exchange";
import { readTurn } from "../read";
import type { Scenario, SimCharacter, TurnRecord, WorldState } from "../schema";
import type { ObstacleChoice } from "../obstacles";
import { TurnContext } from "./context";
import { suggestReply } from "./suggest";

/** What the speaking call is allowed to return. Five keys, all of them her own. */
export type SpokenTurn = {
  act?: string;
  target?: string;
  reply_native?: string;
  reply_roman?: string;
  reply_meaning?: string;
};

export type TurnInput = {
  said: string;
  /** How the words arrived. The scorer excludes turns we could not hear. */
  input: "voice" | "text";
  /** False when STT came back empty on audio that was actually recorded. */
  heardAudio: boolean;
};

export type TurnResponse = Record<string, unknown>;

export class TurnOrchestrator {
  readonly scenario: Scenario;
  readonly character: SimCharacter;

  /**
   * The world. Private, and it stays private.
   *
   * Every write goes through a method on this class. That is the whole point of
   * the port: the ordering bugs this codebase kept producing — a price checked
   * before the mutation that set it, a phase read before `settle` — were all
   * "two places wrote the state and one of them ran first".
   */
  private state: WorldState;
  private context: TurnContext;

  private readonly obstacles: ObstacleChoice[];
  private readonly seed: number;
  private readonly baseLang: string;

  constructor(params: {
    scenario: Scenario;
    character: SimCharacter;
    state: WorldState;
    obstacles: ObstacleChoice[];
    seed: number;
    baseLang: string;
  }) {
    this.scenario = params.scenario;
    this.character = params.character;
    this.state = params.state;
    this.obstacles = params.obstacles;
    this.seed = params.seed;
    this.baseLang = params.baseLang;
    this.context = this.rebuild();
  }

  private rebuild(): TurnContext {
    return new TurnContext({
      scenario: this.scenario,
      state: this.state,
      character: this.character,
      obstacles: this.obstacles,
      seed: this.seed,
      baseLang: this.baseLang,
    });
  }

  /** Every write to the world funnels through here, so the context never lags. */
  private commit(next: WorldState): void {
    this.state = next;
    this.context = this.rebuild();
  }

  private get lang(): string {
    return this.scenario.language;
  }

  private record(record: TurnRecord): void {
    this.commit({
      ...this.state,
      history: [...(this.state.history ?? []), record],
      version: this.state.version + 1,
    });
  }

  /**
   * A recording with nothing in it.
   *
   * Recorded rather than dropped: "more than a third of this run was unheard,
   * so there is no fair score" is a promise `scoreRun` can only keep if the
   * unheard turns exist. Never reaches a model — there is nothing to answer.
   */
  unheard(input: TurnInput): TurnResponse {
    this.record({
      n: (this.state.history?.length ?? 0) + 1,
      clock: this.state.clock,
      characterId: this.character.id,
      input: input.input,
      said: "",
      tokens: 0,
      sttOk: false,
      silent: true,
      assent: null,
      distinctContent: false,
      act: null,
      rejected: null,
      nullTurn: false,
      points: 0,
    });

    return {
      state: this.state,
      reply: {
        native: refusalFor(this.lang, "no_assent"),
        roman: "",
        en: refusalMeaning("no_assent"),
      },
      turn: {
        points: 0,
        label: "We could not hear you",
        parts: { understood: 0, landed: 0, fit: 0, fresh: 0 },
      },
      // Nothing reached the model, so there is no suggestion — and the panel
      // reads a missing one as "fall back to the bank", which swapped the
      // sentence out from under somebody mid-attempt.
      coach: { repeat: true },
    };
  }

  /** The model wrote nothing usable. An engine failure costs the player nothing. */
  private nullTurn(input: TurnInput, said: string): TurnResponse {
    this.record({
      n: (this.state.history?.length ?? 0) + 1,
      clock: this.state.clock,
      characterId: this.character.id,
      input: input.input,
      said,
      tokens: said.split(/\s+/).filter(Boolean).length,
      sttOk: true,
      silent: !said,
      assent: null,
      distinctContent: false,
      act: null,
      rejected: null,
      nullTurn: true,
    });

    return {
      state: this.state,
      reply: { native: refusalFor(this.lang, "no_assent"), roman: "", en: refusalMeaning("no_assent") },
      turn: {
        points: 0,
        label: "That did not go through",
        parts: { understood: 0, landed: 0, fit: 0, fresh: 0 },
      },
      coach: { repeat: true },
      nullTurn: true,
    };
  }

  /**
   * One turn, start to finish.
   *
   * The order below is the design and none of it is negotiable:
   *
   *   1. the player's words go into the record
   *   2. one call reads what they did; another, at the same time, writes what
   *      she says back
   *   3. the two are reconciled, and the act is decided
   *   4. `resolveAct` says whether it is legal and does the arithmetic
   *   5. `applyMutations` vets every write against the scenario
   *   6. `settle` asks whether any errand is finished, from facts alone
   *   7. the phase is read off the world the turn produced
   */
  async run(input: TurnInput): Promise<TurnResponse> {
    const said = input.said.trim();

    this.commit(recordSay(this.state, this.character.id, "player", said));
    this.commit(countTurn(this.state, this.character.id));

    if (!input.heardAudio) return this.unheard(input);

    // SHE SPEAKS AND SOMEBODY ELSE LISTENS, AT THE SAME TIME. Neither call
    // needs the other's output, so this costs the slower of the two rather
    // than the sum. See `lib/sim/read.ts`.
    const ctx = this.context;
    const [read, raw] = await Promise.all([
      readTurn(this.scenario, this.state, this.character, said, ctx.phase),
      llmJson<SpokenTurn>(ctx.speakMessages(said), { maxTokens: 620, temperature: 0.8 }),
    ]);

    if (!raw?.reply_native) return this.nullTurn(input, said);

    return this.resolve({ input, said, read, raw, ctx });
  }

  /** Steps 3 to 7. Split out so `run` reads as the sequence it is. */
  private async resolve(args: {
    input: TurnInput;
    said: string;
    read: Awaited<ReturnType<typeof readTurn>>;
    raw: SpokenTurn;
    ctx: TurnContext;
  }): Promise<TurnResponse> {
    const { input, said, read, raw, ctx } = args;
    const { scenario, character } = this;
    const mission = ctx.mission;

    // An unknown verb is treated as a greeting rather than rejected: the reply
    // is usually fine and the act was the model's only chance to be wrong.
    const proposed: Verb = (VERBS as readonly string[]).includes(raw.act ?? "")
      ? (raw.act as Verb)
      : "greet";
    const heard = read?.heard ?? null;
    const target = raw.target?.trim() || undefined;

    const repaired = settleAct(proposed, heard, this.state, mission, {
      info: ctx.knownInfo,
      target: proposed === "point" ? `${target}_location` : target,
    });
    const verb = repaired.verb;

    // Latin letters break the voice and the point of the game. On failure she
    // says her own opening line, which is authored and always in script.
    let native = (raw.reply_native ?? "").trim();
    let roman = (raw.reply_roman ?? "").trim();
    const meaning = (raw.reply_meaning ?? "").trim();
    if (!looksLikeTargetScript(native, scenario.script)) {
      native = character.opening.native;
      roman = character.opening.roman;
    }

    // THE ACT MOVED, SO THE WORDS MOVE WITH IT. The reply was written about the
    // act the model picked, not the one it got.
    if (repaired.mute) {
      const swap = downgradeReply(this.lang, verb);
      if (swap) {
        native = swap.native;
        roman = "";
      }
    }

    // A shopkeeper does not monologue, and Bulbul charges by the character.
    // Room for three sentences; a ceiling, not a target.
    if (native.length > 360) {
      native = native.slice(0, 360).replace(/[^।.!?]*$/, "").trim() || native.slice(0, 360);
    }

    const act: ProposedAct = { verb, target, replyNative: native };
    const outcome = resolveAct(
      {
        scenario,
        state: this.state,
        characterId: character.id,
        mission,
        transcript: said,
        heard,
        answerTokens: ctx.answerTokens,
      },
      act
    );

    // Recorded whatever the act was: the scorer wants to know the player spoke
    // the language, not only that this verb was authorised by it.
    const best = closestPhrase(scenario, said);
    const words = said.toLowerCase().split(/\s+/).filter(Boolean);
    const seen = new Set(
      (this.state.history ?? []).flatMap((t) => t.said.toLowerCase().split(/\s+/))
    );
    const distinctContent = words.some((w) => w.length > 2 && !seen.has(w));

    const turn = scoreTurn({
      heard,
      landed: outcome.ok && verb !== "greet" && verb !== "clarify",
      accuracy: best.accuracy,
      fresh: distinctContent,
      inLanguage: looksLikeTargetScript(said, scenario.script),
      languageLabel: scenario.languageLabel,
    });

    const swapped = repaired.mute ? downgradeReply(this.lang, verb) : null;
    const spoken = outcome.overrideReply
      ? {
          native: outcome.overrideReply,
          roman: "",
          en: refusalMeaning(outcome.reason ?? "generic"),
        }
      : { native, roman, en: swapped ? swapped.en : meaning };

    const applied = applyMutations(scenario, this.state, outcome.mutations, {
      characterId: character.id,
    });
    this.commit(applied.state);

    // THE SPOKEN PRICE MUST BE THE CHARGED PRICE. Checked after the mutations
    // land, so the rung is the one the customer is actually being offered.
    const owed = outcome.ok ? expectedAmount(this.state, mission, verb) : null;
    const mustPrice = repaired.mute && (verb === "quote" || verb === "concede");
    if (owed !== null && (mustPrice || !spoken.native.includes(String(owed)))) {
      spoken.native = priceLineFor(this.lang, owed);
      spoken.roman = `${owed} rupees.`;
      spoken.en = priceMeaningFor(owed);
    } else if (!outcome.overrideReply && mission?.template.kind !== "buy") {
      // And the other direction: money named on a turn with no sale live in it.
      // The subtitles carry the same number, so they are cut the same way.
      const prices = ladderNumbers(this.state, character);
      spoken.native = dropPhantomPrice(spoken.native, prices);
      spoken.roman = dropPhantomPrice(spoken.roman, prices);
      spoken.en = dropPhantomPrice(spoken.en, prices);
    }

    // What they said is what they practised, whether or not the act landed.
    for (const fn of outcome.produced) this.commit(countFunction(this.state, fn));

    this.commit(
      applyMutations(
        scenario,
        this.state,
        patienceCost(scenario, this.state, character.id, outcome),
        { characterId: character.id }
      ).state
    );

    this.commit(recordSay(this.state, character.id, "npc", spoken.native));

    this.record({
      n: (this.state.history?.length ?? 0) + 1,
      clock: this.state.clock,
      characterId: character.id,
      input: input.input,
      said,
      tokens: words.length,
      sttOk: true,
      silent: words.length === 0,
      assent: best.phrase ? { phraseId: best.phrase.id, accuracy: best.accuracy } : null,
      distinctContent,
      points: turn.points,
      act: outcome.ok ? verb : null,
      rejected: outcome.ok ? null : { act: verb, reason: outcome.reason ?? "unknown" },
      nullTurn: false,
    });

    const settled = settle(scenario, this.state);
    this.commit(settled.state);

    // Read after `settle`, so it describes the world this turn produced.
    const phase = advance(scenario, this.state, character.id, phaseFromIntent(read?.intent)).phase;

    // BOTH OF THESE NEED HER LINE, SO BOTH WAIT FOR IT — AND THEN GO TOGETHER.
    //
    // The suggestion is the only serial hop in the turn, and it has to be: a
    // card cannot answer a sentence that is being written in the same breath.
    // That was the bug — "the tomatoes are finished" answered with "oh, what
    // good news" — and no amount of prompting fixes a reply written before the
    // thing it replies to exists.
    const [aside, coach] = await Promise.all([
      this.aside(said),
      this.suggest({ verb, outcome, spoken, said, before: ctx }),
    ]);

    return {
      state: this.state,
      aside,
      coach,
      phase,
      /** True when the panel should offer a way out rather than another prompt. */
      over: phase === ExchangePhase.DONE,
      reply: spoken,
      act: { verb, target: act.target ?? null, ok: outcome.ok, reason: outcome.reason },
      heard,
      turn,
      produced: outcome.produced,
      transitions: [...applied.transitions, ...settled.transitions],
    };
  }

  /**
   * The third voice, on the advanced band.
   *
   * Generated after everything that matters has already happened, on purpose:
   * by this line the act has resolved, the money has moved and the errands have
   * settled, so there is nothing left for her to affect even in principle.
   */
  private async aside(said: string) {
    const companions = this.context.companions;
    if (!companions.length) return null;

    const turnsHere = this.state.turns[this.character.id] ?? 0;
    if (!(turnsHere <= 1 || (turnsHere + this.seed) % 2 === 0)) return null;

    const who = companions[(turnsHere + this.seed) % companions.length];
    const line = await llmJson<{
      reply_native?: string;
      reply_roman?: string;
      reply_meaning?: string;
    }>(this.context.asideMessages(who, said), { maxTokens: 160, temperature: 0.9 });

    const native = (line?.reply_native ?? "").trim();
    // A bystander who cannot be heard simply did not speak. An aside is the one
    // thing in this loop that nothing depends on, so it may be dropped.
    if (!native || !looksLikeTargetScript(native, this.scenario.script)) return null;

    this.commit(recordSay(this.state, who.id, "npc", native.slice(0, 240)));
    return {
      characterId: who.id,
      name: who.name,
      native: native.slice(0, 240),
      roman: (line?.reply_roman ?? "").trim(),
      en: (line?.reply_meaning ?? "").trim(),
    };
  }

  /**
   * What to say back: the model's line when it passes its checks, the phrase
   * bank when it does not.
   *
   * `because` and the alternatives are the engine's either way — they are
   * statements about the world, and the world is not the model's to describe.
   */
  private async suggest(args: {
    verb: Verb;
    outcome: ReturnType<typeof resolveAct>;
    spoken: { native: string; en: string };
    said: string;
    /** The context as it was BEFORE this turn resolved. */
    before: TurnContext;
  }) {
    const { verb, outcome, spoken, said, before } = args;

    const advice = coachFor(
      this.scenario,
      this.state,
      this.context.mission,
      { verb, ok: outcome.ok, reason: outcome.reason },
      this.character.id
    );

    // The advice was written before the act resolved. Fine, usually — she knew
    // what she was about to say. Not fine on the turn the errand changes.
    const stale = this.context.mission?.id !== before.mission?.id;

    // `answer` is always allowed: replying to a question somebody just put to
    // you is never the wrong move, whatever the errand happens to want.
    const moves = [...new Set([...before.goal.wants, ...advice.wants, "answer"])];

    const proposal = await suggestReply({
      scenario: this.scenario,
      theySaid: { native: spoken.native, meaning: spoken.en },
      youSaid: said,
      goal: advice.because,
      example: before.goal.example
        ? { native: before.goal.example.native, gloss: before.goal.example.gloss }
        : null,
      moves,
      understands: this.context.understands,
    });

    const written = vetCoachLine(
      {
        native: proposal?.native,
        roman: proposal?.roman,
        meaning: proposal?.meaning,
        move: proposal?.move,
      },
      {
        script: this.scenario.script,
        saidByThem: spoken.native,
        saidByYou: said,
        stale,
        example: before.goal.example?.native ?? "",
        wants: moves,
        inScript: looksLikeTargetScript,
      }
    );

    /**
     * THE WHOLE CARD DESCRIBES THE SENTENCE ON IT.
     *
     * `advice.because` is the engine's read of the ERRAND, and the errand is
     * not always what the card is doing — she said the tomatoes were finished,
     * the card correctly asked when she would have more, and the line beneath
     * it still said "she has said hello, tell her what you came for", because
     * her act that turn was `greet`.
     *
     * Once a suggestion has passed the move check it has told us what it does,
     * and that is the honest description.
     */
    const liveBecause = written ? becauseForMove(proposal?.move) : null;

    return {
      native: written?.native ?? advice.say?.native ?? "",
      roman: written?.roman ?? advice.say?.roman ?? "",
      en: written?.en ?? advice.say?.gloss ?? "",
      because: liveBecause ?? advice.because,
      live: !!written,
      also: advice.also.map((p) => ({ native: p.native, gloss: p.gloss })),
      repeat:
        verb === "clarify" ||
        (!outcome.ok &&
          ["no_assent", "unclear", "not_the_language"].includes(outcome.reason ?? "")),
    };
  }

  /** For callers that need the world after the turn without re-reading it. */
  get world(): WorldState {
    return this.state;
  }

  /** Whether this character still owes the player anything. */
  get stillOwed(): boolean {
    return !!missionFor(this.scenario, this.state, this.character.id);
  }
}
