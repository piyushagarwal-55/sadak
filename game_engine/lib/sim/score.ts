/**
 * WHAT THE RUN WAS WORTH.
 *
 * Pure arithmetic over `(scenario, state)`. No model is consulted, nothing is
 * stored, and the same run scored twice gives the same number — which is the
 * only way a score can be argued with, and a score nobody can argue with is a
 * score nobody believes.
 *
 * FOUR COMPONENTS, WEIGHTED, RENORMALISED
 *
 *   M  missions finished, by reward          50
 *   L  language actually produced            25
 *   S  stakes survived — money and the clock 15
 *   T  how well the haggling went            10
 *
 * Any component that does not apply to this run is dropped and the remaining
 * weights are renormalised, so a run with no purchase in it is not quietly
 * marked down for failing to haggle.
 *
 * THE GATES ARE MINIMUMS, NOT DEDUCTIONS
 *
 * Composed with `min()`. Additive penalties are how a score becomes unreadable
 * and how one sin gets charged three times: a silent run would lose points for
 * silence, then again for no assent, then again for no phrases, and arrive at a
 * number that means nothing. A ceiling says one thing clearly.
 *
 * AND THE HONEST ZERO
 *
 * If more than a third of turns could not be heard at all, there is no score.
 * The screen says we could not hear you. Telling a presenter who spoke Telugu
 * for three minutes that they scored 4 because the venue wifi ate their audio
 * is worse than telling them nothing.
 */

import type { Scenario, WorldState } from "./schema";
import { scoreAttempt } from "@/lib/game/speech-score";

export type ScoreBand =
  | "First words"
  | "Found your feet"
  | "Getting through"
  | "Held your own"
  | "Like a local";

export type RunScore = {
  /** 0–100, or null when we could not hear enough of the run to judge it. */
  total: number | null;
  band: ScoreBand | null;
  /** Why the total was capped, in plain words. Empty when nothing capped it. */
  cappedBy: string | null;
  parts: {
    missions: number;
    language: number;
    stakes: number;
    haggling: number | null;
  };
  counts: {
    turns: number;
    productiveTurns: number;
    assentTurns: number;
    unheardTurns: number;
    phrasesHit: number;
    phrasesOffered: number;
    rupeesSaved: number;
    missionsDone: number;
    missionsTotal: number;
    rejections: number;
  };
};

const BANDS: [number, ScoreBand][] = [
  [85, "Like a local"],
  [65, "Held your own"],
  [45, "Getting through"],
  [25, "Found your feet"],
  [0, "First words"],
];

