import * as THREE from 'three'
import { MAX_DELTA_TIME } from '../core/CharacterConstants'
import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import type { CharacterState, IGroundState } from '../core/CharacterState'
import type { CharacterEvents, ILandEvent } from '../core/CharacterEvents'
import type { IMovementIntent } from './MovementIntent'
import { AccelerationSolver } from './AccelerationSolver'
import { RotationSolver } from './RotationSolver'
import { JumpController } from './JumpController'
import { Gravity } from '../physics/Gravity'
import { GroundSolver } from '../physics/GroundSolver'
import { CollisionSolver } from '../physics/CollisionSolver'
import type { CapsuleCollider } from '../physics/CapsuleCollider'
import { LocomotionStateMachine } from './LocomotionStateMachine'

/**
 * POUNCE Engine — MovementController
 *
 * The orchestrator. It owns one instance of every movement/physics solver and
 * drives them in a fixed, documented order once per frame. It is the *only*
 * file permitted to write `state.position`, to integrate velocity into
 * position, and to reconcile the answers the solvers hand back (where to snap,
 * whether the wall stalled us). The solvers solve; this file decides what the
 * character does about it. That division is the whole point of the engine's
 * single-responsibility rule — every solver stays testable in isolation because
 * none of them can reach across into another's axis.
 *
 * FRAME PIPELINE (the order is load-bearing, do not reshuffle)
 *   1. `beginFrame()`            — snapshot previousPosition + wasGrounded.
 *   2. GroundSolver.sweep + sync — refresh `state.ground` from below the feet.
 *   3. posture + timers + edges  — bridge intent→posture, age air/ground timers,
 *                                  fire the landing event off the pre-gravity
 *                                  fall speed.
 *   4. JumpController.update     — may set `velocity.y` to the launch impulse.
 *   5. AccelerationSolver        — shape horizontal `velocity.xz` toward intent.
 *   6. Gravity.apply             — integrate `velocity.y`.
 *   7. RotationSolver.align      — turn `heading` toward travel.
 *   8. INTEGRATE                 — `position += velocity · dt`.
 *   9. CollisionSolver.resolve   — push XZ out of walls, report stalls.
 *  10. ground snap + floor clamp — settle the capsule onto the surface.
 *  11. `refreshSpeeds()`         — publish the cached speed scalars.
 *
 * WHY GROUND IS SWEPT AT THE TOP, SNAPPED AT THE BOTTOM
 * The sweep runs against the position the feet held *entering* the frame, so
 * `shouldSnap()`/`getSnapY()` describe the surface the character was standing on
 * before it moved. Integration and collision then run, and the snap at the end
 * pulls the capsule back down onto that surface — which is what stops walking
 * down a shallow slope from turning into a string of tiny airborne hops.
 *
 * ZERO ALLOCATION
 * `tick()` constructs nothing. The only object it ever emits — the landing
 * event — is a single payload owned as a field and mutated in place, per the
 * `CharacterEvents` contract that emitters reuse their payloads.
 */
export class MovementController {
  private readonly config: IResolvedCharacterConfig
  private readonly state: CharacterState
  /** The live intent record, mutated upstream by `MovementIntent` and read
   *  (never written) here every frame. */
  private readonly intent: Readonly<IMovementIntent>
  private readonly events: CharacterEvents | undefined

  // --- Owned solvers -------------------------------------------------------
  private readonly groundSolver: GroundSolver
  private readonly collisionSolver: CollisionSolver
  private readonly gravitySolver: Gravity
  private readonly accelerationSolver: AccelerationSolver
  private readonly rotationSolver: RotationSolver
  private readonly jumpController: JumpController
  private readonly stateMachine: LocomotionStateMachine

  /**
   * World Y of the implicit floor. Mirrors `CapsuleCollider`'s default ground
   * plane (0), used as the hard backstop so the capsule can never integrate
   * below the world floor even if a snap is missed. Kept as a field so the
   * coupling to the collider's default is explicit and easy to find.
   */
  private readonly groundPlaneY = 0

  /** Reusable landing-event payload. Never escapes past a listener's callback,
   *  per the `CharacterEvents` reuse contract. */
  private readonly landEvent: ILandEvent = {
    impactSpeed: 0,
    airTime: 0,
    surfaceMaterialId: 0,
  }

