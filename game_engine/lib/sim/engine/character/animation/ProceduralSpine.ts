import * as THREE from 'three'
import { EPSILON } from '../core/CharacterConstants'
import type { CharacterState } from '../core/CharacterState'
import type { RiggedAvatar } from '../appearance/RiggedAvatar'

/**
 * POUNCE Engine — ProceduralSpine
 *
 * Weight and momentum in the torso: leans the spine chain into acceleration and
 * banks it into turns, on top of whatever the mixer is already playing.
 *
 * Responsibilities:
 *   - Pitch the spine forward when speeding up, back when braking
 *   - Roll the spine into a turn, motorcycle-style, from angular velocity
 *   - Keep the lean small — a few degrees is what reads as mass
 *
 * Data flow: CharacterState (velocity, angularVelocity) -> ProceduralSpine -> skeleton
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS RUNS IN THE FRAME
 * ---------------------------------------------------------------------------
 * `RiggedAvatar.update()` advances the mixer first; this pass then overwrites
 * the three spine bones it owns with `bind · lean`. It must run BEFORE
 * `LookAtIK`, whose head aim reads the neck's parent (`Spine2`) orientation and
 * so needs the lean already applied.
 *
 * ---------------------------------------------------------------------------
 * THE ACCELERATION PROXY
 * ---------------------------------------------------------------------------
 * `CharacterState` tracks `velocity` but not acceleration — nothing in the
 * pipeline needs a stored acceleration except this lean. Rather than bloat the
 * state record, we derive an acceleration proxy locally by differencing
 * `velocity` across frames:
 *
 *     a ≈ (vₙ − vₙ₋₁) / dt
 *
 * Only the horizontal part matters, and only its component along the character
 * facing: accelerating forward should pitch the torso forward, braking should
 * throw it back. Vertical velocity (gravity, jump) is ignored — a falling
 * character is not "accelerating forward".
 *
 * ---------------------------------------------------------------------------
 * THE LEAN
 * ---------------------------------------------------------------------------
 * Two scalar drives, each clamped small and damped toward its target with
 * `MathUtils.damp` (framerate-independent exponential smoothing):
 *
 *   pitch  = clamp(−pitchGain · forwardAccel, ±maxPitch)   // about `right`
 *   roll   = clamp( rollGain · angularVelocity, ±maxRoll)  // about `forward`
 *
 * The banked total is then split down the chain — the higher a bone sits, the
 * more of the lean it carries, so the curve reads as a smooth arc rather than a
 * hinge at the hips:
 *
 *     Spine  20%   Spine1  30%   Spine2  50%
 *
 * Each bone is written as `bind · leanᵢ`, where `leanᵢ` is the shared lean
 * scaled by that bone's fraction and expressed in the bone's bind-local frame.
 * Because Mixamo bone axes are not world-aligned, the pitch/roll axes come from
 * config (`forwardAxis` / `upAxis`, with `right = up × forward`) so the rig
 * convention is calibratable.
 *
 * Zero allocation after `bind()`.
 */

/** Tunables for the spine lean. Angles in radians, gains in radians per unit. */
export interface ISpineLeanConfig {
  /** Radians of forward pitch per m/s² of forward acceleration. */
  readonly pitchGain: number
  /** Radians of roll per rad/s of turn rate. */
  readonly rollGain: number
  /** Hard ceiling on the pitch lean, ± this. */
  readonly maxPitch: number
  /** Hard ceiling on the roll bank, ± this. */
  readonly maxRoll: number
  /** Damping rate for both scalars, in 1/seconds. Higher settles faster. */
  readonly responsiveness: number
  /** Forward axis in a spine bone's bind-local frame. Calibrates the rig. */
  readonly forwardAxis: THREE.Vector3
  /** Up axis in the same frame. `right` is derived as `up × forward`. */
  readonly upAxis: THREE.Vector3
}

const DEG = Math.PI / 180

/** Stock lean: subtle by design — a hair under 10° at the limits. */
const DEFAULT_SPINE_LEAN_CONFIG: ISpineLeanConfig = {
  pitchGain: 0.012,
  rollGain: 0.02,
  maxPitch: 9 * DEG,
  maxRoll: 10 * DEG,
  responsiveness: 8,
  forwardAxis: new THREE.Vector3(0, 0, 1),
  upAxis: new THREE.Vector3(0, 1, 0),
}

/**
 * Share of the total lean carried by each bone, low to high. Sums to 1 so the
 * assembled arc reaches the full lean angle across the chain.
 */
const SPINE_FRACTION = 0.2
const SPINE1_FRACTION = 0.3
const SPINE2_FRACTION = 0.5

export class ProceduralSpine {
  private readonly avatar: RiggedAvatar
  private readonly state: CharacterState

  // --- Resolved config ------------------------------------------------------
  private readonly pitchGain: number
  private readonly rollGain: number
  private readonly maxPitch: number
  private readonly maxRoll: number
  private readonly responsiveness: number
  /** Owned, normalized basis. `_right = _up × _forward`. */
  private readonly _forward = new THREE.Vector3(0, 0, 1)
  private readonly _up = new THREE.Vector3(0, 1, 0)
  private readonly _right = new THREE.Vector3(1, 0, 0)

  // --- Bones + bind pose ----------------------------------------------------
  private spine: THREE.Bone | null = null
  private spine1: THREE.Bone | null = null
  private spine2: THREE.Bone | null = null
  private readonly bindSpine = new THREE.Quaternion()
  private readonly bindSpine1 = new THREE.Quaternion()
  private readonly bindSpine2 = new THREE.Quaternion()
  private bound = false

