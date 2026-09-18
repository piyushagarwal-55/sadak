import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import type { CharacterState } from '../core/CharacterState'
import type { IMovementIntent } from './MovementIntent'
import { EPSILON } from '../core/CharacterConstants'

/**
 * POUNCE Engine — AccelerationSolver
 *
 * Drives the horizontal (XZ) component of `velocity` toward the target implied
 * by the movement intent. It is a pure velocity shaper: it reads intent and
 * config, writes `velocity.x` and `velocity.z`, and touches nothing else. In
 * particular:
 *
 *   - It never reads or writes `velocity.y`. Vertical motion — gravity, jump
 *     impulse, variable-height cutoff, terminal velocity — is `GravitySolver`'s
 *     sole domain. Two files writing the same axis is exactly the kind of
 *     coupling this engine's single-responsibility rule exists to forbid.
 *   - It never touches `position`. Integration is the controller's job; the
 *     solver only decides how fast the character *wants* to be moving this frame.
 *
 * FEEL PARITY
 * The math reproduces the legacy `src/world/Player.js` ground handling exactly,
 * so the new pipeline is indistinguishable from the old one on flat ground:
 *
 *   - jog ceiling 6.4 m/s, sprint ceiling 12.5 m/s
 *   - approach the target at 14 m/s² while accelerating, 20 m/s² while braking
 *   - the approach is a single "move toward the target vector by at most
 *     `rate` metres/second" step — the legacy `moveTowards` on the XZ velocity,
 *     which brakes and turns with the same clamp rather than damping each axis
 *     independently. Clamping the *combined* delta is what keeps a hard 90°
 *     input change from briefly overspeeding along the diagonal.
 *
 * The airborne branch (`acceleration.air`, `acceleration.airDrag`) is new — the
 * legacy controller pinned the character to y=0 and had no air state at all.
 */
export class AccelerationSolver {
  /** The resolved config this solver reads its rates and ceilings from. Frozen
   *  at construction, shared by reference, never mutated. */
  private readonly config: IResolvedCharacterConfig

  constructor(config: IResolvedCharacterConfig) {
    this.config = config
  }

  /**
   * Shape horizontal velocity for one frame.
   *
   * Two regimes:
   *
   * 1. **Airborne, no input.** There is no target to chase, so instead of
   *    braking hard toward zero (which would read as the character slamming on
   *    the brakes in mid-air) we bleed horizontal speed off gently with
   *    `acceleration.airDrag`. Applied as a framerate-independent multiplicative
   *    decay so the retained fraction per real second is identical at 30 and 144
   *    fps. This preserves the "carry your momentum through a jump" feel while
   *    still letting a long fall settle.
   *
   * 2. **Everything else.** Build the target horizontal velocity from the
   *    intent, pick the approach `rate` for the current situation, and slide the
   *    current (vx, vz) toward the target by at most `rate·dt` metres/second.
   *    Because the clamp is on the *magnitude of the combined delta* — not on
   *    each axis — turning and stopping share one budget, matching the legacy
   *    `Vector2.moveTowards` behaviour precisely.
   *
   * Zero allocation: every intermediate is a local `number`. No `THREE.Vector3`
   * is constructed, and none is needed — the whole computation is four scalars.
   *
   * @param state  Live character state. `velocity.x` / `velocity.z` are written;
   *               everything else is read-only here.
   * @param intent Read-only desired-direction record for this frame.
   * @param dt     Frame delta in seconds (already clamped upstream to
   *               `MAX_DELTA_TIME`).
   */
  calculate(state: CharacterState, intent: Readonly<IMovementIntent>, dt: number): void {
    const { speed, acceleration } = this.config
    const velocity = state.velocity

    const wants = intent.magnitude > EPSILON

    // --- Regime 1: airborne with no steering input -------------------------
    // Decay toward zero instead of chasing a (0,0) target through the normal
    // move-toward step, which would apply the full `air` rate as a brake and
    // kill mid-air momentum. `airDrag` is a per-second coefficient; raising it
    // to the `dt` power makes the decay framerate-independent:
    //   v(t+dt) = v(t) · (1 - airDrag)^dt
    if (!state.isGrounded && !wants) {
      const retained = Math.pow(Math.max(0, 1 - acceleration.airDrag), dt)
      velocity.x *= retained
      velocity.z *= retained
      return
    }

    // --- Regime 2: chase the intent's target velocity ----------------------
    // topSpeed is the ceiling for the tier the character is currently in. The
    // sprint flag is the state machine's decision, already resolved before the
    // solver runs — the solver just honours it.
    const topSpeed = state.isSprinting ? speed.sprint : speed.jog

    // worldDirection is unit-length (or zero when !wants); magnitude is the
    // analog throttle. Their product scaled by topSpeed is the velocity the
    // character is asking for. When !wants this is (0,0): a grounded stop, which
    // is the branch that uses the harder `brake` rate below.
    const targetVX = intent.worldDirection.x * intent.magnitude * topSpeed
    const targetVZ = intent.worldDirection.z * intent.magnitude * topSpeed

    // Pick the approach rate:
    //   grounded + input  → ground accel (14, legacy ACCEL)
    //   grounded + no input → brake (20, legacy BRAKE) — stop harder than you go
    //   airborne + input  → air accel (5), the only way to steer a jump
    const rate =
      (state.isGrounded ? (wants ? acceleration.ground : acceleration.brake) : acceleration.air) *
      dt

    // Move (vx, vz) toward (targetVX, targetVZ) by at most `rate`. The clamp is
    // on the length of the delta vector, so a diagonal correction never travels
    // further than a cardinal one — this is `Vector2.moveTowards`, expanded.
    const dvx = targetVX - velocity.x
    const dvz = targetVZ - velocity.z
    const dmag = Math.sqrt(dvx * dvx + dvz * dvz)

    // Already within one step of the target (or exactly on it): snap and finish.
    // The `< EPSILON` guard also protects the division below from a zero divisor.
    if (dmag <= rate || dmag < EPSILON) {
      velocity.x = targetVX
      velocity.z = targetVZ
      return
    }

    // Otherwise advance exactly `rate` metres/second along the unit delta.
    const step = rate / dmag
    velocity.x += dvx * step
    velocity.z += dvz * step
  }
}
