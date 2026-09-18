import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import type { CharacterState } from '../core/CharacterState'
import type { IMovementIntent } from './MovementIntent'
import { EPSILON } from '../core/CharacterConstants'

/**
 * POUNCE Engine — RotationSolver
 *
 * Turns the character's facing toward where they want to travel. It is a pure
 * heading solver: it reads the desired world direction off the intent, closes
 * the angular gap by a framerate-independent fraction each frame, and writes the
 * result — and only the result — back to `state.heading` and
 * `state.angularVelocity`.
 *
 * It never touches position, velocity, ground, or timers, and it never calls a
 * controller. Where the character *goes* is somebody else's job; this file only
 * decides which way they *look* while going there.
 *
 * The heading convention matches the rest of the pipeline and the avatar rig in
 * `world/Avatar.js`: forward is `(sin h, 0, cos h)`, angle measured about world
 * Y, positive counter-clockwise.
 *
 * FRAMERATE INDEPENDENCE — why `pow(smoothing, dt)` is the only correct damping
 * -----------------------------------------------------------------------------
 * Exponential smoothing decays the remaining error `e` at a constant continuous
 * rate: `de/dt = -k·e`, whose exact solution over a step is
 *   `e(t + dt) = e(t) · exp(-k·dt)`.
 *
 * Write `smoothing = exp(-k)` — the fraction of the error that *survives* one
 * full second of decay — and the surviving fraction over an arbitrary step is
 *   `exp(-k·dt) = (exp(-k))^dt = pow(smoothing, dt)`.
 *
 * So the amount we *remove* this frame is `t = 1 - pow(smoothing, dt)`. Because
 * this comes straight from the closed-form solution, chaining two half-steps
 * lands exactly where one full step would:
 *   `pow(s, dt/2) · pow(s, dt/2) = pow(s, dt)`.
 * The heading a player sees is therefore identical at 30fps, 60fps or 144fps —
 * the same property the legacy `lerpAngle(h, target, 1 - pow(0.00002, dt))` in
 * `Player.js` relied on, reproduced here verbatim.
 *
 * The naive alternative, a fixed per-frame lerp `t = const`, does NOT have this
 * property: two 8ms steps of factor `t` leave `(1-t)²` of the error, one 16ms
 * step leaves `(1-t)`, and `(1-t)² ≠ (1-t)`. That controller literally turns
 * faster the higher your framerate, which is the bug this form exists to avoid.
 */
export class RotationSolver {
  /** Resolved tuning. Held by reference — it is frozen, so this is safe. */
  private readonly config: IResolvedCharacterConfig

  constructor(config: IResolvedCharacterConfig) {
    this.config = config
  }

  /**
   * Rotate `state.heading` one step toward the intent's travel direction.
   *
   * Writes `state.heading` and `state.angularVelocity`; reads nothing it does
   * not need and mutates nothing else. Zero allocation — there is no scratch to
   * pre-allocate because every intermediate here is a plain `number`.
   *
   * @param state  The live character record. `heading` and `angularVelocity`
   *               are the only fields written.
   * @param intent Read-only desired-direction buffer for this frame.
   * @param dt     Frame delta in seconds. Assumed already clamped to
   *               `MAX_DELTA_TIME` by the controller.
   */
  align(state: CharacterState, intent: Readonly<IMovementIntent>, dt: number): void {
    const rotation = this.config.rotation

    // --- No input: hold facing, bleed off spin ------------------------------
    // With no travel direction there is nothing to aim at, so the character
    // keeps looking wherever they last did. We still decay `angularVelocity`
    // toward zero so any consumer reading it (lean, animation, audio) sees the
    // turn wind down rather than snap to a stale value. `pow` gives the same
    // framerate-independent decay used for the heading itself.
    if (intent.magnitude <= EPSILON) {
      state.angularVelocity *= Math.pow(rotation.smoothing, dt)
      return
    }

    // --- Target heading from the desired world direction --------------------
    // Forward is (sin h, 0, cos h), so the heading that faces a direction
    // (x, 0, z) is atan2(x, z) — note the argument order is (x, z), NOT the
    // usual (y, x), precisely because of that sin/cos convention.
    const dir = intent.worldDirection
    const target = Math.atan2(dir.x, dir.z)

    // --- Framerate-independent damping fraction -----------------------------
    // See the class header for the derivation. `t` is the portion of the
    // remaining angular error we close this frame; in [0, 1] for smoothing in
    // [0, 1].
    const t = 1 - Math.pow(rotation.smoothing, dt)

    // --- Shortest signed angular delta, wrapped to [-PI, PI] ----------------
    // Turning the short way round a 359°→1° boundary means the raw difference
    // must be wrapped; otherwise the character spins almost all the way around
    // to cover two degrees.
    const delta = this.wrapAngle(target - state.heading)

    // --- The damped step, then hard-clamped to the turn-rate ceiling --------
    // `desiredStep` is what exponential smoothing alone would apply. The clamp
    // caps it at `maxTurnRate·dt` so a large error (e.g. a 180° flick) cannot
    // teleport the facing; it slews at a bounded rate instead. Clamping the
    // magnitude preserves the sign so we still turn the correct way.
    let step = delta * t
    const maxStep = rotation.maxTurnRate * dt
    if (step > maxStep) step = maxStep
    else if (step < -maxStep) step = -maxStep

    // --- Commit: angular velocity is the realized step over the step time ---
    // `angularVelocity` reports the actual applied rate, so it reflects the
    // clamp (a saturated turn reads exactly `±maxTurnRate`). Guard the divide
    // against a zero dt handed in by a paused frame.
    state.angularVelocity = dt > 0 ? step / dt : 0
    state.heading = this.wrapAngle(state.heading + step)
  }

  /**
   * Fold an angle into the canonical `[-PI, PI]` range.
   *
   * Used both to find the shortest turn direction and to keep `heading` from
   * drifting toward large magnitudes over a long session. The two-step form
   * `x - TAU · round(x / TAU)` is exact to one operation and, unlike a `while`
   * loop, costs the same whether the input is off by half a turn or a thousand.
   *
   * @param angle Any angle in radians.
   * @returns The equivalent angle in `[-PI, PI]`.
   */
  private wrapAngle(angle: number): number {
    const TAU = Math.PI * 2
    return angle - TAU * Math.round(angle / TAU)
  }
}
