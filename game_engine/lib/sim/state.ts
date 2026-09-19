/**
 * THE WORLD STATE ENGINE
 *
 * The one place reality is allowed to change. A model can propose a mutation;
 * only this file decides whether it happens. Everything here is pure — state in,
 * state out — so it is trivially testable and so the same logic runs whether the
 * caller is a route handler, the voice worker's extractor, or a test.
 *
 * Three jobs:
 *
 *   1. Apply mutations, rejecting anything the scenario did not sanction.
 *   2. Re-evaluate the goal graph after every change, so missions unlock the
 *      moment the world makes them reachable rather than when a script says so.
 *   3. Keep the log, which is the trajectory the final evaluation reads.
 *
 * Why the rejection path is loud rather than silent: an extractor that invents
 * `restaurant.pasta_availability` when the scenario defines
 * `restaurant.mushroom_pasta` is a prompt bug, and a silently dropped mutation
 * looks exactly like an NPC that ignored the player. Rejections are returned to
 * the caller so they surface in logs instead of becoming a debugging afternoon.
 */

import type {
  Condition,
  FactValue,
  LanguageFunction,
  MissionNode,
  MissionState,
  Mutation,
  Scenario,
  SimEvent,
  WorldState,
} from "./schema";

export type Rejection = { mutation: Mutation; reason: string };

export type ApplyResult = {
  state: WorldState;
  /** Mutations that actually landed, in order. */
  applied: Mutation[];
  rejected: Rejection[];
  /** Missions that changed state as a result, for the HUD to announce. */
  transitions: { id: string; from: MissionState; to: MissionState }[];
};

/* ------------------------------------------------------------------ *
 * Conditions
 * ------------------------------------------------------------------ */

export function conditionHolds(c: Condition, state: WorldState): boolean {
  switch (c.kind) {
    case "fact":
      return "equals" in c ? state.facts[c.key] === c.equals : state.facts[c.key] !== c.notEquals;
    case "mission":
      return state.missions[c.id] === c.state;
    case "clock":
      return state.clock >= c.afterMinutes;
  }
}

function unlocked(mission: MissionNode, state: WorldState): boolean {
  return mission.preconditions.every((c) => conditionHolds(c, state));
}

/* ------------------------------------------------------------------ *
 * Mutations
 * ------------------------------------------------------------------ */

/**
 * Whether the scenario permits this mutation at all. This is the enforcement
 * point for "the model never controls reality": a fact the scenario marked
 * immutable is physics, and no amount of confident dialogue moves it.
 */
function vet(mutation: Mutation, scenario: Scenario, state: WorldState): string | null {
  if (mutation.kind === "fact") {
    const spec = scenario.facts.find((f) => f.key === mutation.key);
    if (!spec) return `unknown fact "${mutation.key}"`;
    if (!spec.mutable) return `fact "${mutation.key}" is locked by the scenario`;
    if (state.facts[mutation.key] === mutation.value) return "no change";
    return null;
  }

  if (!scenario.missions.some((m) => m.id === mutation.id)) {
    return `unknown mission "${mutation.id}"`;
  }
  if (state.missions[mutation.id] === mutation.state) return "no change";
  // Completing a mission whose preconditions were never met means the graph was
  // bypassed — usually a grader passing a step the player never reached.
  const mission = scenario.missions.find((m) => m.id === mutation.id)!;
  if (mutation.state === "complete" && !unlocked(mission, state)) {
    return `mission "${mutation.id}" is not reachable yet`;
  }
  return null;
}

/**
 * Applies mutations and settles the goal graph.
 *
 * Settling runs to a fixed point rather than once: completing a mission can
 * unlock another whose effects unlock a third, and a single pass would leave
 * the world one step behind the player. Bounded, because a scenario whose
 * effects feed each other in a cycle should not hang a request.
 */