  /** Whether the collision solver stalled the character against geometry this
   *  frame. Exposed for the debug HUD and animation; recomputed every tick. */
  private stalledThisFrame = false

  /**
   * @param config   Resolved, frozen tuning shared with every solver.
   * @param state    The live character record this controller advances.
   * @param intent   The live intent record (from `MovementIntent.getIntent()`).
   *                 Held read-only; the controller never writes it.
   * @param collider The world collision substrate the ground and collision
   *                 solvers query.
   * @param events   Optional notification channel for `land` / `teleport`.
   */
  constructor(
    config: IResolvedCharacterConfig,
    state: CharacterState,
    intent: Readonly<IMovementIntent>,
    collider: CapsuleCollider,
    events?: CharacterEvents,
  ) {
    this.config = config
    this.state = state
    this.intent = intent
    this.events = events

    this.groundSolver = new GroundSolver(config, collider)
    this.collisionSolver = new CollisionSolver(config, collider)
    this.gravitySolver = new Gravity(config)
    this.accelerationSolver = new AccelerationSolver(config)
    this.rotationSolver = new RotationSolver(config)
    this.jumpController = new JumpController(config, events)
    this.stateMachine = new LocomotionStateMachine(state)
  }

  /**
   * Advance the whole character by one frame.
   *
   * @param dt Frame delta in seconds. Clamped to `MAX_DELTA_TIME` at the top so
   *           a single hitching frame cannot tunnel the capsule through a wall —
   *           the pipeline takes a slow-motion stutter over a collision failure.
   *
   * Zero allocation.
   */
  tick(dt: number): void {
    // Clamp the step. A huge dt (tab backgrounded, breakpoint hit) would let the
    // integrator leap the capsule clean through geometry; better to slow down.
    if (dt > MAX_DELTA_TIME) dt = MAX_DELTA_TIME

    const state = this.state
    const intent = this.intent
    const velocity = state.velocity

    // 1. Roll the frame boundary: previousPosition + wasGrounded are snapshotted
    //    from *last* frame's values before anything writes this frame.
    state.beginFrame()

    // 2. Sweep the ground beneath the entering position, then publish the result
    //    into `state.ground` so `isGrounded`/`justLanded` read the fresh sweep.
    this.groundSolver.sweep(state.position)
    this.syncGround(this.groundSolver.getState())

    // 3a. Posture bridge. Until the LocomotionStateMachine (Week 4) owns these,
    //     the controller mirrors the intent flags the solvers downstream read:
    //     AccelerationSolver keys its top speed off `isSprinting`, CollisionSolver
    //     picks the capsule height off `isCrouching`.
    state.isSprinting = intent.wantsToSprint
    state.isCrouching = intent.wantsToCrouch

    // 3b. Landing edge. `justLanded` is true only on the frame the fresh sweep
    //     found ground that last frame did not. `velocity.y` still carries the
    //     fall speed here — gravity has not yet run and the snap has not zeroed
    //     it — so this is the one correct moment to measure impact.
    if (state.justLanded && this.events) {
      const land = this.landEvent
      land.impactSpeed = Math.abs(velocity.y)
      land.airTime = state.timeAirborne
      land.surfaceMaterialId = state.ground.surfaceMaterialId
      this.events.emit('land', land)
    }

    // 3c. Air/ground timers. Exactly one accrues each frame; the other resets, so
    //     `timeGrounded`/`timeAirborne` are always the dwell in the current mode.
    if (state.isGrounded) {
      state.timeGrounded += dt
      state.timeAirborne = 0
    } else {
      state.timeAirborne += dt
      state.timeGrounded = 0
    }

    // 3d. Locomotion state. Reads the fresh intent + ground and owns
    //     `state.current`/`previous`/`timeInState`. Additive: the movement math
    //     below still keys off the posture flags in 3a, so wiring the graph in
    //     changes what the character *reports* it is doing, not how it moves.
    this.stateMachine.update(dt, intent, state.ground)

    // 4. Vertical impulse. Consumes buffered/coyote jump windows and, on a
    //    launch frame, overwrites `velocity.y` with the derived jump speed.
    this.jumpController.update(state, intent, dt)

    // 5. Horizontal shaping toward the intent's target velocity (legacy feel).
    this.accelerationSolver.calculate(state, intent, dt)

    // 6. Vertical integration under gravity (variable-jump + weighted fall).
    //    `intent.wantsToJump` doubles as "jump held" for the low-jump cutoff.
    this.gravitySolver.apply(state, dt, intent.wantsToJump)

    // 7. Turn to face travel. Writes only heading + angularVelocity.
    this.rotationSolver.align(state, intent, dt)

    // 8. INTEGRATE. The single place position is advanced from velocity.
    state.position.x += velocity.x * dt
    state.position.y += velocity.y * dt
    state.position.z += velocity.z * dt

    // 9. Horizontal depenetration. Slides XZ out of walls and, when grinding
    //    into geometry it cannot pass, bleeds the wasted velocity and reports it.
    this.stalledThisFrame = this.collisionSolver.resolve(state, dt)

    // 10a. Ground snap. Only while descending or level (v.y <= 0): snapping a
    //      rising jump would glue the character to the floor. The snap target is
    //      the surface the entering sweep found (step 2).
    if (this.groundSolver.shouldSnap() && velocity.y <= 0) {
      state.position.y = this.groundSolver.getSnapY()
      if (velocity.y < 0) velocity.y = 0
    }

    // 10b. Hard floor backstop. Even if the snap missed, never let the feet sink
    //      below the world floor; zero any residual downward velocity.
    if (state.position.y < this.groundPlaneY) {
      state.position.y = this.groundPlaneY
      if (velocity.y < 0) velocity.y = 0
    }

    // 11. Publish the cached speed scalars every downstream consumer reads.
    state.refreshSpeeds(this.config.speed.sprint)
  }

