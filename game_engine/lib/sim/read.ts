/**
 * READING THE TURN. A SEPARATE CALL FROM SPEAKING IT.
 *
 * This is the piece of `gideon-ai-voice` that had not been ported, and it is
 * the one that matters most.
 *
 * Gideon never asks the model that is talking to also report what happened.
 * `IntakeAgent` speaks; `CallOrchestrator.recordUserTurn` fires a SECOND call —
 * `OpenRouterService.extractIntakeFields`, temperature 0, a strict JSON schema
 * generated from Zod, a system prompt whose entire job is "report only what the
 * caller explicitly stated" — and the spoken reply never becomes the source of
 * truth for anything. Its own comment says so.
 *
 * SADAK had been going the other way for a week. Every time something needed
 * knowing, another key went on the end of the reply: `heard`, then `intent`,
 * then `coach_move`, then the three coach fields. Eleven keys, one call, one
 * 27B model asked to act, speak, translate, teach and self-report in a single
 * breath — and then act surprised when it chose `accept` and reported hearing a
 * greeting on the same turn. That contradiction is not a model being stupid. It
 * is one job too many.
 *
 * WHAT IS DIFFERENT HERE, AND WHY
 *
 * Gideon runs extraction DETACHED, after the reply, because the framework
 * blocks the spoken turn on its callbacks and a second round trip would be
 * heard as dead air. A SADAK turn is one HTTP request, so detaching buys
 * nothing — but the two calls do not depend on each other. The reader looks at
 * what the player said; the speaker writes what she says back. Neither needs
 * the other's output.
 *
 * So they run in PARALLEL. Same wall clock as the single call it replaces, two
 * prompts each doing one job, and the reader gets temperature 0 and a schema
 * the API itself enforces rather than a paragraph asking nicely.
 *
 * AND THEN THEY ARE RECONCILED
 *
 * Two calls can disagree — the reader hears a question, the speaker reaches for
 * `accept`. That is not a new problem, it is the same one, and `settleAct` in
 * `actions.ts` already exists to settle it. What changes is that the
 * disagreement is now between two independent readings rather than a single
 * call contradicting itself, which is a far better thing to arbitrate.
 */

import { z } from "zod";
import { llmJson } from "./llm";
import { HEARD } from "./actions";
import type { Heard } from "./actions";
import type { Scenario, SimCharacter, WorldState } from "./schema";
import type { ExchangePhase } from "./exchange";

/**
 * Everything the reader reports, and nothing else.
 *
 * Two fields. Both are readings of something that already happened, which is
 * the only kind of thing this call is allowed to produce — it names no prices,
 * chooses no acts and writes no sentences.
 */
export const turnReadSchema = z.object({
  heard: z.enum(HEARD),
  intent: z.enum(["open", "closing", "done"]),
});

export type TurnRead = z.infer<typeof turnReadSchema>;

/** The JSON schema the API enforces, so a malformed read is impossible. */
const READ_SCHEMA = {
  type: "object",
  properties: {
    heard: { type: "string", enum: [...HEARD] },
    intent: { type: "string", enum: ["open", "closing", "done"] },
  },
  required: ["heard", "intent"],
  additionalProperties: false,
} as const;

function readPrompt(scenario: Scenario, character: SimCharacter, phase: ExchangePhase): string {
  return `You are listening to one turn of a conversation at a market stall in ${scenario.city}, between ${character.name} (${character.role}) and a customer who is learning ${scenario.languageLabel}.

You are not taking part. You do not reply, you do not decide anything, and you never speak to either of them. You report what just happened, as json.

HEARD — what the CUSTOMER did on this turn. Exactly one:
  greet    said hello, or was being polite
  ask      asked something — a price, a place, a time
  haggle   pushed back on the price, or said it was too much
  accept   agreed to buy, or said how many they want
  refuse   turned it down, or is leaving
  english  spoke English rather than ${scenario.languageLabel}
  silence  said nothing you could make out
  unclear  said something in ${scenario.languageLabel} you could not follow

Be exact about this. It is a record, not a judgement, and the customer is a
learner: fumbling the language is ordinary. "english" means English words.
"unclear" means ${scenario.languageLabel} you could not follow. Half a sentence that
plainly means "how much" is an ask, not unclear.

INTENT — where the CONVERSATION itself stands after this turn:
  open     there is more to say. Almost always.
  closing  it is winding up. Goodbyes are being said.
  done     it is finished. Nothing left between them.

"done" is about the exchange being complete, not about anybody being in a
hurry. A shopkeeper wanting to get home is still "open".

This exchange is currently at: ${phase}.`;
}

function readInput(state: WorldState, character: SimCharacter, said: string): string {
  const tail = state.log
    .filter((e) => e.kind === "say" && (e.characterId === character.id || e.characterId === "player"))
    .slice(-6)
    .map((e) => `${e.characterId === "player" ? "CUSTOMER" : character.name.toUpperCase()}: ${e.text}`);

  return `THE CONVERSATION SO FAR
${tail.length ? tail.join("\n") : "(nothing yet)"}

THE CUSTOMER JUST SAID
${said || "(nothing — they went quiet)"}`;
}

/**
 * One read of one turn.
 *
 * Returns null rather than throwing, like everything else that consults a
 * model here: the caller treats a missing read as "no extraction", which the
 * gate already handles by refusing anything material. A turn nobody could read
 * moves nothing, which is the correct failure.
 */
export async function readTurn(
  scenario: Scenario,
  state: WorldState,
  character: SimCharacter,
  said: string,
  phase: ExchangePhase,
  signal?: AbortSignal
): Promise<TurnRead | null> {
  const raw = await llmJson<unknown>(
    [
      { role: "system", content: readPrompt(scenario, character, phase) },
      { role: "user", content: readInput(state, character, said) },
    ],
    {
      // Temperature 0 because this is a measurement. The speaker's call is the
      // one that gets to be interesting.
      maxTokens: 60,
      temperature: 0,
      schema: { name: "turn_read", schema: READ_SCHEMA },
      signal,
    }
  );

  const parsed = turnReadSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Convenience for the engine, which thinks in `Heard | null`. */
export function heardOf(read: TurnRead | null): Heard | null {
  return read?.heard ?? null;
}