  // --- Acceleration proxy + smoothing state ---------------------------------
  /** Previous frame's velocity, for the finite-difference acceleration. */
  private readonly _prevVelocity = new THREE.Vector3()
  /** Damped lean scalars, radians. Persist between frames so the torso eases. */
  private pitch = 0
  private roll = 0

  // --- Per-frame scratch (zero allocation) ----------------------------------
  private readonly _accel = new THREE.Vector3()
  private readonly _qPitch = new THREE.Quaternion()
  private readonly _qRoll = new THREE.Quaternion()
  private readonly _lean = new THREE.Quaternion()

  constructor(
    avatar: RiggedAvatar,
    state: CharacterState,
    overrides: Partial<ISpineLeanConfig> = {},
  ) {
    this.avatar = avatar
    this.state = state
    this.pitchGain = overrides.pitchGain ?? DEFAULT_SPINE_LEAN_CONFIG.pitchGain
    this.rollGain = overrides.rollGain ?? DEFAULT_SPINE_LEAN_CONFIG.rollGain
    this.maxPitch = overrides.maxPitch ?? DEFAULT_SPINE_LEAN_CONFIG.maxPitch
    this.maxRoll = overrides.maxRoll ?? DEFAULT_SPINE_LEAN_CONFIG.maxRoll
    this.responsiveness = overrides.responsiveness ?? DEFAULT_SPINE_LEAN_CONFIG.responsiveness

    this._forward.copy(overrides.forwardAxis ?? DEFAULT_SPINE_LEAN_CONFIG.forwardAxis).normalize()
    this._up.copy(overrides.upAxis ?? DEFAULT_SPINE_LEAN_CONFIG.upAxis).normalize()
    this._right.crossVectors(this._up, this._forward).normalize()
  }

  /**
   * Cache the spine chain's bind-pose rotations. Safe to call eagerly after the
   * avatar loads; also runs lazily on the first `update()`. Seeds the
   * acceleration proxy with the current velocity so the first frame reports no
   * spurious spike. Returns true once bound.
   */
  bind(): boolean {
    if (this.bound) return true
    if (!this.avatar.ready) return false
    const bones = this.avatar.getBones()
    this.spine = bones.spine
    this.spine1 = bones.spine1
    this.spine2 = bones.spine2
    this.bindSpine.copy(bones.spine.quaternion)
    this.bindSpine1.copy(bones.spine1.quaternion)
    this.bindSpine2.copy(bones.spine2.quaternion)
    this._prevVelocity.copy(this.state.velocity)
    this.bound = true
    return true
  }

  /**
   * Update the acceleration proxy, resolve the lean, and write it onto the
   * three spine bones. Runs after the mixer, before `LookAtIK`. No-ops until
   * bound. Zero allocation.
   *
   * @param dt Seconds since the previous update.
   */
  update(dt: number): void {
    if (!this.bound && !this.bind()) return
    const spine = this.spine
    const spine1 = this.spine1
    const spine2 = this.spine2
    if (!spine || !spine1 || !spine2) return

    const state = this.state

    // --- Acceleration proxy: forward component of (Δv / dt) ----------------
    // Guard tiny/zero dt so the difference never divides by ~0. On a skipped
    // frame we simply hold the previous lean and roll the velocity snapshot
    // forward.
    let forwardAccel = 0
    if (dt > EPSILON) {
      this._accel.copy(state.velocity).sub(this._prevVelocity).divideScalar(dt)
      // Facing forward on the XZ plane: (sin h, 0, cos h), matching the engine's
      // heading convention. Dot the horizontal acceleration onto it; vertical
      // velocity is deliberately excluded.
      const sinH = Math.sin(state.heading)
      const cosH = Math.cos(state.heading)
      forwardAccel = this._accel.x * sinH + this._accel.z * cosH
    }
    this._prevVelocity.copy(state.velocity)

    // --- Drives -------------------------------------------------------------
    // Speeding up throws the torso forward (negative pitch about `right`, per
    // the offset convention below); braking rocks it back. Turning banks the
    // chain into the turn from the signed angular velocity.
    const pitchTarget = clamp(-this.pitchGain * forwardAccel, -this.maxPitch, this.maxPitch)
    const rollTarget = clamp(this.rollGain * state.angularVelocity, -this.maxRoll, this.maxRoll)

    // Framerate-independent damp toward the targets.
    this.pitch = THREE.MathUtils.damp(this.pitch, pitchTarget, this.responsiveness, dt)
    this.roll = THREE.MathUtils.damp(this.roll, rollTarget, this.responsiveness, dt)

    // --- Distribute the lean down the chain ---------------------------------
    this.applyLean(spine, this.bindSpine, SPINE_FRACTION)
    this.applyLean(spine1, this.bindSpine1, SPINE1_FRACTION)
    this.applyLean(spine2, this.bindSpine2, SPINE2_FRACTION)
  }

  /**
   * Write `bind · lean` onto one bone, where `lean` is the shared pitch/roll
   * scaled by this bone's `fraction` and built in the bone's bind-local frame.
   * Pitch rotates about `right`, roll about `forward`; both are small, so their
   * compose order is immaterial. Zero allocation.
   */
  private applyLean(bone: THREE.Bone, bind: THREE.Quaternion, fraction: number): void {
    this._qPitch.setFromAxisAngle(this._right, this.pitch * fraction)
    this._qRoll.setFromAxisAngle(this._forward, this.roll * fraction)
    this._lean.copy(this._qPitch).multiply(this._qRoll)
    bone.quaternion.copy(bind).multiply(this._lean)
  }
}

/** Branchless-ish scalar clamp; kept local to avoid a per-call import indirection. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
