import { EPSILON } from '../core/CharacterConstants'
import { LocomotionState } from '../core/CharacterState'
import type { CharacterState, IGroundState, LocomotionStateId } from '../core/CharacterState'
import type { IMovementIntent } from './MovementIntent'

/**
 * POUNCE Engine — LocomotionStateMachine
 *
 * The character's locomotion *identity*: which of a small set of gaits it is
 * currently in — Idle, Walk, Jog, Sprint, Airborne — and, on the frame the
 * situation changes, which gait it should switch to. It is a pure decision
 * layer. It reads the live `CharacterState`, the read-only `IMovementIntent`,
 * and the read-only `IGroundState`, and from those it *requests* a state change.
 * It never writes `position`, never touches `velocity`, never integrates. The
 * one and only thing it moves is the little cursor that says "we are jogging
 * now" — the `current`/`previous`/`timeInState` triple on `CharacterState`, plus
 * the `isSprinting` posture flag the downstream solvers key off.
 *
 * FLYWEIGHT STATES
 * The five states are *stateless singletons*. A state object holds no per-frame
 * or per-character data whatsoever — every character in the world shares the one
 * `JogState` instance the same way they share a texture. All mutable, per-
 * character data (how long we have been jogging, whether we are grounded) lives
 * on the `CharacterState` the machine points at, never on the state object. That
 * is what makes a crowd of a thousand pedestrians cost five state objects total
 * and zero per-transition allocation: a transition is a pointer swap plus three
 * field writes, not a `new`.
 *
 * Because the states are shared and stateless, their transition logic must be a
 * pure function of the arguments it is handed — it cannot stash a timer or a
 * hysteresis counter on `this`. So the transition table below keys purely off
 * intent and ground contact, which is also what keeps it trivially testable.
 *
 * TIER / MULTIPLIER REPORTING
 * The machine does not own the tuning numbers (those live in the resolved config
 * the solvers hold), so it cannot and does not resolve a gait into metres per
 * second. Instead each state advertises a symbolic `SpeedTier` and an advisory
 * `accelMultiplier`, and the machine surfaces the active state's pair through
 * `speedTier` / `accelMultiplier`. A consumer that *does* hold the config —
 * `AccelerationSolver` is the intended one — maps the tier onto a ceiling and
 * scales its approach rate by the multiplier. Keeping the mapping on the consumer
 * side is what lets this file stay ignorant of the numbers and depend on nothing
 * but state, intent and ground.
 *
 * ZERO ALLOCATION
 * `update()` constructs nothing. The state singletons are built once at module
 * load; a transition swaps a reference and writes four primitives. The transition
 * predicates are module-level pure functions over primitives.
 */

// ---------------------------------------------------------------------------
// Speed tiers
// ---------------------------------------------------------------------------

/**
 * The symbolic speed class a locomotion state implies. Deliberately *not* a
 * metres-per-second value: this machine holds no tuning, so it reports the tier
 * and lets a config-holding consumer resolve it. Declared as a frozen object for
 * the same reason `LocomotionState` is — `isolatedModules` forbids `const enum`,
 * and a plain `enum` would emit an unused runtime object.
 *
 * `Idle` implies a target speed of zero; `Airborne` implies "hold the momentum
 * you had, steer under air rules" rather than any ground ceiling.
 */
export const SpeedTier = Object.freeze({
  Idle: 'idle',
  Walk: 'walk',
  Jog: 'jog',
  Sprint: 'sprint',
  Airborne: 'airborne',
} as const)

export type SpeedTierId = (typeof SpeedTier)[keyof typeof SpeedTier]

// ---------------------------------------------------------------------------
// State contract
// ---------------------------------------------------------------------------

/**
 * One locomotion gait. Implementations are stateless flyweight singletons — see
 * the file header — so none of these methods may store anything on `this`.
 *
 * `onUpdate` is the transition oracle: given the frame delta, the desired input,
 * and the ground contact, it returns the state the character *should* be in, or
 * `null` to stay put. It must be a pure function of its arguments.
 *
 * `onEnter`/`onExit` are lifecycle hooks the machine fires around a transition.
 * They receive the live `CharacterState` so a state can set the posture flags it
 * implies (Sprint raises `isSprinting`; the others clear it) — posture *tracking*,
 * never movement. Richer future states (Landing, Sliding, Sitting) will use the
 * same hooks to arm and disarm their own effects.
 */
export interface IState {
  /** The `CharacterState.current` id this gait writes. */
  readonly id: LocomotionStateId
  /** The symbolic speed class this gait implies, for a config-holding consumer. */
  readonly speedTier: SpeedTierId
  /**
   * Advisory scalar on the base acceleration rate the consumer applies while in
   * this gait. `1` is the legacy-parity baseline; a walk eases in gently, a
   * sprint drives harder toward its ceiling. Airborne stays at `1` because the
   * air-control rate is already a separate, small config value.
   */
  readonly accelMultiplier: number

  /** Fired once as this gait becomes active, before the first `onUpdate`. */
  onEnter(state: CharacterState): void