export function applyMutations(
  scenario: Scenario,
  state: WorldState,
  mutations: Mutation[],
  meta: { characterId?: string } = {}
): ApplyResult {
  const next: WorldState = {
    ...state,
    facts: { ...state.facts },
    missions: { ...state.missions },
    log: [...state.log],
  };

  const applied: Mutation[] = [];
  const rejected: Rejection[] = [];
  const before = { ...state.missions };

  const commit = (m: Mutation) => {
    if (m.kind === "fact") next.facts[m.key] = m.value;
    else next.missions[m.id] = m.state;
    applied.push(m);
    next.log.push({
      at: Date.now(),
      clock: next.clock,
      kind: m.kind,
      characterId: meta.characterId,
      mutation: m,
    });
  };

  for (const m of mutations) {
    const problem = vet(m, scenario, next);
    if (problem) {
      // "no change" is not worth reporting: an extractor restating the world it
      // was just shown is normal, not a bug.
      if (problem !== "no change") {
        rejected.push({ mutation: m, reason: problem });
        // Logged as well as returned. A rejection is the engine overruling the
        // model, which is the single most interesting thing that can happen in
        // a run and exactly what the debrief wants to point at — and until now
        // it was handed to the caller and then dropped on the floor.
        next.log.push({
          at: Date.now(),
          clock: next.clock,
          kind: "reject",
          characterId: meta.characterId,
          text: problem,
          mutation: m,
        });
      }
      continue;
    }
    commit(m);

    // A completed mission fires its effects immediately, in the same pass, so a
    // reward or a fact it sets is visible to the missions settled below it.
    if (m.kind === "mission" && m.state === "complete") {
      const mission = scenario.missions.find((x) => x.id === m.id)!;
      for (const effect of mission.effects) {
        if (!vet(effect, scenario, next)) commit(effect);
      }
    }
  }

  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const mission of scenario.missions) {
      if (next.missions[mission.id] === "locked" && unlocked(mission, next)) {
        next.missions[mission.id] = "active";
        next.log.push({
          at: Date.now(),
          clock: next.clock,
          kind: "mission",
          mutation: { kind: "mission", id: mission.id, state: "active" },
        });
        changed = true;
      }
    }
    if (!changed) break;
  }

  const transitions = Object.keys(next.missions)
    .filter((id) => before[id] !== next.missions[id])
    .map((id) => ({ id, from: before[id], to: next.missions[id] }));

  next.version = state.version + 1;
  return { state: next, applied, rejected, transitions };
}

/* ------------------------------------------------------------------ *
 * Settling — where a mission is actually won or lost
 * ------------------------------------------------------------------ */

/**
 * Decides, from facts alone, which active missions just finished.
 *
 * Runs after every `applyMutations` batch and after every clock advance. No
 * model is consulted, and that is the entire point: a mission turns green
 * because `bought.R1.bangles` is `true`, written by the action layer while it
 * was debiting the wallet.
 *
 * TWO THINGS HERE ARE LOAD-BEARING.
 *
 * It sweeps ACTIVE missions only. `{kind: "clock", afterMinutes}` is absolute
 * and identical across missions, so an unscoped sweep fails every unfinished
 * mission the moment the deadline passes — including ones still locked behind a
 * purchase the player was never allowed to make. `vet()` guards `complete`
 * against an unreachable mission but does not guard `failed` at all; scoping to
 * active is what supplies that guard.
 *
 * And it does the reward ARITHMETIC itself rather than leaving it to an effect.
 * `Mutation` sets an absolute value, the wallet at completion time is only
 * knowable at completion time, and a pre-computed value that happens to match
 * the current one is rejected as "no change" — which is deliberately filtered
 * out of `rejected`. So a reward expressed as an effect evaporates with no
 * error, no log line and no rejection. No `effects` array can ever express one.
 */
export function settle(scenario: Scenario, state: WorldState): ApplyResult {
  const proposals: Mutation[] = [];

  for (const mission of scenario.missions) {
    if (state.missions[mission.id] !== "active") continue;

    if (mission.failWhen.length && mission.failWhen.every((c) => conditionHolds(c, state))) {
      proposals.push({ kind: "mission", id: mission.id, state: "failed" });
      proposals.push(...mission.failEffects);
      continue;
    }

    if (mission.completeWhen.length && mission.completeWhen.every((c) => conditionHolds(c, state))) {
      proposals.push({ kind: "mission", id: mission.id, state: "complete" });
      if (mission.reward) {
        const wallet = Number(state.facts.wallet ?? 0);
        proposals.push({ kind: "fact", key: "wallet", value: wallet + mission.reward });
      }
    }
  }

  // Back through `applyMutations`, so `vet()` still has the last word and the
  // graph re-settles: a completed mission can unlock the next one in the same
  // pass. `effects` fire there too, as they do for any completion.
  return applyMutations(scenario, state, proposals);
}

