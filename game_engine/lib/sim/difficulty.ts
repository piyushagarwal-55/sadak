/**
 * WHAT "HARD" ACTUALLY MEANS.
 *
 * The landing page has asked players to pick Easy, Medium or Hard since before
 * any of this existed, and `Difficulty` has been in the schema the whole time
 * with nothing reading it. This file is what reads it.
 *
 * THE DIALS, AND WHY THESE ONES
 *
 * The tempting knob is vocabulary — harder words at higher tiers. It is the
 * wrong knob. A learner does not get better at a language by being handed rarer
 * nouns; they get better by having to DO more with the words they have, under
 * more pressure, with less help. So every dial below is about the task, not the
 * dictionary:
 *
 *   errands        how many things you have to get done
 *   obstacles      how often something goes wrong per errand
 *   walletMargin   how much slack the money gives you. At 1.05 you must haggle
 *                  well on every single purchase or you cannot finish.
 *   minutes        how long the market stays open
 *   assent         how close your Telugu has to be before the world moves
 *   hintAfter      how many productions before a phrase stops being offered
 *   group          whether two people are in the exchange at once
 *
 * `assent` is the one to be careful with. Raising it makes the game harder in
 * the least useful way — a learner who said the right thing and was ignored
 * learns nothing except that the software is broken. It moves by a tenth across
 * the whole ladder, and even that is a guess until it has been measured against
 * real learner speech through Saaras.
 */

import type { Difficulty } from "./schema";

export type Band = {
  /** How many errands a run contains. */
  errands: number;
  /** How many of them have something in the way. */
  obstacles: number;
  /**
   * Wallet as a multiple of the sum of floor prices.
   *
   * 1.60 — you can pay the asking price everywhere and still finish.
   * 1.22 — you must haggle somewhere, but one bad deal is survivable.
   * 1.05 — every purchase has to be argued down. Nothing is forgiven.
   */
  walletMargin: number;
  /** In-world minutes from the opening bell to the shutters. */
  minutes: number;
  /** Alignment an utterance must reach before a hard action may write. */
  assent: number;
  /** Productions of a function before its phrase chip stops being shown. */
  hintAfter: number;
  /** Whether a run contains an exchange with two people at once. */
  group: boolean;
  /** Patience each vendor starts with. */
  patience: number;
  /** Turns of no progress tolerated before patience starts dropping. */
  patienceGraceTurns: number;
  /** One line for the picker, in English. */
  blurb: string;
};

export const BANDS: Record<Difficulty, Band> = {
  beginner: {
    errands: 2,
    obstacles: 0,
    walletMargin: 1.6,
    minutes: 30,
    assent: 0.35,
    hintAfter: 8,
    group: false,
    patience: 5,
    patienceGraceTurns: 5,
    blurb: "Two errands, money to spare, and every phrase on screen when you need it.",
  },
  intermediate: {
    errands: 3,
    obstacles: 1,
    walletMargin: 1.22,
    minutes: 20,
    assent: 0.4,
    hintAfter: 4,
    group: false,
    patience: 3,
    patienceGraceTurns: 3,
    blurb: "Three errands and not quite enough money. Something will go wrong.",
  },
  advanced: {
    errands: 4,
    obstacles: 2,
    walletMargin: 1.05,
    minutes: 15,
    assent: 0.45,
    hintAfter: 2,
    group: true,
    patience: 2,
    patienceGraceTurns: 2,
    blurb: "Four errands, exact money, a closing market, and two people talking at once.",
  },
};

export function bandFor(difficulty: Difficulty): Band {
  return BANDS[difficulty] ?? BANDS.intermediate;
}

export const DIFFICULTY_STORAGE_KEY = "sadak.difficulty";

export function readStoredDifficulty(): Difficulty {
  if (typeof window === "undefined") return "intermediate";
  try {
    const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY);
    if (raw === "beginner" || raw === "intermediate" || raw === "advanced") return raw;
  } catch {
    /* private mode */
  }
  return "intermediate";
}

export function writeStoredDifficulty(d: Difficulty): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, d);
  } catch {
    /* ignore */
  }
}