  /**
   * Decide this frame's transition. Return the target state to switch to, or
   * `null` to remain. Pure: reads only its arguments, mutates nothing.
   */
  onUpdate(
    dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null

  /** Fired once as this gait stops being active, after its final `onUpdate`. */
  onExit(state: CharacterState): void
}

// ---------------------------------------------------------------------------
// Transition predicates (pure, allocation-free)
// ---------------------------------------------------------------------------

/**
 * Analog throttle at or below this fraction of full is a *walk*; above it is a
 * *jog*. Digital keyboard input saturates the throttle to exactly `1`, so a
 * keyboard always jogs — walking is reserved for analog sticks and AI drivers
 * that feed a partial magnitude. There is no dedicated "walk" button in the
 * intent record, so the throttle is the only signal available.
 */
const WALK_THROTTLE_CEILING = 0.5

/** True when there is any meaningful steering input this frame. */
function isMoving(intent: Readonly<IMovementIntent>): boolean {
  return intent.magnitude > EPSILON
}

/** True when the character is both asking to move and holding sprint. */
function isSprintRequested(intent: Readonly<IMovementIntent>): boolean {
  return intent.wantsToSprint && intent.magnitude > EPSILON
}

/**
 * Resolve which *grounded* gait a given input implies, ignoring the current
 * state. Shared by every grounded state's `onUpdate` and by `AirborneState` when
 * it touches back down, so "what do I land in?" and "what do I turn into?" can
 * never disagree.
 *
 * Precedence: no input → Idle; sprint held → Sprint; low throttle → Walk;
 * otherwise → Jog.
 */
function groundedGaitFor(intent: Readonly<IMovementIntent>): IState {
  if (!isMoving(intent)) return IdleState
  if (isSprintRequested(intent)) return SprintState
  return intent.magnitude <= WALK_THROTTLE_CEILING ? WalkState : JogState
}

// ---------------------------------------------------------------------------
// Flyweight state singletons
// ---------------------------------------------------------------------------

/**
 * Standing still. Leaves for a grounded gait the instant there is input, or for
 * `AirborneState` the instant the ground vanishes.
 */
class IdleStateImpl implements IState {
  readonly id = LocomotionState.Idle
  readonly speedTier = SpeedTier.Idle
  readonly accelMultiplier = 1

  onEnter(state: CharacterState): void {
    state.isSprinting = false
  }

  onUpdate(
    _dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null {
    if (!ground.isGrounded) return AirborneState
    const next = groundedGaitFor(intent)
    return next === this ? null : next
  }

  onExit(_state: CharacterState): void {}
}

/**
 * Strolling — the low, analog-throttle gait. Falls back to Idle when input
 * stops, up to Jog when the throttle opens past the walk ceiling, up to Sprint
 * when sprint is held, and to Airborne when the ground vanishes.
 */
class WalkStateImpl implements IState {
  readonly id = LocomotionState.Walk
  readonly speedTier = SpeedTier.Walk
  readonly accelMultiplier = 0.8

  onEnter(state: CharacterState): void {
    state.isSprinting = false
  }

  onUpdate(
    _dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null {
    if (!ground.isGrounded) return AirborneState
    const next = groundedGaitFor(intent)
    return next === this ? null : next
  }

  onExit(_state: CharacterState): void {}
}

/**
 * The default ground gait (legacy `WALK`, 6.4 m/s). Drops to Walk when the
 * throttle eases below the walk ceiling, to Idle when input stops, rises to
 * Sprint when sprint is held, and to Airborne on takeoff.
 */
class JogStateImpl implements IState {
  readonly id = LocomotionState.Jog
  readonly speedTier = SpeedTier.Jog
  readonly accelMultiplier = 1

  onEnter(state: CharacterState): void {
    state.isSprinting = false
  }

  onUpdate(
    _dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null {
    if (!ground.isGrounded) return AirborneState
    const next = groundedGaitFor(intent)
    return next === this ? null : next
  }

  onExit(_state: CharacterState): void {}
}

/**
 * Full-tilt run (legacy `SPRINT`, 12.5 m/s). Holds only while sprint is held and
 * there is input; the moment sprint is released it hands back to whichever gait
 * the remaining throttle implies (Walk or Jog), drops to Idle when input stops,
 * and to Airborne on takeoff. This is the one state that raises the `isSprinting`
 * posture flag the acceleration solver reads to pick the sprint ceiling.
 */
class SprintStateImpl implements IState {
  readonly id = LocomotionState.Sprint
  readonly speedTier = SpeedTier.Sprint
  readonly accelMultiplier = 1.25

  onEnter(state: CharacterState): void {
    state.isSprinting = true
  }

