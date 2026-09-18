/**
 * THE SIMULATION CONTRACT
 *
 * A `Scenario` is the whole spec of one simulated situation: where it happens,
 * who is in it, what is true at the start, and what the player has to achieve.
 * Today one is hand-written (`scenarios/jaipur-date.ts`). Later the Scenario
 * Compiler generates the same shape from a sentence the player typed. Nothing
 * downstream of this file cares which produced it — that is the point of
 * writing the contract first.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 *
 *   The model controls behaviour. It never controls reality.
 *
 * A `Scenario` is immutable once compiled: it is the script's premise, not its
 * state. Everything that can change lives in `WorldState`, and the only way to
 * change it is a `Mutation` applied by the engine in `state.ts`. An NPC can say
 * anything it likes; it cannot make the mushroom pasta exist.
 *
 * `theme` is deliberately the same `Theme` the hand-authored districts use, so
 * `lib/game/city.ts:buildCity()` renders a generated scenario with no changes.
 */

import { V3_SPEAKERS, type LangCode } from "@/lib/sarvam";
import type { Theme } from "@/lib/game/districts";

export const SCENARIO_VERSION = 2 as const;

export type Difficulty = "beginner" | "intermediate" | "advanced";

/* ------------------------------------------------------------------ *
 * Language functions — what the player has actually produced
 * ------------------------------------------------------------------ */

/**
 * The speech acts a run can drill.
 *
 * Counting completed missions tells you how many errands someone ran. It does
 * not tell you whether they can do anything they could not do before, and a
 * learner who finishes five errands having only ever said "how much?" and
 * "make it less" has learnt two things and repeated them twenty times.
 *
 * So the action layer counts the FUNCTIONS the player produced, not the
 * missions they closed. Cold functions are what the next run's obstacles are
 * chosen to force (see `lib/sim/obstacles.ts`), and the count per function is
 * what fades the on-screen hints. This is spaced repetition at the level of
 * what you can do with the language rather than of vocabulary.
 */
export const LANGUAGE_FUNCTIONS = [
  "greet",
  "ask_price",
  "negotiate",
  "clarify",
  "refuse",
  "ask_location",
  "specify_quantity",
  "compare",
  "accept_substitute",
  "thank",
  /**
   * ANSWERING WHAT YOU WERE ASKED.
   *
   * The list above is a list of things you do to get an errand done, and for a
   * long time that was all a conversation was here. Then the shopkeeper started
   * asking questions back — "are you from another city, or are you local?" —
   * and the card underneath said "Auntie, I need some tomatoes, how much are
   * they?", because every move the coach was allowed to make was a move about
   * the shopping.
   *
   * The player had been asked something and the only thing the software could
   * think of was the errand. This is the function that lets a learner do the
   * most ordinary thing in any conversation: say something back about
   * themselves.
   */
  "answer",
] as const;

export type LanguageFunction = (typeof LANGUAGE_FUNCTIONS)[number];

/**
 * A phrase the player is expected to be able to produce, and the thing their
 * utterance is scored against by `scoreAttempt`.
 *
 * `klass` is why a reciter cannot win: firing the price question eleven times
 * assents to the price question forever and never to the close, because
 * `accept` only accepts assent from a `close`-class phrase.
 */
export type PhraseClass = "greet" | "ask" | "haggle" | "close" | "thank";

export type PhraseSpec = {
  id: string;
  /** In the target script. What `scoreAttempt` aligns the transcript against. */
  native: string;
  /** Roman transliteration, for the hint chip. */
  roman: string;
  /** English gloss. Rendered through `gloss()` into the player's base language. */
  gloss: string;
  klass: PhraseClass;
  drills: LanguageFunction;
};

/**
 * One line of speech, in three registers.
 *
 * A learner cannot answer a question they did not understand, so every line an
 * NPC says is carried in the target script (what is spoken and what the player
 * is learning to read), in Latin letters (so they can attempt it out loud
 * before they can read the script), and in English (which `gloss()` renders
 * into whatever language they said they understand).
 *
 * All three, always. Showing only the script is a comprehension test dressed up
 * as a conversation; showing only the translation teaches nothing.
 */
export type SpokenLine = {
  native: string;
  roman: string;
  /** English. Passed through `gloss()` for the player's base language. */
  en: string;
};

/* ------------------------------------------------------------------ *
 * Facts — the world's atoms
 * ------------------------------------------------------------------ */