export function bandFor(total: number): ScoreBand {
  return BANDS.find(([floor]) => total >= floor)![1];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function scoreRun(scenario: Scenario, state: WorldState): RunScore {
  const history = state.history ?? [];

  // Turns the player is answerable for. An engine failure and a microphone that
  // did not work are ours, not theirs.
  const productive = history.filter((t) => !t.nullTurn && t.sttOk);
  const unheard = history.filter((t) => !t.sttOk);
  /**
   * TURNS THAT ACTUALLY GOT THROUGH.
   *
   * This used to be "turns where the closest phrase was not null", which is
   * every turn that contained a character — `closestPhrase` returns a match at
   * any accuracy above nothing. So the debrief's "spoke Telugu in 6 of 6 turns"
   * was true of a run conducted entirely in English.
   *
   * It is now the per-turn score clearing the bar the turn scorer sets for
   * having said something a person understood. English, silence and a sentence
   * nobody could follow all fall below it by construction.
   */
  const UNDERSTOOD = 55;
  const scored = productive.filter((t) => typeof t.points === "number");
  const assentTurns = scored.length
    ? scored.filter((t) => (t.points ?? 0) >= UNDERSTOOD)
    : productive.filter((t) => t.assent);

  /* ---- M: the errands ---- */
  const rewardAll = scenario.missions.reduce((s, m) => s + m.reward, 0) || 1;
  const done = scenario.missions.filter((m) => state.missions[m.id] === "complete");
  const M = done.reduce((s, m) => s + m.reward, 0) / rewardAll;

  /* ---- L: the language ---- */
  // Only phrases belonging to missions the player could actually reach. A
  // phrase from a mission that stayed locked was never offerable, and charging
  // for it double-charges a failure already paid for in M.
  const reached = scenario.missions.filter((m) => state.missions[m.id] !== "locked");
  const offerable = new Set(reached.flatMap((m) => m.keyPhrases));
  const hits = new Set<string>();
  const partials = new Set<string>();

  for (const turn of productive) {
    for (const id of offerable) {
      if (hits.has(id)) continue;
      const phrase = scenario.phrases.find((p) => p.id === id);
      if (!phrase) continue;
      const { accuracy } = scoreAttempt(phrase.native, turn.said);
      // 0.72 is `speech-score`'s own green threshold, so the sim's meter and
      // the shipped lesson meter can never disagree about what "got it" means.
      if (accuracy >= 0.72) {
        hits.add(id);
        partials.delete(id);
      } else if (accuracy >= 0.55) {
        partials.add(id);
      }
    }
  }

  const assentRate = assentTurns.length / Math.max(1, productive.length);
  const coverage = offerable.size
    ? (hits.size + 0.5 * partials.size) / offerable.size
    : 0;

  /**
   * HOW WELL THEY SPOKE, AND THEN HOW LOCAL THEY SOUNDED.
   *
   * The first version was 60% assent and 40% phrase coverage, from the days
   * when saying one of the authored phrases was the only way to move the world
   * at all. Under free speech that weighting is a trap: a learner who held a
   * five-turn conversation in their own Telugu, finished the errand and never
   * once matched the bank scored 0.6 and was told they had used 0 of 5 phrases.
   *
   * So the mean turn score carries it, and coverage is the smaller, earned part
   * — sounding like the phrasebook is worth something, and it is not the point.
   * Runs recorded before the per-turn scorer existed fall back to the old
   * weighting rather than scoring zero.
   */
  const meanTurn = scored.length
    ? scored.reduce((sum, t) => sum + (t.points ?? 0), 0) / (100 * scored.length)
    : null;
  const L = clamp01(
    meanTurn === null ? 0.6 * assentRate + 0.4 * coverage : 0.75 * meanTurn + 0.25 * coverage
  );

  /* ---- S: the stakes ---- */
  const wallet = Number(state.facts.wallet ?? 0);
  const survivedClock = state.clock < scenario.stakes.deadlineMinutes;
  const notBroke = wallet >= 0;
  const noneFailed = !Object.values(state.missions).includes("failed");
  const S = clamp01((Number(survivedClock) + Number(notBroke) + Number(noneFailed)) / 3);

  /* ---- T: the haggling ---- */
  let saved = 0;
  const margins: number[] = [];
  for (const m of scenario.missions) {
    const t = m.template;
    if (t.kind !== "buy" || state.facts[`bought.${t.slot}.${t.item}`] !== true) continue;
    const opening = Number(state.facts[`price.${t.slot}.${t.item}`] ?? 0);
    const floor = Number(state.facts[`floor.${t.slot}.${t.item}`] ?? 0);
    const paid = Number(state.facts[`deal.${t.slot}.${t.item}.price`] ?? opening);
    saved += Math.max(0, (opening - paid) * t.qty);
    if (opening > floor) margins.push(clamp01((opening - paid) / (opening - floor)));
  }
  const T = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;

  /* ---- weigh and renormalise ---- */
  const weighted: [number, number][] = [
    [50, M],
    [25, L],
    [15, S],
  ];
  if (T !== null) weighted.push([10, T]);
  const weight = weighted.reduce((s, [w]) => s + w, 0);
  let total = Math.round((100 * weighted.reduce((s, [w, v]) => s + w * v, 0)) / weight);

  /* ---- the gates ---- */
  let cappedBy: string | null = null;
  const cap = (ceiling: number, why: string) => {
    if (total > ceiling) {
      total = ceiling;
      cappedBy = why;
    }
  };

  if (!productive.length && unheard.length === 0) cap(0, "You did not say anything.");
  if (assentRate < 0.15 && productive.length) {
    cap(25, `Almost nothing you said was in ${scenario.languageLabel}.`);
  }
  // NOT "you did not land any of the phrases".
  //
  // That cap was the phrase checklist's last stronghold and it outlived the
  // checklist by a week: a learner who spoke fluent, unauthored Telugu for five
  // turns and finished every errand was held to 40 because none of their
  // sentences was one somebody had written down. What deserves a ceiling is
  // speech that did not get through, which the turn score already measures.
  if (meanTurn !== null && scored.length >= 2 && meanTurn < 0.3) {
    cap(40, `Very little of what you said got through in ${scenario.languageLabel}.`);
  } else if (meanTurn === null && !hits.size) {
    cap(40, "You did not land any of the phrases this errand needed.");
  }

  const distinct = productive.filter((t) => t.distinctContent).length;
  if (productive.length >= 4 && distinct / productive.length < 0.25) {
    cap(35, "You repeated yourself rather than saying new things.");
  }

  // The honest zero. More than a third unheard and the run is not judgeable.
  const deaf = history.length >= 3 && unheard.length / history.length > 1 / 3;

  return {
    total: deaf ? null : total,
    band: deaf ? null : bandFor(total),
    cappedBy: deaf ? null : cappedBy,
    parts: { missions: M, language: L, stakes: S, haggling: T },
    counts: {
      turns: history.length,
      productiveTurns: productive.length,
      assentTurns: assentTurns.length,
      unheardTurns: unheard.length,
      phrasesHit: hits.size,
      phrasesOffered: offerable.size,
      rupeesSaved: saved,
      missionsDone: done.length,
      missionsTotal: scenario.missions.length,
      rejections: (state.log ?? []).filter((e) => e.kind === "reject").length,
    },
  };
}

/**
 * The two sentences at the top of the debrief.
 *
 * Templated, instant, and true — no model, so it cannot flatter and cannot be
 * wrong. A person repeats a sentence to a friend; nobody repeats a number.
 */
export function storyOf(scenario: Scenario, state: WorldState, score: RunScore): string {
  const bought: string[] = [];
  for (const m of scenario.missions) {
    const t = m.template;
    if (t.kind !== "buy" || state.facts[`bought.${t.slot}.${t.item}`] !== true) continue;
    const paid = state.facts[`deal.${t.slot}.${t.item}.price`];
    bought.push(`${t.item} for ₹${paid}`);
  }

  const first = bought.length
    ? `You got ${bought.join(" and ")}.`
    : "You came away with nothing this time.";

  const wallet = Number(state.facts.wallet ?? 0);
  const second = score.counts.rupeesSaved
    ? `You talked ₹${score.counts.rupeesSaved} off the asking price and walked out with ₹${wallet}.`
    : `You paid what was asked, and walked out with ₹${wallet}.`;

  return `${first} ${second}`;
}
