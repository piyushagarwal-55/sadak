/**
 * EXACTLY WHAT REACHES THE MODEL, DECIDED IN ONE PLACE.
 *
 * Ported from `gideon-ai-voice`, `apps/agent/src/orchestrator/ContextService.ts`.
 * Its docblock is the whole argument: "Decides exactly what reaches the LLM —
 * agent instructions, phase, known caller/matter state, missing fields, and
 * relevant policy. Deliberately does NOT dump the whole database or full
 * transcript." Four agents, four roles, one builder. Nothing else in gideon
 * constructs a prompt.
 *
 * SADAK'S TURN ROUTE HAD BEEN DOING IT INSTEAD, INLINE.
 *
 * Eleven derived values computed in the handler and passed down as options:
 * what she stocks, whether her prices move, who else is standing there, which
 * info keys she holds, what the answers are, what tokens prove she said one,
 * what she still wants, where the exchange is, what the learner is working
 * towards, which language they read, whether the engine overruled her last
 * turn. Each one was correct. Each one was also invisible from anywhere except
 * the one function that happened to build it.
 *
 * That is not a tidiness complaint. It is the direct cause of two shipped bugs:
 * she sent a customer to the bangle seller for tomatoes because no fragment
 * said what anybody else sold, and no compiled world could answer a question
 * because the fragment carrying the answer was never built. Both were "somebody
 * forgot to assemble a piece", and you cannot forget to assemble a piece of an
 * object that computes all of them in its constructor.
 *
 * WHAT THIS OWNS
 *
 * Everything derived from (scenario, state, character) that either prompt
 * needs, and the two prompts themselves. It reads the world; it never writes
 * to it. Mutation belongs to the orchestrator, which holds one of these and
 * rebuilds it whenever the state moves.
 */

import type { MissionNode, Scenario, SimCharacter, WorldState } from "../schema";
import { activeMissions, missionFor } from "../state";
import { goodById } from "../compile/goods";
import { phaseFromWorld, type ExchangePhase } from "../exchange";
import { goalFor } from "../coach";
import { rejectionLine, turnSystemPrompt, turnUserPrompt, wantsOf } from "../prompt";
import { companionSystemPrompt, companionUserPrompt } from "../prompt";
import { BASE_LANG_OPTIONS, DEFAULT_BASE_LANG } from "@/lib/i18n/base-lang";
import type { ObstacleChoice } from "../obstacles";

export type TurnContextInput = {
  scenario: Scenario;
  state: WorldState;
  character: SimCharacter;
  /** What is in the way this run, from `tuneScenario`. */
  obstacles: ObstacleChoice[];
  /** The run's seed, so the small talk rotates with it. */
  seed: number;
  /** The language the PLAYER reads. Resolved, never trusted raw. */
  baseLang: string;
};

export class TurnContext {
  readonly scenario: Scenario;
  readonly state: WorldState;
  readonly character: SimCharacter;
  readonly mission: MissionNode | null;
  readonly phase: ExchangePhase;

  /** The label the player reads subtitles in. Resolved against the list. */
  readonly understands: string;

  /**
   * Info keys this character holds, and the tokens a `tell` must carry.
   *
   * The ENGINE's half of what she knows — the model's half is prose in the
   * world brief. Kept apart on purpose: one is a sentence she may say, the
   * other is the string the reply is checked against before the errand settles.
   */
  readonly knownInfo: string[];
  readonly answerTokens: Record<string, string[]>;

  /** What is on her stall right now, counted. */
  readonly stock: string[];
  /** True when nothing she sells has any room in it. A counter, not a stall. */
  readonly fixedPrice: boolean;
  /** Bystanders standing in this exchange. Advanced band only. */
  readonly companions: SimCharacter[];
  /** What the engine said about her last act, if it overruled one. */
  readonly rejection: string | null;
  /** True when a price is on the table and the gate has already said yes. */
  readonly theyAgreed: boolean;
  /** What the learner is working towards, and one verified way to say it. */
  readonly goal: ReturnType<typeof goalFor>;

  private readonly obstacles: ObstacleChoice[];
  private readonly seed: number;
  /** The CODE, kept so `withState` can rebuild without re-resolving a label. */
  private readonly baseLang: string;