/**
 * A dotted key naming one thing that can be true: `restaurant.mushroom_pasta`,
 * `date.mood`, `player.location`. Dotted rather than nested because every
 * consumer (prompt rendering, mutation diffing, the event log) wants a flat
 * addressable namespace, and because the extractor is far more accurate when
 * it picks from a flat enum of legal keys than when it has to navigate a tree.
 */
export type FactKey = string;

export type FactValue = string | number | boolean | null;

/**
 * Who is allowed to know a fact.
 *
 * This is the Context Engine's input, not a security boundary — it decides
 * which facts get rendered into which character's prompt. The waiter knows the
 * kitchen is out of mushrooms; the date does not, until the player tells her.
 * `"all"` means every character sees it; `"player"` means it is shown in the
 * HUD but never handed to an NPC.
 */
export type Visibility = "all" | "player" | string[];

export type FactSpec = {
  key: FactKey;
  /** Starting value. Copied into `WorldState.facts` when a session opens. */
  value: FactValue;
  /**
   * How this reads in a prompt, in plain language: "the kitchen has run out of
   * mushroom pasta". Rendering `restaurant.mushroom_pasta = false` at a model
   * and hoping it infers the meaning is how you get an NPC cheerfully serving
   * a dish that does not exist.
   */
  label: string;
  visibility: Visibility;
  /**
   * Whether the action extractor may change this mid-scenario. Locked facts are
   * scenario physics (the kitchen is out, full stop); unlocked ones are things
   * conversation legitimately moves (what was ordered, how the date feels).
   */
  mutable: boolean;
  /**
   * FOR `info.*` FACTS: THE ANSWER ITSELF.
   *
   * `label` says what the PLAYER will know — "you know where the bangle stall
   * is" — which is the right thing to render into a player-facing HUD and
   * exactly the wrong thing to hand a shopkeeper. Asked where the bangle stall
   * was, Lakshmi had been told only that the customer did not know yet, so she
   * invented: "Sarala is right next door", Sarala being the woman queueing
   * behind them. A character who is supposed to know something has to be told
   * what it is.
   *
   * `answer` is in the target script and goes into her prompt. `answerTokens`
   * are what her reply must actually contain for `tell` to land — the engine
   * refusing to believe the model's claim that information was conveyed.
   */
  answer?: string;
  answerTokens?: string[];
};

/* ------------------------------------------------------------------ *
 * Places and people
 * ------------------------------------------------------------------ */

/**
 * Somewhere the player can stand and be considered "at". Positions are offsets
 * from the chowk centre in world units — the same convention `Npc.pos` and
 * `StreetTask.pos` already use, so the existing engine places these unchanged.
 */
export type SimLocation = {
  id: string;
  name: string;
  pos: [number, number];
  /** Radius in world units within which the player counts as arrived. */
  radius: number;
  /** One line shown when the player first arrives. Player-facing, in English. */
  arrival?: string;
};

export type SimCharacter = {
  id: string;
  name: string;
  role: string;
  /** Bulbul v3 speaker id. Validated against `V3_SPEAKERS` at load. */
  speaker: string;
  colour: number;
  locationId: string;
  /** Who they are and how they talk. Goes in verbatim as the character brief. */
  persona: string;
  /**
   * Fact keys this character can see even when the fact is not `"all"`. The
   * waiter and the manager both hold `restaurant.*` — that shared sight is
   * exactly what makes two NPCs agree about the kitchen without either of them
   * being told what the other said.
   */
  knows: FactKey[];
  /** What they want out of the exchange. Shapes behaviour, not truth. */
  wants: string;
  /** What makes them hostile. Feeds the anger scale, as in the existing game. */
  provokes: string;
  /** The line they open on when the player walks up. */
  opening: SpokenLine;
  /**
   * SOMEBODY WHO IS JUST THERE.
   *
   * A bystander owns nothing, sells nothing and knows nothing: the woman ahead
   * of you in the queue, the son minding the next stall, the auto driver
   * waiting. They exist so that an exchange can have more than two people in
   * it, which is the single hardest thing about using a language in public and
   * the thing a two-party chat interface can never teach.
   *
   * The engine never applies a mutation proposed on a bystander's behalf. That
   * is not a rule the prompt asks for, it is the shape of the code: their line
   * is generated by a separate call whose return value is a string and nothing
   * else. So a bystander can hurry you, disagree with the price, ask you where
   * you are from or tell the seller she is overcharging — and not one rupee can
   * move because of it.
   */
  bystander?: boolean;
};