/* ------------------------------------------------------------------ *
 * Time and movement
 * ------------------------------------------------------------------ */

/**
 * Advances the in-world clock. Consequence lives here: the negotiation that
 * drags on is the same negotiation that leaves you at a shuttered stall, and
 * the only thing connecting those two facts is that talking costs minutes.
 *
 * It bumps `version` and settles, neither of which it used to do. Without the
 * settle, `{kind: "clock", afterMinutes}` only ever fired by luck — when some
 * unrelated mutation happened to run after the deadline had passed — so the
 * deadline was not merely unimplemented, it was inert.
 */
export function advanceClock(
  scenario: Scenario,
  state: WorldState,
  realSeconds: number
): ApplyResult {
  const moved: WorldState = {
    ...state,
    clock: state.clock + (realSeconds / 60) * scenario.clock.rate,
    version: state.version + 1,
  };
  return settle(scenario, moved);
}

export function moveTo(scenario: Scenario, state: WorldState, locationId: string): WorldState {
  if (!scenario.locations.some((l) => l.id === locationId)) return state;
  if (state.location === locationId) return state;
  return {
    ...state,
    location: locationId,
    version: state.version + 1,
    log: [...state.log, { at: Date.now(), clock: state.clock, kind: "arrive", text: locationId }],
  };
}

/**
 * Records a spoken line. The transcript half of the trajectory.
 *
 * Bumps `version` like every other writer. It was the one that did not, and
 * under the optimistic-concurrency design this state is stored with, that meant
 * a transcript append could be silently lost to a concurrent write.
 */
export function recordSay(
  state: WorldState,
  characterId: string,
  role: "player" | "npc",
  text: string
): WorldState {
  const event: SimEvent = {
    at: Date.now(),
    clock: state.clock,
    kind: "say",
    characterId: role === "player" ? "player" : characterId,
    text,
  };
  return { ...state, log: [...state.log, event], version: state.version + 1 };
}

/** One more player turn at this character. Feeds patience and the hint fade. */
export function countTurn(state: WorldState, characterId: string): WorldState {
  return {
    ...state,
    turns: { ...state.turns, [characterId]: (state.turns[characterId] ?? 0) + 1 },
  };
}

/**
 * Records that the player produced a language function.
 *
 * Called by the action layer when an utterance assents to a phrase, keyed by
 * that phrase's `drills`. This — not the mission count — is what the debrief
 * reports growth against and what fades the hints, because five errands closed
 * with the same two sentences is five repetitions, not five things learnt.
 */
export function countFunction(state: WorldState, fn: LanguageFunction): WorldState {
  return {
    ...state,
    functions: { ...state.functions, [fn]: (state.functions[fn] ?? 0) + 1 },
  };
}

/* ------------------------------------------------------------------ *
 * Queries
 * ------------------------------------------------------------------ */

export function activeMissions(scenario: Scenario, state: WorldState): MissionNode[] {
  return scenario.missions.filter((m) => state.missions[m.id] === "active");
}

/** The mission a given character is currently on the hook for, if any. */
export function missionFor(
  scenario: Scenario,
  state: WorldState,
  characterId: string
): MissionNode | null {
  return activeMissions(scenario, state).find((m) => m.characterId === characterId) ?? null;
}

export function isComplete(scenario: Scenario, state: WorldState): boolean {
  return scenario.missions.every(
    (m) => state.missions[m.id] === "complete" || state.missions[m.id] === "failed"
  );
}

/** Minutes past midnight rendered as the wall clock an NPC would refer to. */
export function clockLabel(minutes: number): string {
  const total = Math.floor(minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

export function factValue(state: WorldState, key: string): FactValue | undefined {
  return state.facts[key];
}
