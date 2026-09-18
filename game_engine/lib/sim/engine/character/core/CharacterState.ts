import * as THREE from 'three'
import { MIN_SPEED_SQ } from './CharacterConstants'

/**
 * POUNCE Engine — CharacterState
 *
 * States only track. Nothing in this file solves, sweeps, integrates, or
 * decides. It is the single mutable record of "what is true about this
 * character right now", pre-allocated once and mutated in place forever after.
 *
 * Every consumer reads from here; only `MovementController` writes to it.
 */

// ---------------------------------------------------------------------------
// Ground contact
// ---------------------------------------------------------------------------

/**
 * Result of one downward environment sweep.
 *
 * Authored here rather than in `GroundSolver.ts` because it is passive data,
 * and `CharacterState` must own an instance of it before the solver exists.
 * `GroundSolver.ts` re-exports this type in Week 2, so its public surface still
 * matches the spec — solvers solve, data files hold data.
 */
export interface IGroundState {
  /** True when the capsule is resting on, or snapped to, a surface. */
  isGrounded: boolean
  /** True when that surface is shallow enough to stand on rather than slide
   *  down. Meaningless while `isGrounded` is false. */
  isOnWalkableSlope: boolean
  /** Unit normal of the surface underfoot. Holds `(0,1,0)` when ungrounded so
   *  consumers never have to null-check before projecting onto it. */
  surfaceNormal: THREE.Vector3
  /** Gap between the feet and the surface below, in metres. `Infinity` when
   *  the sweep found nothing at all. */
  distanceToGround: number
  /** Surface lookup id, for footstep audio and particle selection. 0 = default. */
  surfaceMaterialId: number
  /** World-space point where the sweep touched down. */
  contactPoint: THREE.Vector3
}

/** Allocate a zeroed ground state. Call once, at construction. */
export function createGroundState(): IGroundState {
  return {
    isGrounded: false,
    isOnWalkableSlope: false,
    surfaceNormal: new THREE.Vector3(0, 1, 0),
    distanceToGround: Infinity,
    surfaceMaterialId: 0,
    contactPoint: new THREE.Vector3(),
  }
}

/** Reset a ground state to "nothing underneath", in place. */
export function clearGroundState(g: IGroundState): void {
  g.isGrounded = false
  g.isOnWalkableSlope = false
  g.surfaceNormal.set(0, 1, 0)
  g.distanceToGround = Infinity
  g.surfaceMaterialId = 0
  g.contactPoint.set(0, 0, 0)
}

// ---------------------------------------------------------------------------
// Locomotion identity
// ---------------------------------------------------------------------------

/**
 * Locomotion states the machine can occupy. Declared as a frozen object rather
 * than a TS `enum` because `isolatedModules` forbids `const enum`, and a plain
 * `enum` emits a runtime object we would otherwise never use.
 *
 * Week 4 extends this set; the union type below updates automatically.
 */
export const LocomotionState = Object.freeze({
  Idle: 'idle',
  Walk: 'walk',
  Jog: 'jog',
  Sprint: 'sprint',
  Crouch: 'crouch',
  Airborne: 'airborne',
  Landing: 'landing',
  Sliding: 'sliding',
  Sitting: 'sitting',
} as const)

export type LocomotionStateId = (typeof LocomotionState)[keyof typeof LocomotionState]

// ---------------------------------------------------------------------------
// Character state
// ---------------------------------------------------------------------------

/**
 * The live record for one character.
 *
 * Field groups, in the order the pipeline writes them:
 *   transform → velocity → ground → timers → locomotion
 */
export class CharacterState {
  // --- Transform -----------------------------------------------------------

  /** World position of the capsule base (the feet), not its centre. */
  readonly position = new THREE.Vector3()

  /** Position at the top of the current frame, before integration. Lets
   *  consumers derive actual displacement — which differs from
   *  `velocity * dt` whenever the collision solver ate part of the step. */
  readonly previousPosition = new THREE.Vector3()

  /** Facing angle in radians about world Y, matching the convention in
   *  `world/Avatar.js`: forward is `(sin(heading), 0, cos(heading))`. */
  heading = 0

  /** Current turn rate in rad/s. Signed; positive is counter-clockwise. */
  angularVelocity = 0

  // --- Velocity ------------------------------------------------------------

  /** Full world-space velocity, m/s. Y carries gravity and jump impulse. */
  readonly velocity = new THREE.Vector3()

  /** Horizontal (XZ) speed in m/s, cached each frame so the many consumers
   *  that need it — animation, FOV, audio, state transitions — share one
   *  sqrt instead of each calling `.length()`. */
  horizontalSpeed = 0