/* ------------------------------------------------------------------ *
 * Missions — a goal graph, not a checklist
 * ------------------------------------------------------------------ */

export type Condition =
  | { kind: "fact"; key: FactKey; equals: FactValue }
  | { kind: "fact"; key: FactKey; notEquals: FactValue }
  | { kind: "mission"; id: string; state: MissionState }
  | { kind: "clock"; afterMinutes: number };

export type Mutation =
  | { kind: "fact"; key: FactKey; value: FactValue }
  | { kind: "mission"; id: string; state: MissionState };

export type MissionState = "locked" | "active" | "complete" | "failed";

/**
 * One node of the goal graph. A mission unlocks when every precondition holds,
 * so ordering emerges from the world rather than from an array index: talk the
 * manager into a substitute before you ever speak to the waiter and the graph
 * accepts it, because what gates the next step is the fact, not the sequence.
 */
/**
 * What kind of errand this is.
 *
 * Two, deliberately. A family is only real if a closed action can prove it
 * happened, and that test leaves `buy` (proved by `accept`) and `ask` (proved
 * by `tell` or `point`). Variety does not come from more templates — it comes
 * from what stands between the player and the goal, which is `obstacles.ts`.
 */
export type MissionTemplate =
  | {
      kind: "buy";
      /** Logical stall id, bound to a built stall after the world is laid out. */
      slot: string;
      item: string;
      qty: number;
      /** When true, completion also requires closing below the opening price. */
      haggle: boolean;
    }
  | { kind: "ask"; infoKey: string };

/**
 * One node of the goal graph. A mission unlocks when every precondition holds,
 * so ordering emerges from the world rather than from an array index: talk the
 * manager into a substitute before you ever speak to the waiter and the graph
 * accepts it, because what gates the next step is the fact, not the sequence.
 *
 * Completion is an equality test on facts the action layer wrote while doing
 * arithmetic the model never saw. No grader runs in the live loop. That is the
 * whole of "the model never controls reality", stated as a type.
 */
export type MissionNode = {
  id: string;
  title: string;
  /** Player-facing, in English — this is HUD copy, not a prompt. */
  brief: string;
  template: MissionTemplate;
  preconditions: Condition[];
  /**
   * Fact equality only, and every one must hold. The action layer collapsed
   * each threshold into a boolean at the moment it did the arithmetic, so
   * nothing here has to compare numbers — which is as well, because
   * `conditionHolds` has no comparison operator and adding one is a trap
   * documented in the architecture note.
   */
  completeWhen: Condition[];
  /**
   * The deadline, and in practice nothing else. Patience running out writes
   * `away.<cast>` and starts a cooldown; it does not fail a mission, because
   * `MissionState` has no path back from `failed` and a stranded graph can
   * never satisfy `isComplete`.
   */
  failWhen: Condition[];
  /** The character this mission is scored against. */
  characterId: string;
  /** Applied on completion, alongside the reward that `settle()` pays. */
  effects: Mutation[];
  /** Applied on failure. */
  failEffects: Mutation[];
  /**
   * Paid into the wallet by `settle()`, never by an `effect`: `Mutation` sets an
   * absolute value, and the wallet at completion time is only knowable at
   * completion time.
   */
  reward: number;
  /** Phrase ids from `Scenario.phrases`. What assent is scored against. */
  keyPhrases: string[];
  /** The turn count a competent run takes. Scoring compares against it. */
  parTurns: number;
  /** Show a hint chip after this many turns at the character with no progress. */
  hintAfterTurns: number;
  /**
   * Other people standing in this exchange. Bystanders only.
   *
   * Present only on the advanced band — `tuneScenario` strips them below it,
   * because three voices is a genuinely different difficulty and not a
   * decoration. See `Band.group`.
   */
  companions?: string[];
  /**
   * DEBRIEF ONLY. Never read in the live loop.
   *
   * It was `criterion`, checked by a grader after every NPC turn. Renaming it
   * is what makes "missions complete from facts" structural rather than a
   * convention someone can quietly break.
   */
  debriefCriterion?: string;
};

/* ------------------------------------------------------------------ *
 * The scenario
 * ------------------------------------------------------------------ */

