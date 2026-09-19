/**
 * WHAT ONE TURN WAS WORTH.
 *
 * The panel used to compute this in the browser, as `scoreAttempt(phrase, said)`
 * — the edit distance between what the player said and the one authored phrase
 * the card happened to be showing. That number was honest about exactly one
 * thing and wrong about everything else: a learner who said a perfectly good
 * sentence of their own got 18%, in red, and concluded they had failed. It is
 * the single most "hardcoded" thing left in the loop, and it has to go with the
 * checklist it belonged to.
 *
 * WHAT REPLACES IT
 *
 * The same four signals the world itself runs on, weighted:
 *
 *   UNDERSTOOD  55   the model's structured read of the utterance is a real
 *                    conversational move — a greeting, a question, a push back,
 *                    an agreement. Not "matched a string". This is most of the
 *                    mark because in a market it is most of the job.
 *   LANDED      15   the act the vendor took in response actually moved the
 *                    world. Speaking well AT somebody is not the same as
 *                    getting the thing you came for.
 *   FIT         20   how close it was to the way somebody local would put it,
 *                    measured against the phrase bank. Earned, never required:
 *                    an unauthored sentence still clears 70 without it.
 *   FRESH       10   a content word no earlier turn of this run contained. The
 *                    difference between a conversation and a learner firing the
 *                    same memorised sentence for the fifth time.
 *
 * THE CEILINGS ARE ABOUT THE LANGUAGE, NOT THE PERFORMANCE
 *
 * English scores zero however fluent it was, and silence scores zero however
 * long it lasted, because "you cannot get through this in English" is the
 * product's one promise and a score that rewarded English by 30% would be
 * quietly breaking it. A sentence in the language that nobody could follow is
 * not zero — it is 20, and the label says what went wrong, because a learner
 * who tried and was not understood has done something different from a learner
 * who said nothing.
 */

import type { Heard } from "./actions";

/** The moves that count as having said something to another person. */
const UNDERSTOOD: readonly Heard[] = ["greet", "ask", "haggle", "accept", "refuse"];

export type TurnScore = {
  /** 0–100. */
  points: number;
  /** One short line for the panel, in the player's own language. */
  label: string;
  /** The parts, so the debrief can say why and the tests can argue with it. */
  parts: { understood: number; landed: number; fit: number; fresh: number };
};

export function scoreTurn(input: {
  /** The model's read of what the player just did. Null when it did not say. */
  heard: Heard | null;
  /** Did the vendor's resulting act actually move the world? */
  landed: boolean;
  /** Closeness to the nearest phrase in the bank, 0–1. */
  accuracy: number;
  /** A content word no earlier turn had. */
  fresh: boolean;
  /** False when the transcript was not in the target script at all. */
  inLanguage: boolean;
  /** What the player is learning, for the label. */
  languageLabel: string;
}): TurnScore {
  const zero = { understood: 0, landed: 0, fit: 0, fresh: 0 };

  if (!input.inLanguage) {
    return { points: 0, label: `Say it in ${input.languageLabel}`, parts: zero };
  }
  if (!input.heard || input.heard === "silence") {
    return { points: 0, label: "Nothing came through", parts: zero };
  }
  if (input.heard === "english") {
    return { points: 0, label: `That was English — try it in ${input.languageLabel}`, parts: zero };
  }
  if (input.heard === "unclear") {
    return { points: 20, label: "She could not follow that", parts: { ...zero, understood: 20 } };
  }
  if (!UNDERSTOOD.includes(input.heard)) {
    return { points: 20, label: "She could not follow that", parts: { ...zero, understood: 20 } };
  }

  const parts = {
    understood: 55,
    landed: input.landed ? 15 : 0,
    fit: Math.round(20 * Math.max(0, Math.min(1, input.accuracy))),
    fresh: input.fresh ? 10 : 0,
  };
  const points = Math.min(100, parts.understood + parts.landed + parts.fit + parts.fresh);

  return { points, label: labelFor(points, input.heard, input.landed), parts };
}

function labelFor(points: number, heard: Heard, landed: boolean): string {
  if (points >= 90) return "Like a local";
  if (points >= 75) return landed ? "That worked" : "She understood you";
  if (heard === "greet") return "Understood — now tell her what you want";
  if (heard === "ask") return "She heard the question";
  if (heard === "haggle") return "She heard you push back";
  if (heard === "refuse") return "She heard you say no";
  return "She got the gist";
}

/* ------------------------------------------------------------------ *
 * One conversation
 * ------------------------------------------------------------------ */

export type ConversationScore = {
  /** Turns the player took with this person, silence and mis-hears included. */
  turns: number;
  /** Mean of the scored turns, 0-100. Zero when none were scored. */
  points: number;
  /** Their own best sentence, back on the screen. */
  best: { said: string; points: number } | null;
};

/**
 * WHAT THE PLAYER JUST DID, HERE, WITH THIS PERSON.
 *
 * The run scorer answers "how did the whole market go" and is the right thing
 * at the end of the run. It is the wrong thing at the end of a conversation:
 * the errand is finished, the player is standing at a stall wondering whether
 * that went well, and the only feedback on the screen was the number from their
 * last sentence — which might have been "thank you".
 *
 * Same arithmetic as the run scorer, narrowed to one counterpart. Mean rather
 * than total, because a long conversation is not a worse one.
 */
export function conversationScore(
  history: readonly {
    characterId: string;
    said: string;
    points?: number;
    nullTurn: boolean;
  }[],
  characterId: string
): ConversationScore {
  const mine = history.filter((t) => t.characterId === characterId && !t.nullTurn);
  const scored = mine.filter((t) => typeof t.points === "number");

  const best = scored
    .filter((t) => t.said.trim())
    .reduce<{ said: string; points: number } | null>(
      (top, t) =>
        !top || (t.points ?? 0) > top.points ? { said: t.said, points: t.points ?? 0 } : top,
      null
    );

  return {
    turns: mine.length,
    points: scored.length
      ? Math.round(scored.reduce((sum, t) => sum + (t.points ?? 0), 0) / scored.length)
      : 0,
    best,
  };
}
