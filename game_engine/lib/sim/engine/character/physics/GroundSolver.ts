import * as THREE from 'three'
import { WORLD_UP } from '../core/CharacterConstants'
import { clearGroundState, createGroundState } from '../core/CharacterState'
import type { IGroundState } from '../core/CharacterState'
import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import { createSweepHit } from './CapsuleCollider'
import type { CapsuleCollider, ISweepHit } from './CapsuleCollider'

/**
 * POUNCE Engine — GroundSolver
 *
 * Performs environmental sweeps beneath the character to determine ground
 * status, surface normals, and distance to the floor.
 *
 * It solves and reports. It does not move the character, does not touch
 * velocity, and does not decide what the character does about the answer —
 * `MovementController` owns all of that. In particular, "snap the character to
 * the ground" is answered here as *where* to snap (`shouldSnap` plus
 * `contactPoint.y`); the controller performs the write.
 */

// Re-exported so the module surface matches the specification: consumers
// import `IGroundState` from GroundSolver. The declaration lives in
// CharacterState.ts because it is passive data and CharacterState must own an
// instance of it.
export type { IGroundState } from '../core/CharacterState'

export class GroundSolver {
  private readonly config: IResolvedCharacterConfig
  private readonly collider: CapsuleCollider

  /** The live ground state. Allocated once, mutated in place forever. */
  private readonly state: IGroundState = createGroundState()

  /** Scratch hit records. Never escape this class. */
  private readonly sweepHit: ISweepHit = createSweepHit()
  private readonly centreHit: ISweepHit = createSweepHit()

  /** True when the probe found ground but the centre of mass did not. */
  private teetering = false

  /** True when the found ground is close enough to snap down onto. */
  private snap = false

  constructor(config: IResolvedCharacterConfig, collider: CapsuleCollider) {
    this.config = config
    this.collider = collider
  }

  /**
   * Sweep beneath `position` and refresh the ground state.
   *
   * PIPELINE
   *  1. Origin is `position + UP * probeRadius`, which puts the bottom of the
   *     probe sphere exactly at the character's feet. Every distance the sweep
   *     reports is therefore already a foot-to-floor gap — no offset maths at
   *     the call sites.
   *  2. Sphere-cast down by `stepHeight + snapDistance + padding`. The probe
   *     reaches deliberately further than the character will actually snap, so
   *     `distanceToGround` stays meaningful for a short while after takeoff
   *     instead of jumping straight to Infinity.
   *  3. No hit -> not grounded, distance Infinity, normal reset to UP.
   *  4. Hit -> classify the surface angle against `maxSlopeAngle`, record the
   *     contact, then run the ledge test.
   *
   * @param position World position of the capsule base (the feet).
   *
   * Zero allocation.
   */
  sweep(position: THREE.Vector3): void {
    const { derived, ground } = this.config
    const radius = derived.groundProbeRadius
    const state = this.state

    // 1. Probe origin: one radius above the feet, so the sphere's lowest point
    //    starts level with them.
    const originY = position.y + radius

    // 2. Sweep.
    const found = this.collider.sphereCastDown(
      position.x,
      originY,
      position.z,
      radius,
      derived.groundProbeLength,
      this.sweepHit,
    )

    // 3. Nothing underneath.
    if (!found) {
      clearGroundState(state)
      this.teetering = false
      this.snap = false
      return
    }

    const hit = this.sweepHit
    const distance = hit.distance

    // 4a. Surface angle. `normal` is unit length and WORLD_UP is (0,1,0), so
    //     the dot product is just `normal.y` — but going through dot() keeps
    //     this correct if non-flat surfaces ever arrive.
    //
    //     Comparing the cosine against the precomputed `cosMaxSlope` is
    //     equivalent to `acos(dot) <= maxSlopeAngle` and avoids inverse trig
    //     on every hit. A larger cosine means a shallower slope, hence >=.
    const cosAngle = hit.normal.dot(WORLD_UP as THREE.Vector3)
    state.isOnWalkableSlope = cosAngle >= derived.cosMaxSlope

    // 4b. Record the contact.
    state.surfaceNormal.copy(hit.normal)
    state.contactPoint.copy(hit.point)
    state.surfaceMaterialId = hit.materialId
    state.distanceToGround = distance

    // Grounded means "close enough to be standing on it", not merely "the probe
    // found something". The probe intentionally reaches past the snap distance,
    // so without this test the character would report grounded while most of a
    // step-height above the floor.
    this.snap = distance <= ground.snapDistance
    state.isGrounded = this.snap

    // 4c. Ledge teetering. The probe sphere has real width, so it still reports
    //     a hit when only its outer edge clips a platform — which is how a
    //     character ends up apparently standing on thin air beside a kerb. A
    //     zero-width ray straight down through the centre of mass settles it.
    if (state.isGrounded) {
      const centreFound = this.collider.rayCastDown(
        position.x,
        position.y + radius,
        position.z,
        derived.groundProbeLength,
        this.centreHit,
      )
      this.teetering =
        !centreFound || this.centreHit.distance > distance + ground.stepHeight
    } else {
      this.teetering = false
    }
  }

  /** The live ground state. Returns the internal instance, not a copy. */
  getState(): Readonly<IGroundState> {
    return this.state
  }

  /**
   * True when the sphere probe found ground but a ray through the centre of
   * mass did not — the character is hanging over an edge.
   *
   * Exposed separately rather than added to `IGroundState`, which the
   * specification fixes at six fields. Consumers that want teeter animation or
   * a balance wobble read it from here.
   */
  isTeetering(): boolean {
    return this.teetering
  }

  /**
   * True when the character is within `snapDistance` of the surface and should
   * be pulled down onto it.
   *
   * The controller must ignore this while the character is moving upward —
   * snapping during a jump's ascent would glue it to the floor. The solver has
   * no velocity reference by design, so it cannot make that call itself.
   */
  shouldSnap(): boolean {
    return this.snap
  }

  /**
   * World Y the capsule base should be placed at to rest exactly on the
   * surface. Only meaningful while `shouldSnap()` is true.
   */
  getSnapY(): number {
    return this.state.contactPoint.y
  }

  /** Forget everything. Called on teleport and world transitions. */
  reset(): void {
    clearGroundState(this.state)
    this.teetering = false
    this.snap = false
  }
}
