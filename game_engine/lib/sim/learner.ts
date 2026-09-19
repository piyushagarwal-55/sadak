/**
 * WHAT THE PLAYER CAN DO, KEPT BETWEEN RUNS.
 *
 * SADAK has had an adaptive difficulty engine since the obstacle deck was
 * written. `chooseObstacles` takes a `history` argument and its docblock says
 * what it is for: "The chooser looks at what the learner has actually produced
 * — `WorldState.functions` — and picks obstacles that drill the COLDEST ones.
 * So the run adapts to what you cannot do yet, which is the difference between
 * practice and repetition."
 *
 * Here is every call site that existed before this file:
 *
 *     PlayWorld.tsx    tuneScenario(base, difficulty, {}, seed)
 *
 * An empty object. Every run anybody has ever played began from the assumption
 * that they had never spoken the language before. The ledger was filled in
 * faithfully for twenty minutes and thrown away at the debrief, so the hint
 * fade reset, the obstacles were chosen at random among the cold ones (all of
 * them were cold), and nothing could say what had changed. The machinery was
 * built and then starved.
 *
 * WHAT THIS IS
 *
 * One number per language function per language: how many times this person has
 * produced it, summed across every run. Plus what it costs nothing to keep —
 * how many runs, how many turns, and the best sentence they ever said.
 *
 * WHAT IT IS NOT
 *
 * Not spaced repetition, and not a curriculum that carries somebody from the
 * market to the chemist to the bus conductor. Both of those want this to exist
 * first, because both of them are this ledger read differently.
 *
 * WHY LOCAL STORAGE
 *
 * Because the alternative is an account, and the thing being measured is worth
 * measuring before anybody is asked to sign in for it. Every read is wrapped:
 * private windows, blocked storage and a corrupted blob all degrade to "this is
 * your first run", which is exactly what the product did before and therefore
 * cannot be a regression.
 */

import { LANGUAGE_FUNCTIONS, type LanguageFunction, type WorldState } from "./schema";

const STORAGE_KEY = "sadak.learner";
const VERSION = 1;

export type LanguageRecord = {
  /** Times each function has been produced, across every run in this language. */
  functions: Partial<Record<LanguageFunction, number>>;
  /** Runs finished. Not runs started — a debrief is what counts one. */
  runs: number;
  /** Turns spoken. The honest measure of time actually spent talking. */
  turns: number;
  /** Their best sentence, ever, in this language. */
  best: { said: string; points: number } | null;
};

export type LearnerProfile = {
  v: number;
  languages: Record<string, LanguageRecord>;
};

export const EMPTY_RECORD: LanguageRecord = { functions: {}, runs: 0, turns: 0, best: null };

function emptyProfile(): LearnerProfile {
  return { v: VERSION, languages: {} };
}

/**
 * Read it, or start again.
 *
 * A profile from a future version is discarded rather than migrated. There is
 * nothing in here worth a migration path yet, and a half-understood blob
 * driving somebody's difficulty is worse than a fresh start.
 */
export function loadProfile(): LearnerProfile {
  if (typeof window === "undefined") return emptyProfile();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile();
    const parsed = JSON.parse(raw) as LearnerProfile;
    if (parsed?.v !== VERSION || typeof parsed.languages !== "object") return emptyProfile();
    return parsed;
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile: LearnerProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* private mode, or the quota. Losing a profile is not worth a crash. */
  }
}

export function recordFor(profile: LearnerProfile, language: string): LanguageRecord {
  return profile.languages[language] ?? EMPTY_RECORD;
}

/**
 * What `tuneScenario` wants: how much of each function this person has done.
 *
 * The one line this whole file exists to make non-empty.
 */
export function historyFor(
  profile: LearnerProfile,
  language: string
): Partial<Record<LanguageFunction, number>> {
  return recordFor(profile, language).functions;
}

/**
 * Fold a finished run into the profile.
 *
 * Called once, from the debrief — the moment a run is actually over. Doing it
 * per turn would double-count a reload, and doing it on unmount would lose a
 * run somebody quit halfway, which is the correct thing to lose.
 */
export function recordRun(
  profile: LearnerProfile,
  language: string,
  state: WorldState
): LearnerProfile {
  const before = recordFor(profile, language);
  const functions = { ...before.functions };
  for (const [fn, n] of Object.entries(state.functions ?? {})) {
    if (!n) continue;
    functions[fn as LanguageFunction] = (functions[fn as LanguageFunction] ?? 0) + n;
  }

  const spoken = (state.history ?? []).filter((t) => !t.nullTurn && t.said.trim());
  const bestThisRun = spoken.reduce<{ said: string; points: number } | null>(
    (top, t) =>
      !top || (t.points ?? 0) > top.points ? { said: t.said, points: t.points ?? 0 } : top,
    null
  );

  return {
    v: VERSION,
    languages: {
      ...profile.languages,
      [language]: {
        functions,
        runs: before.runs + 1,
        turns: before.turns + spoken.length,
        best:
          bestThisRun && (!before.best || bestThisRun.points > before.best.points)
            ? bestThisRun
            : before.best,
      },
    },
  };
}

export type Progress = {
  /** Functions produced at least once, ever. */
  known: LanguageFunction[];
  /** Functions never produced. What the next run should be built to force. */
  cold: LanguageFunction[];
  /** Produced for the first time in the run just finished. */
  newThisRun: LanguageFunction[];
  runs: number;
  turns: number;
  best: { said: string; points: number } | null;
};

/**
 * What to tell somebody at the end of a run.
 *
 * Takes the profile as it was BEFORE this run was folded in, so "new this run"
 * means something. A score says how a run went; this says what changed, which
 * is the only question a person learning a language is actually asking.
 */
export function progressAfter(
  before: LearnerProfile,
  language: string,
  state: WorldState
): Progress {
  const prior = recordFor(before, language).functions;
  const after = recordRun(before, language, state);
  const now = recordFor(after, language);

  const known = LANGUAGE_FUNCTIONS.filter((fn) => (now.functions[fn] ?? 0) > 0);
  return {
    known,
    cold: LANGUAGE_FUNCTIONS.filter((fn) => !(now.functions[fn] ?? 0)),
    newThisRun: known.filter((fn) => !(prior[fn] ?? 0)),
    runs: now.runs,
    turns: now.turns,
    best: now.best,
  };
}