  onUpdate(
    _dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null {
    if (!ground.isGrounded) return AirborneState
    const next = groundedGaitFor(intent)
    return next === this ? null : next
  }

  onExit(state: CharacterState): void {
    // Clear the posture as we leave, so a stale `isSprinting` cannot outlive the
    // gait if the next state somehow forgot to reset it. Grounded gaits also
    // clear it in `onEnter`, which makes this belt-and-braces, not load-bearing.
    state.isSprinting = false
  }
}

/**
 * Off the ground — jumping, falling, or walked off a ledge. The machine parks
 * here for the whole airborne arc regardless of steering, and on the frame the
 * ground returns it resolves straight into the grounded gait the current input
 * implies (Idle / Walk / Jog / Sprint), so a character that lands still holding
 * sprint keeps sprinting without a one-frame detour through Idle.
 *
 * It leaves the `isSprinting` posture untouched on enter: horizontal air control
 * is governed by the air-acceleration rate, not the sprint ceiling, so flipping
 * the flag mid-jump would serve no one.
 */
class AirborneStateImpl implements IState {
  readonly id = LocomotionState.Airborne
  readonly speedTier = SpeedTier.Airborne
  readonly accelMultiplier = 1

  onEnter(_state: CharacterState): void {}

  onUpdate(
    _dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): IState | null {
    return ground.isGrounded ? groundedGaitFor(intent) : null
  }

  onExit(_state: CharacterState): void {}
}

/** The five shared, stateless gait singletons. Built once at module load. */
export const IdleState: IState = new IdleStateImpl()
export const WalkState: IState = new WalkStateImpl()
export const JogState: IState = new JogStateImpl()
export const SprintState: IState = new SprintStateImpl()
export const AirborneState: IState = new AirborneStateImpl()

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/**
 * Drives one character through the gait graph. Holds a pointer to the active
 * flyweight state and to the live `CharacterState` it annotates. Every frame it
 * ages the dwell timer, asks the active state for a transition, and — if one is
 * requested and actually differs — performs the pointer swap, firing the exit /
 * enter hooks and rewriting `current` / `previous` / `timeInState`.
 *
 * It requests; it never moves. Nothing here reads or writes `position` or
 * `velocity`.
 */
export class LocomotionStateMachine {
  /** The character record this machine annotates. Never reassigned. */
  private readonly state: CharacterState

  /** The active gait. Swapped on transition; never mutated in place. */
  private active: IState

  /**
   * @param state   The live character record to annotate. Its
   *                `current`/`previous`/`timeInState` become this machine's to
   *                own from here on.
   * @param initial The gait to start in. Defaults to Idle.
   */
  constructor(state: CharacterState, initial: IState = IdleState) {
    this.state = state
    this.active = initial

    // Seed the record so the very first read is coherent before any update.
    state.current = initial.id
    state.previous = initial.id
    state.timeInState = 0
    initial.onEnter(state)
  }

  /**
   * Advance the gait by one frame.
   *
   * Order is deliberate: age `timeInState` first so a state that stays put this
   * frame sees its dwell grow, then consult the active state. If it requests a
   * genuinely different gait, transition — which resets the dwell to zero, so the
   * incoming gait starts its clock fresh.
   *
   * Zero allocation.
   *
   * @param dt     Frame delta in seconds (clamped upstream to `MAX_DELTA_TIME`).
   * @param intent Read-only desired-input record for this frame.
   * @param ground Read-only ground-contact record for this frame.
   */
  update(
    dt: number,
    intent: Readonly<IMovementIntent>,
    ground: Readonly<IGroundState>,
  ): void {
    this.state.timeInState += dt

    const next = this.active.onUpdate(dt, intent, ground)
    if (next !== null && next !== this.active) {
      this.transitionTo(next)
    }
  }

  /**
   * Perform one gait swap: fire the outgoing `onExit`, repoint, record the edge
   * on the character (`previous` ← old, `current` ← new), zero the dwell, and
   * fire the incoming `onEnter`. Private because a transition is only ever valid
   * as the answer to an `onUpdate`; outside callers use `reset` or `forceState`.
   */
  private transitionTo(next: IState): void {
    const state = this.state
    const previous = this.active

    previous.onExit(state)
    this.active = next
    state.previous = previous.id
    state.current = next.id
    state.timeInState = 0
    next.onEnter(state)
  }

  /**
   * Force the machine into a specific gait, bypassing the transition table. For
   * events the graph cannot infer from intent and ground alone — a scripted jump
   * launch dropping the character into `AirborneState`, a cutscene parking it in
   * Idle. Fires the normal exit/enter hooks and records the edge. A force into
   * the state already active is a no-op, so it is safe to call unconditionally.
   */
  forceState(next: IState): void {
    if (next === this.active) return
    this.transitionTo(next)
  }

  /**
   * Snap back to a clean gait with no transition bookkeeping, mirroring
   * `CharacterState.reset`. Used by spawn / teleport, where there is no
   * meaningful "previous" gait to remember. Fires the incoming `onEnter` so the
   * target's posture (e.g. clearing `isSprinting`) is applied.
   */
  reset(initial: IState = IdleState): void {
    const state = this.state
    this.active = initial
    state.current = initial.id
    state.previous = initial.id
    state.timeInState = 0
    initial.onEnter(state)
  }

  /** The active gait singleton. */
  get current(): IState {
    return this.active
  }

  /** The symbolic speed tier the active gait implies. */
  get speedTier(): SpeedTierId {
    return this.active.speedTier
  }

  /** The advisory acceleration multiplier the active gait implies. */
  get accelMultiplier(): number {
    return this.active.accelMultiplier
  }
}