export type Scenario = {
  v: typeof SCENARIO_VERSION;
  id: string;
  title: string;
  /** The request this was compiled from. Kept for debugging and for evaluation. */
  sourceRequest?: string;
  language: LangCode;
  languageLabel: string;
  /** Named explicitly — models drift into romanised Latin without it. */
  script: string;
  difficulty: Difficulty;
  /**
   * WHERE this happens, as a built place.
   *
   * The scenario names it rather than the UI choosing it, because the whole
   * pitch is that a situation lands in a place shaped like that situation:
   * "Sunday market" is a bazaar, "buy a train ticket" is a platform. The
   * compiler picks one from a closed list; it never describes geometry.
   */
  archetype: "bazaar" | "station";
  city: string;
  /** Player-facing setup, in English. Shown before the world loads. */
  premise: string;
  theme: Theme;
  locations: SimLocation[];
  characters: SimCharacter[];
  facts: FactSpec[];
  missions: MissionNode[];
  /** Every phrase any mission scores assent against, by id. */
  phrases: PhraseSpec[];
  clock: {
    /** Where the in-world clock starts, minutes past midnight. */
    startMinutes: number;
    /** In-world minutes per real minute. Above 1 so waiting actually costs. */
    rate: number;
  };
  stakes: Stakes;
  /** What the end-of-run report judges, beyond mission completion. */
  evaluation: { objectives: string[] };
};

/**
 * The numbers that make a run cost something.
 *
 * All of them are engine-side. None is ever rendered to a model as a number:
 * patience reaches a vendor as a disposition clause, because telling a model
 * its patience counter reads 1 invites it to perform running out.
 */
export type Stakes = {
  /** In-world minutes past midnight at which unfinished missions fail. */
  deadlineMinutes: number;
  /** When the closing rush starts and the barks change. */
  lastCallMinutes: number;
  /**
   * Alignment score an utterance must reach against a key phrase before any
   * hard action may write to the world.
   *
   * 0.40 is `speech-score.ts`'s yellow band. It has never been measured against
   * real learner Telugu through Saaras and it gates every mission in the game,
   * so it lives here rather than as a constant: a false negative ("I said it
   * and nothing happened") is far more damaging than a false positive.
   */
  assentThreshold: number;
  /** Patience each vendor starts with. */
  patience: number;
  /** Turns of no progress tolerated before patience starts dropping. */
  patienceGraceTurns: number;
  /** In-world seconds a vendor stays away after patience hits zero. */
  cooldownSeconds: number;
};

/* ------------------------------------------------------------------ *
 * Live state
 * ------------------------------------------------------------------ */

/**
 * One player turn, as the scorer needs it.
 *
 * `sttOk` is not optional and not a nicety. `sarvamSTT` returns
 * `transcript ?? text ?? ""`, so a 200 with an empty transcript is
 * byte-identical to somebody saying nothing at all. On venue wifi, with a
 * presenter speaking Telugu into a browser mic, a run of empty transcripts is
 * the single most likely demo failure — and a scorer that cannot tell that from
 * silence shows the judges a zero and tells the presenter they never spoke.
 */
export type TurnRecord = {
  n: number;
  clock: number;
  characterId: string;
  input: "voice" | "text";
  /** The transcript exactly as received. Never cleaned up. */
  said: string;
  tokens: number;
  /** False means we could not hear them. Not the same as saying nothing. */
  sttOk: boolean;
  silent: boolean;
  /** The phrase their utterance aligned with, and how closely. */
  assent: { phraseId: string; accuracy: number } | null;
  /** Carries a content word no earlier turn had. Catches the reciter. */
  distinctContent: boolean;
  /** The act that actually landed, or null. */
  act: string | null;
  rejected: { act: string; reason: string } | null;
  /** The model failed. Excluded from every ratio — it is not a player behaviour. */
  nullTurn: boolean;
  /**
   * What this turn was worth, 0-100, from `lib/sim/turnscore.ts`.
   *
   * Optional because every run recorded before the per-turn scorer existed is
   * still a valid run, and a debrief that crashed on an old save would be a
   * worse bug than a missing number.
   */
  points?: number;
};