  /** `horizontalSpeed` as a fraction of the sprint ceiling, 0..1+. Drives the
   *  camera FOV kick and the run-cycle animation weight. */
  speedRatio = 0

  // --- Ground --------------------------------------------------------------

  /** Latest sweep result. Owned here, filled by `GroundSolver`. */
  readonly ground: IGroundState = createGroundState()

  /** Ground state from the previous frame's sweep, kept so the controller can
   *  detect the landing and takeoff edges without extra bookkeeping. */
  wasGrounded = false

  // --- Timers --------------------------------------------------------------

  /** Seconds since the character last became grounded. Zero while airborne. */
  timeGrounded = 0

  /** Seconds since the character last left the ground. Zero while grounded.
   *  Also the fall duration used to scale landing impact. */
  timeAirborne = 0

  /** Counts down from `jump.coyoteTime` after walking off a ledge. While
   *  positive, a jump is still legal despite `isGrounded` being false. */
  coyoteTimer = 0

  /** Counts down from `jump.bufferTime` after a jump press. While positive,
   *  the jump fires the instant the character touches down. */
  jumpBufferTimer = 0

  /** Counts down from `jump.cooldown` after a jump fires. Blocks re-jumping. */
  jumpCooldownTimer = 0

  // --- Locomotion ----------------------------------------------------------

  current: LocomotionStateId = LocomotionState.Idle
  previous: LocomotionStateId = LocomotionState.Idle

  /** Seconds spent in `current`. Reset by the state machine on every change. */
  timeInState = 0

  // --- Posture flags -------------------------------------------------------

  isCrouching = false
  isSitting = false
  isSprinting = false

  /** True while descending a surface too steep to stand on. */
  isSliding = false

  // -------------------------------------------------------------------------
  // Derived reads
  // -------------------------------------------------------------------------

  /** Convenience passthrough. Reads better than `state.ground.isGrounded` at
   *  the dozens of call sites that only care about the boolean. */
  get isGrounded(): boolean {
    return this.ground.isGrounded
  }

  /** True when horizontal motion is below the "fully stopped" threshold. */
  get isStationary(): boolean {
    const { x, z } = this.velocity
    return x * x + z * z < MIN_SPEED_SQ
  }

  /** True on the exact frame the character touched down. */
  get justLanded(): boolean {
    return this.ground.isGrounded && !this.wasGrounded
  }

  /** True on the exact frame the character left the ground. */
  get justLeftGround(): boolean {
    return !this.ground.isGrounded && this.wasGrounded
  }

  // -------------------------------------------------------------------------
  // Mutation
  // -------------------------------------------------------------------------

  /**
   * Roll the frame boundary: snapshot what the next frame will compare against.
   * Call once at the very top of `MovementController.tick()`, before any solver
   * writes. Zero allocation.
   */
  beginFrame(): void {
    this.previousPosition.copy(this.position)
    this.wasGrounded = this.ground.isGrounded
  }

  /**
   * Recompute the cached speed scalars from `velocity`. Call once after
   * integration, never mid-pipeline — the whole point is that everything
   * downstream reads the same values.
   *
   * @param sprintSpeed Sprint ceiling, used as the denominator for `speedRatio`.
   */
  refreshSpeeds(sprintSpeed: number): void {
    const { x, z } = this.velocity
    this.horizontalSpeed = Math.sqrt(x * x + z * z)
    this.speedRatio = sprintSpeed > 0 ? this.horizontalSpeed / sprintSpeed : 0
  }

  /**
   * Hard reset to a clean standing state at `x, y, z`. Used by spawn, world
   * transitions, and `MovementController.teleport()`. Clears velocity and every
   * timer so no momentum or buffered input survives the jump.
   */
  reset(x: number, y: number, z: number, heading = 0): void {
    this.position.set(x, y, z)
    this.previousPosition.set(x, y, z)
    this.heading = heading
    this.angularVelocity = 0

    this.velocity.set(0, 0, 0)
    this.horizontalSpeed = 0
    this.speedRatio = 0

    clearGroundState(this.ground)
    this.wasGrounded = false

    this.timeGrounded = 0
    this.timeAirborne = 0
    this.coyoteTimer = 0
    this.jumpBufferTimer = 0
    this.jumpCooldownTimer = 0

    this.current = LocomotionState.Idle
    this.previous = LocomotionState.Idle
    this.timeInState = 0

    this.isCrouching = false
    this.isSitting = false
    this.isSprinting = false
    this.isSliding = false
  }
}
