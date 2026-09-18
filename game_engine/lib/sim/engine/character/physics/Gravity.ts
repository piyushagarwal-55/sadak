import type { CharacterState } from '../core/CharacterState'
import type { IResolvedCharacterConfig } from '../core/CharacterConfig'

/**
 * POUNCE Engine — Gravity
 *
 * The single owner of `velocity.y`. This is the *only* file in the pipeline
 * permitted to integrate vertical velocity under gravity; every other solver
 * that has an opinion about the Y axis (jump impulse, ground snap, slope slide)
 * expresses it by handing a value to the controller, never by touching gravity
 * itself. Keeping the integration in one place is what lets the fall arc stay
 * predictable frame to frame.
 *
 * It solves and mutates one scalar. It does not move the character (position is
 * the controller's job), does not read input beyond the single `jumpHeld`
 * boolean the controller forwards, and never calls a controller.
 *
 * ZERO allocation: the whole method is scalar arithmetic on `state.velocity.y`.
 * There is nothing to pre-allocate — no scratch vector is ever needed.
 *
 * WHY ASYMMETRIC RISE/FALL MULTIPLIERS
 * A jump integrated under a single, symmetric gravity produces a parabola whose
 * ascent and descent take exactly as long as each other. Physically correct,
 * but it *reads* as floaty: the character hangs at the apex and drifts back down
 * like it is underwater, because real-world gravity (-9.81) is far gentler than
 * the eye expects at game scale and camera distance.
 *
 * The fix, popularised by 2D platformers and equally valid here, is to bend the
 * arc by scaling gravity differently in three regimes:
 *
 *   - Rising with jump held      -> base gravity. A committed jump reaches full
 *                                   `jump.height`, exactly as the derived
 *                                   `jumpVelocity` was solved to guarantee.
 *   - Rising with jump released   -> `lowJumpMultiplier` (> 1). Cutting the key
 *                                   short yanks the character back down early,
 *                                   giving a continuous range of jump heights
 *                                   from one impulse — the "variable jump".
 *   - Falling                     -> `fallMultiplier` (> 1). The descent is
 *                                   heavier than the ascent, so the character
 *                                   snaps down to the ground instead of
 *                                   wafting. This is the single biggest lever
 *                                   on making a jump feel *weighted* and
 *                                   responsive rather than moon-like.
 *
 * The result is a jump that leaps up crisply and drops back with authority,
 * while still respecting terminal velocity so a long fall never accelerates
 * without bound.
 */
export class Gravity {
  private readonly config: IResolvedCharacterConfig

  constructor(config: IResolvedCharacterConfig) {
    this.config = config
  }

  /**
   * Integrate one frame of vertical velocity.
   *
   * PIPELINE
   *  1. Grounded stick. While resting on a walkable slope with non-positive
   *     vertical velocity, we do not integrate gravity at all — we pin
   *     `velocity.y` to a tiny negative bias (`-1 m/s`). That small downward
   *     bleed keeps the capsule pressed into the floor so the ground sweep
   *     reliably re-detects contact next frame, instead of the character
   *     micro-hopping as gravity and snap fight over the last millimetre. We
   *     return immediately: a grounded character has no fall arc to shape.
   *  2. Choose the regime multiplier from the sign of `velocity.y` and, on the
   *     way up, whether the jump is still held (see the class JSDoc for why).
   *  3. Integrate: `velocity.y += acceleration * scale * dt`. `acceleration`
   *     is already negative, so this always pulls downward.
   *  4. Clamp against terminal velocity so an unbounded fall cannot outrun the
   *     collision solver and tunnel through the floor.
   *
   * @param state    The live character record. Only `velocity.y` is written.
   * @param dt       Frame delta in seconds (already clamped by the controller).
   * @param jumpHeld True while the jump control is depressed this frame. Only
   *                 consulted during ascent, to select the variable-jump cut.
   *
   * Zero allocation.
   */
  apply(state: CharacterState, dt: number, jumpHeld: boolean): void {
    const { gravity } = this.config
    const velocity = state.velocity
    const ground = state.ground

    // 1. Grounded stick-to-floor bias. A character standing on a surface it can
    //    walk on has no arc to integrate; forcing a small downward velocity
    //    keeps it seated against the ground for next frame's sweep. The
    //    `velocity.y <= 0` guard is essential: the instant a jump fires,
    //    velocity.y goes positive while `isGrounded` may still read true, and we
    //    must NOT stomp that impulse back to -1.
    if (ground.isGrounded && ground.isOnWalkableSlope && velocity.y <= 0) {
      velocity.y = -1
      return
    }

    // 2. Regime multiplier. Base gravity on a held ascent; heavier gravity when
    //    falling or when the jump was released early.
    let scale = 1
    if (velocity.y < 0) {
      scale = gravity.fallMultiplier
    } else if (velocity.y > 0 && !jumpHeld) {
      scale = gravity.lowJumpMultiplier
    }

    // 3. Integrate. `gravity.acceleration` is negative, so this decreases
    //    velocity.y — accelerating a rise's decay or a fall's plunge.
    velocity.y += gravity.acceleration * scale * dt

    // 4. Terminal velocity floor. `terminalVelocity` is a positive magnitude, so
    //    the clamp is against its negation.
    if (velocity.y < -gravity.terminalVelocity) {
      velocity.y = -gravity.terminalVelocity
    }
  }
}