export type SimEvent = {
  at: number;
  /** In-world minutes when this happened. */
  clock: number;
  /**
   * `"action"` is a verb the engine accepted and ran; `"reject"` is one it
   * refused, with the reason. Rejections used to be returned by `ApplyResult`
   * and then dropped on the floor, so nothing downstream could see that the
   * model had tried to sell below the floor — which is exactly the moment the
   * debrief most wants to point at.
   */
  kind: "say" | "arrive" | "fact" | "mission" | "start" | "end" | "action" | "reject";
  characterId?: string;
  text?: string;
  mutation?: Mutation;
};

/**
 * Everything that can change. The authoritative copy lives in Postgres; this is
 * the shape both the browser and `agent.py` read and write through `/api/sim/*`.
 *
 * `version` is optimistic concurrency: the voice worker's async extractor and
 * the browser's own actions both write here, and a lost update is how the
 * kitchen quietly restocks itself mid-scene.
 */
export type WorldState = {
  sessionId: string;
  scenarioId: string;
  facts: Record<FactKey, FactValue>;
  missions: Record<string, MissionState>;
  clock: number;
  /** Where the player is, as a `SimLocation` id. */
  location: string;
  /** Append-only. The trajectory the final evaluation reads. */
  log: SimEvent[];
  /** Player turns taken, per character id. Feeds patience and the hint fade. */
  turns: Record<string, number>;
  /**
   * Every player turn, in order. What the debrief is computed from.
   *
   * The fact surface cannot hold this: `FactValue` is a scalar, `Condition` is
   * equality-only, and `log` is heterogeneous narrative meant to be read rather
   * than counted. Scoring needs a typed, homogeneous history, so it gets one.
   */
  history: TurnRecord[];
  /**
   * How many times the player has produced each language function, this run.
   *
   * Written by the action layer when an utterance assents to a phrase, keyed by
   * that phrase's `drills`. This is the number the debrief reports growth
   * against and the hint fade reads — not the mission count.
   */
  functions: Partial<Record<LanguageFunction, number>>;
  version: number;
};

/* ------------------------------------------------------------------ *
 * Validation
 *
 * The compiler is a language model writing JSON, so every scenario is treated
 * as untrusted until it passes this. Deliberately hand-rolled rather than Zod:
 * these checks are mostly referential (does this mission name a character that
 * exists?), which is where a generated scenario actually breaks, and which a
 * schema validator would wave through.
 * ------------------------------------------------------------------ */

export type ValidationIssue = { path: string; problem: string };