  constructor(input: TurnContextInput) {
    const { scenario, state, character, obstacles, seed } = input;
    this.scenario = scenario;
    this.state = state;
    this.character = character;
    this.obstacles = obstacles;
    this.seed = seed;
    this.baseLang = input.baseLang || DEFAULT_BASE_LANG;

    this.mission = missionFor(scenario, state, character.id);
    this.phase = phaseFromWorld(scenario, state, character.id);

    this.understands =
      BASE_LANG_OPTIONS.find((o) => o.code === (input.baseLang || DEFAULT_BASE_LANG))?.label ??
      "English";

    const infoSpecs = scenario.facts.filter(
      (f) => f.key.startsWith("info.") && character.knows.includes(f.key)
    );
    this.knownInfo = infoSpecs.map((f) => f.key.slice("info.".length));
    this.answerTokens = Object.fromEntries(
      infoSpecs
        .filter((f) => f.answerTokens?.length)
        .map((f) => [f.key.slice("info.".length), f.answerTokens!])
    );

    this.stock = character.knows
      .filter((k) => k.startsWith("stock."))
      .map((k) => {
        const item = k.split(".")[2];
        const good = goodById(item);
        const left = Number(state.facts[k] ?? 0);
        return `${good?.gloss ?? item} (${good?.native[scenario.language] ?? item}), sold by the ${good?.unit ?? "piece"} — ${left} left`;
      });

    this.fixedPrice = character.knows
      .filter((k) => k.startsWith("price."))
      .every((k) => state.facts[k] === state.facts[k.replace("price.", "floor.")]);

    this.companions = (this.mission?.companions ?? [])
      .map((id) => scenario.characters.find((c) => c.id === id))
      .filter((c): c is SimCharacter => !!c && !!c.bystander);

    const lastReject = [...state.log].reverse().find((e) => e.kind === "reject");
    this.rejection =
      lastReject && lastReject.characterId === character.id
        ? rejectionLine(lastReject.text ?? "", this.mission)
        : null;

    const theirs = activeMissions(scenario, state).filter((m) => m.characterId === character.id);
    this.theyAgreed =
      theirs.length > 0 &&
      this.mission?.template.kind === "buy" &&
      typeof state.facts[
        `rung.${this.mission.template.slot}.${this.mission.template.item}`
      ] === "number";

    this.goal = goalFor(scenario, state, this.mission, character.id);
  }

  /** The two messages the speaking call is made of. */
  speakMessages(said: string): { role: "system" | "user"; content: string }[] {
    const t = this.mission?.template;
    return [
      {
        role: "system",
        content: turnSystemPrompt(this.scenario, this.character, {
          stock: this.stock,
          fixedPrice: this.fixedPrice,
          obstacles: this.obstacles,
          understands: this.understands,
          wants: wantsOf(this.scenario, this.state, this.character.id, this.seed),
          alsoHere: this.companions.map((c) => `${c.name}, ${c.role}`),
          phase: { phase: this.phase, agreed: this.theyAgreed },
        }),
      },
      {
        role: "user",
        content: turnUserPrompt(this.scenario, this.state, this.character, said, {
          rejection: this.rejection,
          selling:
            t?.kind === "buy"
              ? {
                  item: goodById(t.item)?.gloss ?? t.item,
                  qty: t.qty,
                  unit: goodById(t.item)?.unit ?? "piece",
                }
              : undefined,
          theyAgreed: this.theyAgreed,
        }),
      },
    ];
  }

  /** The two messages a bystander's aside is made of. */
  asideMessages(who: SimCharacter, said: string): { role: "system" | "user"; content: string }[] {
    return [
      {
        role: "system",
        content: companionSystemPrompt(this.scenario, who, this.character, this.understands),
      },
      {
        role: "user",
        content: companionUserPrompt(this.state, who, this.character, said),
      },
    ];
  }

  /** The same context against a newer world. Cheap; it is all string joins. */
  withState(state: WorldState): TurnContext {
    return new TurnContext({
      scenario: this.scenario,
      state,
      character: this.character,
      obstacles: this.obstacles,
      seed: this.seed,
      baseLang: this.baseLang,
    });
  }
}
