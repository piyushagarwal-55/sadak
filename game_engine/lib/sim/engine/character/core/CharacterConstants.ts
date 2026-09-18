import * as THREE from 'three'

/**
 * POUNCE Engine — CharacterConstants
 *
 * Passive data only. Nothing in this file allocates at runtime, reads the
 * world, or holds mutable state. Solvers import these values; they never
 * write back.
 *
 * TUNING PROVENANCE
 * The ground-movement numbers reproduce the feel of the pre-engine controller
 * in `src/world/Player.js` exactly, so the new pipeline can be swapped in
 * without a re-tune. Where that file had a value, it is preserved and
 * annotated. Vertical motion (gravity, jump, slopes, steps) is new — the old
 * controller pinned the character to y=0 and had no physics layer at all.
 */

// ---------------------------------------------------------------------------
// Universal constants
// ---------------------------------------------------------------------------

/**
 * Frozen world-up. Shared by every solver as the reference axis for slope
 * angles, gravity, and horizontal/vertical velocity decomposition.
 *
 * Frozen deliberately: ES modules run in strict mode, so any accidental
 * `WORLD_UP.y = ...` inside a solver throws immediately instead of silently
 * corrupting every downstream angle calculation. Read-only use
 * (`v.copy(WORLD_UP)`, `v.dot(WORLD_UP)`) is unaffected.
 */
export const WORLD_UP: Readonly<THREE.Vector3> = Object.freeze(new THREE.Vector3(0, 1, 0))

/** Generic float tolerance for "is this basically zero". */
export const EPSILON = 1e-5

/**
 * Below this squared speed the character is treated as fully stopped. Squared
 * so callers compare against `lengthSq()` and skip a sqrt in the hot path.
 */
export const MIN_SPEED_SQ = 1e-4

/**
 * Longest simulation step the character pipeline will integrate. Matches the
 * clamp already applied in `Game.tick()` (0.05s / 20fps floor). Beyond this a
 * single frame could tunnel the capsule through a wall, so the engine takes a
 * slow-motion hitch over a collision failure.
 */
export const MAX_DELTA_TIME = 0.05

// ---------------------------------------------------------------------------
// Config shape
// ---------------------------------------------------------------------------

/** Horizontal speed ceilings, in metres/second, per locomotion tier. */
export interface ISpeedConfig {
  /** True walking pace. Unused until `WalkController` lands in Week 4. */
  readonly walk: number
  /** Default ground speed. This is `WALK` from the legacy Player.js (6.4). */
  readonly jog: number
  /** Held-sprint ceiling. Legacy `SPRINT`. */
  readonly sprint: number
  /** Ceiling while moving mostly backwards. */
  readonly backpedal: number
  /** Ceiling while strafing with no forward component. */
  readonly strafe: number
  /** Ceiling while the capsule is compressed. */
  readonly crouch: number
}

/** Acceleration and damping rates, in metres/second². */
export interface IAccelerationConfig {
  /** Rate of approach toward target velocity while grounded and inputting. */
  readonly ground: number
  /** Rate of approach toward zero while grounded with no input. Higher than
   *  `ground` on purpose — braking harder than you accelerate is what makes a
   *  character feel deliberate rather than floaty. */
  readonly brake: number
  /** Rate of approach toward target velocity while airborne. */
  readonly air: number
  /** Passive horizontal drag applied while airborne with no input. */
  readonly airDrag: number
}

/** Turning behaviour, in radians. */
export interface IRotationConfig {
  /**
   * Fraction of angular error *remaining* after one full second of smoothing.
   * Applied as `1 - pow(smoothing, dt)`, which is the only framerate-independent
   * form of exponential damping. Legacy Player.js used 0.00002 — a very snappy
   * turn, roughly 10 rad/s of effective correction.
   */
  readonly smoothing: number
  /** Hard ceiling on turn rate, rad/s. Stops instantaneous 180° snaps. */
  readonly maxTurnRate: number
  /** Angular error above which the character plays a pivot rather than a turn. */
  readonly pivotThreshold: number
}

/** Vertical motion. All new — the legacy controller had no Y axis. */
export interface IGravityConfig {
  /** Downward acceleration, m/s². Negative. Exaggerated well past -9.81
   *  because real gravity reads as floaty at game scale and camera distance. */
  readonly acceleration: number
  /** Terminal downward speed, m/s. Positive magnitude. */
  readonly terminalVelocity: number
  /** Multiplier applied while rising with the jump key released, for
   *  variable-height jumps. */
  readonly lowJumpMultiplier: number
  /** Multiplier applied once vertical velocity turns negative, so the fall
   *  arc is faster than the rise arc. */
  readonly fallMultiplier: number
}

/** Jump feel, including the two forgiveness windows every good platformer has. */
export interface IJumpConfig {
  /** Peak height in metres, assuming a standing jump on flat ground. */
  readonly height: number
  /** Grace period after walking off a ledge during which a jump still fires. */
  readonly coyoteTime: number
  /** How long a jump press is remembered if pressed slightly before landing. */
  readonly bufferTime: number
  /** Minimum interval between consecutive jumps. */
  readonly cooldown: number
}

/** Capsule dimensions. The collider is a vertical capsule with its base at the
 *  character's origin (feet), matching the avatar rig in `world/Avatar.js`. */
export interface ICapsuleConfig {
  readonly radius: number
  /** Total standing height, base to crown. */
  readonly height: number
  /** Total height while crouched. */
  readonly crouchHeight: number
  /** Camera anchor / look-at height. Matches `Game.updateCamera` (1.55). */
  readonly eyeHeight: number
  /**
   * Collision padding. Sweeps stop this far short of geometry so the capsule
   * never rests exactly on a surface — floating-point equality at contact is
   * what produces jitter and tunnelling.
   */
  readonly skinWidth: number
}