export function validateScenario(s: Scenario): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, problem: string) => issues.push({ path, problem });

  if (s.v !== SCENARIO_VERSION) add("v", `expected version ${SCENARIO_VERSION}, got ${s.v}`);
  if (!s.locations.length) add("locations", "a scenario needs at least one location");
  if (!s.characters.length) add("characters", "a scenario needs at least one character");
  if (!s.missions.length) add("missions", "a scenario needs at least one mission");

  const locationIds = new Set(s.locations.map((l) => l.id));
  const characterIds = new Set(s.characters.map((c) => c.id));
  const missionIds = new Set(s.missions.map((m) => m.id));
  const factKeys = new Set(s.facts.map((f) => f.key));
  const phraseIds = new Set((s.phrases ?? []).map((p) => p.id));

  for (const [ids, label] of [
    [s.locations.map((l) => l.id), "locations"],
    [s.characters.map((c) => c.id), "characters"],
    [s.missions.map((m) => m.id), "missions"],
    [s.facts.map((f) => f.key), "facts"],
    [(s.phrases ?? []).map((p) => p.id), "phrases"],
  ] as const) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) add(label, `duplicate id "${id}"`);
      seen.add(id);
    }
  }

  const speakers = new Set<string>();
  s.characters.forEach((c, i) => {
    if (!locationIds.has(c.locationId)) {
      add(`characters[${i}].locationId`, `no location "${c.locationId}"`);
    }
    c.knows.forEach((k) => {
      if (!factKeys.has(k)) add(`characters[${i}].knows`, `no fact "${k}"`);
    });
    // The field has always claimed to be "validated against V3_SPEAKERS at
    // load" and never was. An unknown id silently falls back to one voice, so
    // a whole cast can end up sounding like the same person.
    if (!(V3_SPEAKERS as readonly string[]).includes(c.speaker)) {
      add(`characters[${i}].speaker`, `"${c.speaker}" is not a Bulbul v3 speaker`);
    }
    if (speakers.has(c.speaker)) {
      add(`characters[${i}].speaker`, `speaker "${c.speaker}" is already used in this cast`);
    }
    speakers.add(c.speaker);
  });

  s.facts.forEach((f, i) => {
    if (Array.isArray(f.visibility)) {
      f.visibility.forEach((id) => {
        if (!characterIds.has(id)) add(`facts[${i}].visibility`, `no character "${id}"`);
      });
    }
  });

  const checkCondition = (c: Condition, path: string) => {
    if (c.kind === "fact" && !factKeys.has(c.key)) add(path, `no fact "${c.key}"`);
    if (c.kind === "mission" && !missionIds.has(c.id)) add(path, `no mission "${c.id}"`);
  };

  const checkEffects = (list: Mutation[], base: string) => {
    list.forEach((e, j) => {
      const path = `${base}[${j}]`;
      if (e.kind === "fact") {
        if (!factKeys.has(e.key)) add(path, `no fact "${e.key}"`);
        else if (!s.facts.find((f) => f.key === e.key)!.mutable) {
          add(path, `fact "${e.key}" is locked and cannot be an effect`);
        }
      }
      if (e.kind === "mission" && !missionIds.has(e.id)) add(path, `no mission "${e.id}"`);
    });
  };

  s.missions.forEach((m, i) => {
    if (!characterIds.has(m.characterId)) {
      add(`missions[${i}].characterId`, `no character "${m.characterId}"`);
    }
    // A companion who could sell you something would be a second vendor with no
    // ladder, no stock and no mission behind them — a hole straight through the
    // "the model never controls reality" line. Checked here so that a compiled
    // scenario cannot open one by accident.
    (m.companions ?? []).forEach((id, j) => {
      const who = s.characters.find((c) => c.id === id);
      if (!who) add(`missions[${i}].companions[${j}]`, `no character "${id}"`);
      else if (!who.bystander) {
        add(`missions[${i}].companions[${j}]`, `"${id}" is not a bystander and cannot stand in`);
      } else if (id === m.characterId) {
        add(`missions[${i}].companions[${j}]`, "a mission's own character cannot be their own companion");
      }
    });
    m.preconditions.forEach((c, j) => checkCondition(c, `missions[${i}].preconditions[${j}]`));
    m.completeWhen.forEach((c, j) => checkCondition(c, `missions[${i}].completeWhen[${j}]`));
    m.failWhen.forEach((c, j) => checkCondition(c, `missions[${i}].failWhen[${j}]`));
    checkEffects(m.effects, `missions[${i}].effects`);
    checkEffects(m.failEffects, `missions[${i}].failEffects`);

    // A mission with no completion clause can never be finished, and the
    // reachability check below will not catch it: that check proves the graph
    // is connected, not that any node is achievable by a player. This is the
    // exact shape the `gift` template died of.
    if (!m.completeWhen.length) {
      add(`missions[${i}].completeWhen`, "a mission with no completion condition can never be won");
    }
    // Assent is scored against these, so a mission without them is one the
    // player can complete without ever opening their mouth.
    if (!m.keyPhrases.length) {
      add(`missions[${i}].keyPhrases`, "a mission with no key phrases needs no speech to win");
    }
    m.keyPhrases.forEach((p) => {
      if (!phraseIds.has(p)) add(`missions[${i}].keyPhrases`, `no phrase "${p}"`);
    });
  });

  // A scenario nobody can start is the most common way a generated goal graph
  // fails, and it fails silently: the world loads, and nothing is ever playable.
  if (s.missions.length && !s.missions.some((m) => m.preconditions.length === 0)) {
    add("missions", "no mission is reachable at the start (every one has preconditions)");
  }

  return issues;
}

/** Initial `WorldState` for a scenario. The only place a session is born. */
export function openingState(scenario: Scenario, sessionId: string): WorldState {
  const facts: Record<FactKey, FactValue> = {};
  for (const f of scenario.facts) facts[f.key] = f.value;

  const missions: Record<string, MissionState> = {};
  for (const m of scenario.missions) {
    missions[m.id] = m.preconditions.length === 0 ? "active" : "locked";
  }

  return {
    sessionId,
    scenarioId: scenario.id,
    facts,
    missions,
    clock: scenario.clock.startMinutes,
    location: scenario.locations[0].id,
    log: [{ at: Date.now(), clock: scenario.clock.startMinutes, kind: "start" }],
    turns: {},
    history: [],
    functions: {},
    version: 0,
  };
}