  /**
   * Copy the ground solver's freshly swept state into `state.ground` in place.
   *
   * `GroundSolver` owns its own `IGroundState` and reports through `getState()`;
   * `CharacterState` owns a separate instance that the whole pipeline reads.
   * Mirroring one into the other here keeps that read authoritative without the
   * solver reaching into character state. Zero allocation — scalar copies plus
   * two `Vector3.copy` calls.
   */
  private syncGround(src: Readonly<IGroundState>): void {
    const dst = this.state.ground
    dst.isGrounded = src.isGrounded
    dst.isOnWalkableSlope = src.isOnWalkableSlope
    dst.surfaceNormal.copy(src.surfaceNormal)
    dst.distanceToGround = src.distanceToGround
    dst.surfaceMaterialId = src.surfaceMaterialId
    dst.contactPoint.copy(src.contactPoint)
  }

  /**
   * Reset the character to a clean standing state at `pos`, wiping momentum,
   * timers, and every solver's frame-to-frame memory. The current heading is
   * preserved — a teleport relocates, it does not spin the character.
   *
   * Solvers with no cross-frame state (gravity, acceleration, rotation,
   * collision) need no reset; only the ground solver and the jump controller
   * carry memory across frames.
   */
  teleport(pos: THREE.Vector3): void {
    this.state.reset(pos.x, pos.y, pos.z, this.state.heading)
    this.groundSolver.reset()
    this.jumpController.reset()
    this.stalledThisFrame = false
    this.events?.emit('teleport', undefined)
  }

  /** The live character record this controller advances. */
  getState(): CharacterState {
    return this.state
  }

  // --- Trivial solver accessors (diagnostics, higher layers) ---------------

  /** The ground solver, for teeter/snap queries the HUD or animation want. */
  get ground(): GroundSolver {
    return this.groundSolver
  }

  /** The collision solver. */
  get collision(): CollisionSolver {
    return this.collisionSolver
  }

  /** The gravity solver. */
  get gravity(): Gravity {
    return this.gravitySolver
  }

  /** The horizontal acceleration solver. */
  get acceleration(): AccelerationSolver {
    return this.accelerationSolver
  }

  /** The rotation solver. */
  get rotation(): RotationSolver {
    return this.rotationSolver
  }

  /** The jump controller. */
  get jump(): JumpController {
    return this.jumpController
  }

  /** True when the last `tick()` stalled the character against a wall. */
  get stalled(): boolean {
    return this.stalledThisFrame
  }
}