/** Ground detection and traversal limits. Consumed by GroundSolver, SlopeSolver
 *  and StepSolver in Week 2. */
export interface IGroundConfig {
  /** Steepest surface that can be stood and walked on, in radians. */
  readonly maxSlopeAngle: number
  /** Tallest ledge that can be stepped onto without a jump, in metres. */
  readonly stepHeight: number
  /**
   * How far below the feet the solver will still snap the capsule down to
   * ground. Without this, walking down any slope becomes a series of tiny
   * airborne hops as the character launches off each edge.
   */
  readonly snapDistance: number
  /** Extra probe length past `snapDistance`, so `distanceToGround` stays
   *  meaningful for a short while after leaving the ground. */
  readonly probePadding: number
  /** Downhill acceleration applied on surfaces steeper than `maxSlopeAngle`. */
  readonly slideAcceleration: number
}

/** Wall interaction, consumed by CollisionSolver in Week 2. */
export interface ICollisionConfig {
  /** Depenetrate-and-reslide passes per frame. Three handles the common
   *  wall-then-corner case; a fourth catches acute wedges. Beyond that the
   *  remaining motion is discarded rather than iterated further. */
  readonly maxSlideIterations: number
  /**
   * Fraction of the frame's motion below which the solver gives up and zeroes
   * horizontal velocity. Mirrors the legacy `moved < speed * dt * 0.3` check
   * that stopped the character grinding audibly into walls.
   */
  readonly stallThreshold: number
  /** Velocity retained when a slide stalls out. Legacy value: 0.2. */
  readonly stallVelocityRetention: number
}

/** The full tunable set for one character. */
export interface ICharacterConfig {
  readonly speed: ISpeedConfig
  readonly acceleration: IAccelerationConfig
  readonly rotation: IRotationConfig
  readonly gravity: IGravityConfig
  readonly jump: IJumpConfig
  readonly capsule: ICapsuleConfig
  readonly ground: IGroundConfig
  readonly collision: ICollisionConfig
}

// ---------------------------------------------------------------------------
// Default profile
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180

/**
 * The stock POUNCE pedestrian. Ground values carried over verbatim from
 * `src/world/Player.js`; vertical values authored fresh for the physics layer.
 */
export const DEFAULT_CHARACTER_CONFIG: ICharacterConfig = Object.freeze({
  speed: Object.freeze({
    walk: 2.9,
    jog: 6.4, // legacy WALK
    sprint: 12.5, // legacy SPRINT
    backpedal: 4.2,
    strafe: 5.6,
    crouch: 2.1,
  }),
  acceleration: Object.freeze({
    ground: 14, // legacy ACCEL
    brake: 20, // legacy BRAKE
    air: 5,
    airDrag: 0.6,
  }),
  rotation: Object.freeze({
    smoothing: 0.00002, // legacy lerpAngle factor
    maxTurnRate: 14,
    pivotThreshold: 135 * DEG,
  }),
  gravity: Object.freeze({
    acceleration: -24,
    terminalVelocity: 45,
    lowJumpMultiplier: 2.0,
    fallMultiplier: 1.6,
  }),
  jump: Object.freeze({
    height: 1.15,
    coyoteTime: 0.12,
    bufferTime: 0.15,
    cooldown: 0.1,
  }),
  capsule: Object.freeze({
    radius: 0.42, // legacy Player.radius
    height: 1.8,
    crouchHeight: 1.15,
    eyeHeight: 1.55, // legacy camera anchor height
    skinWidth: 0.02,
  }),
  ground: Object.freeze({
    maxSlopeAngle: 50 * DEG,
    stepHeight: 0.45,
    snapDistance: 0.35,
    probePadding: 0.1,
    slideAcceleration: 12,
  }),
  collision: Object.freeze({
    maxSlideIterations: 4,
    stallThreshold: 0.3, // legacy 0.3 factor
    stallVelocityRetention: 0.2, // legacy 0.2 factor
  }),
})

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

/**
 * Initial upward velocity needed to reach `height` under `gravity`.
 *
 * From `v² = u² + 2as` with final velocity zero at the apex:
 *   0 = u² + 2·g·h  →  u = sqrt(-2·g·h)
 *
 * `gravity` is negative, so the product is positive. Call this once at config
 * time and cache it — never per frame.
 */
export function jumpVelocityFor(height: number, gravity: number): number {
  return Math.sqrt(Math.max(0, -2 * gravity * height))
}

/**
 * Cosine of the steepest walkable slope, precomputed for the ground solver.
 *
 * Comparing `normal.dot(WORLD_UP) >= cosMaxSlope` is mathematically identical
 * to `acos(normal.dot(WORLD_UP)) <= maxSlopeAngle` but skips the inverse
 * trig — which matters because the ground sweep runs on every hit, every frame.
 */
export function cosMaxSlopeFor(maxSlopeAngle: number): number {
  return Math.cos(maxSlopeAngle)
}

/** Radius of the sphere used for downward ground sweeps: the capsule's own
 *  radius pulled in by the skin so it cannot catch on the wall it is sliding
 *  along. */
export function groundProbeRadiusFor(capsule: ICapsuleConfig): number {
  return Math.max(EPSILON, capsule.radius - capsule.skinWidth)
}

/** Total downward sweep length for ground detection. */
export function groundProbeLengthFor(ground: IGroundConfig): number {
  return ground.stepHeight + ground.snapDistance + ground.probePadding
}
