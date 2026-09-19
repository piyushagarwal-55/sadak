/**
 * THE SENTENCE THE LEARNER SAYS BACK. ITS OWN CALL, MADE AFTERWARDS.
 *
 * The bug that forced this, in the player's own words: she said "ਮੈਨੂੰ ਟਮਾਟਰ
 * ਚਾਹੀਦੇ ਸਨ ਪਰ ਅੱਜ ਸਾਰੇ ਖ਼ਤਮ ਹੋ ਗਏ ਹਨ" — the tomatoes are finished — and the card
 * underneath said "oh, that is very good news, I was going to buy tomatoes".
 * How can that be correct? It cannot, and the reason is structural rather than
 * a matter of prompting harder.
 *
 * The suggestion was a set of keys on the SAME generation that wrote her reply.
 * One call, one sampling pass, producing her sentence and the answer to it at
 * once. The answer could not respond to the line, because at the moment it was
 * written the line did not exist. Every "the card ignored what she said" report
 * on this branch traces back to that, and none of them were fixable by telling
 * the model to pay more attention.
 *
 * It also explains the other half of the same screenshot. A THIRD of her system
 * prompt — measured, 2364 characters of 7206 — was instructions about writing
 * the customer's sentence. She is a vegetable seller who was being handed the
 * customer's script, and she started speaking as them: "I needed tomatoes but
 * today they are all finished" is the buyer's line, out of the seller's mouth.
 *
 * SO IT IS A THIRD CALL, AFTER THE SECOND
 *
 * `read.ts` listens, the speaking call answers, and this writes the card once
 * her sentence exists and can be shown to it. It costs the only serial hop in
 * the turn — about 300ms on top of the ~900 the other two share — and it is
 * worth it, because the alternative is a card that is guessing.
 *
 * NEITHER CHARACTER
 *
 * The prompt here is deliberately not in anybody's voice. It is not the
 * shopkeeper and it is not the customer; it is the phrasebook on the table.
 * Nothing about a stall, a price ladder or a persona reaches it. That is what
 * stops the bleed going the other way.
 */

import { z } from "zod";
import { llmJson } from "../llm";
import { LANGUAGE_FUNCTIONS } from "../schema";
import type { Scenario } from "../schema";

export const suggestionSchema = z.object({
  native: z.string(),
  roman: z.string(),
  meaning: z.string(),
  move: z.string(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

const SUGGEST_SCHEMA = {
  type: "object",
  properties: {
    native: { type: "string" },
    roman: { type: "string" },
    meaning: { type: "string" },
    move: { type: "string", enum: [...LANGUAGE_FUNCTIONS] },
  },
  required: ["native", "roman", "meaning", "move"],
  additionalProperties: false,
} as const;

export type SuggestInput = {
  scenario: Scenario;
  /** What she actually just said, in her language and in the player's. */
  theySaid: { native: string; meaning: string };
  /** What the player said on the turn before, so the card does not repeat it. */
  youSaid: string;
  /** The move the errand needs, in plain English. */
  goal: string;
  /** One verified way to make that move, from the phrase bank. */
  example: { native: string; gloss: string } | null;
  /** The moves the engine will accept. `answer` is always among them. */
  moves: string[];
  /** The language the player reads. */
  understands: string;
};

function system(input: SuggestInput): string {
  const { scenario } = input;
  return `You write ONE sentence for somebody who is learning ${scenario.languageLabel} and is standing in a market in ${scenario.city}, talking to a shopkeeper.

You are not the shopkeeper and you are not the customer. You are the phrasebook open on the counter: your whole job is the next thing this learner could say out loud, and you never write anybody's side of the conversation but theirs.

WHAT IT MUST DO

Answer the line the shopkeeper just said. That comes first and it beats
everything else. If she asked them a question, answer it. If she told them she
has run out, do not congratulate her — ask where else, or when she will have it.
If she named a price, react to the price. A sentence that ignores what she just
said is wrong however good the ${scenario.languageLabel} is, and the learner can see it.

UNLESS HER LINE DOES NOT MAKE SENSE, AND THEN IGNORE IT

She is generated too, and sometimes she produces a sentence that means nothing —
a word that is not a word, a question with no sense in it, a phrase that came
out wrong. Do NOT take a broken line literally and do NOT try to answer it.
Write the errand's move instead, as if she had simply said something ordinary.

This is the failure worth guarding against hardest. She once produced a garbled
question that translated as "are you a new gardener" — and the card dutifully
answered "I am not a gardener, I am just a visitor". The learner was taught to
deny an identity nobody had given them, and the exchange never came back. A
learner in a real market does not answer the bit they could not follow. They
carry on with what they came for.

YOU KNOW NOTHING ABOUT THIS LEARNER

Not their name, their job, where they live, why they are in this city or who
they are cooking for. Never write a sentence that claims any of it. If she asks
something personal, either turn it gently back to the errand or write something
that would be true of anybody standing there — "I am just passing through", "I
have not been here before". Never a denial, never a biography.

When her line does not demand anything in particular, make the move the errand
needs: ${input.goal}
${
    input.example
      ? `A local making that move would say "${input.example.native}" — that is, "${input.example.gloss}". Say the same thing a different way: other words, a fuller sentence, or the way somebody would actually put it after what she just said.`
      : ""
  }

HOW IT MUST READ

- ${scenario.script} script. Never English words, not even one.
- A WHOLE sentence somebody would actually say — address her, give a reason, say
  what you want. Six words at least. Not a two-word phrasebook entry.
- ONE sentence. They have to say it in a single breath.
- Never repeat what she just said back at her, and never repeat what the learner
  already said.

AND REPORT THE MOVE IT MAKES
One of: ${input.moves.join(", ")}. Use "answer" whenever the sentence is
answering something she asked. If your sentence makes none of those moves,
write a different sentence.

OUTPUT
One JSON object, exactly these four keys:
{"native":"...","roman":"...","meaning":"...","move":"..."}
- native:  the sentence, in ${scenario.script}
- roman:   the same line in Latin letters, so they can read it aloud
- meaning: what it means, in ${input.understands}
- move:    one word from the list above`;
}

function user(input: SuggestInput): string {
  return `THE SHOPKEEPER JUST SAID
${input.theySaid.native}
(which means: ${input.theySaid.meaning || "—"})

THE LEARNER'S LAST LINE
${input.youSaid || "(they have not spoken yet)"}

Write their next sentence.`;
}

/**
 * One suggestion, or null.
 *
 * Null is a real answer: the caller falls back to the phrase bank, which is
 * hand-written and verified, so a failed call costs variety and never
 * correctness.
 */
export async function suggestReply(input: SuggestInput): Promise<Suggestion | null> {
  const raw = await llmJson<unknown>(
    [
      { role: "system", content: system(input) },
      { role: "user", content: user(input) },
    ],
    {
      maxTokens: 220,
      // Warmer than the reader — this one is supposed to vary between runs —
      // and much cooler than the shopkeeper, who is allowed to be a character.
      temperature: 0.7,
      schema: { name: "suggestion", schema: SUGGEST_SCHEMA },
    }
  );

  const parsed = suggestionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
