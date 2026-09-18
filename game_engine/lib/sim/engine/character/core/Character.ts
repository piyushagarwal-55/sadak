import * as THREE from 'three'
import { createCharacterConfig } from './CharacterConfig'
import type { CharacterConfigOverrides, IResolvedCharacterConfig } from './CharacterConfig'
import { CharacterState } from './CharacterState'
import { CharacterEvents } from './CharacterEvents'
import { MovementIntent } from '../movement/MovementIntent'
import { MovementController } from '../movement/MovementController'
import { CapsuleCollider } from '../physics/CapsuleCollider'
import type { ILegacyCollider } from '../physics/CapsuleCollider'

/**
 * POUNCE Engine — Character
 *
 * The composition root for one character. It constructs and wires every
 * subsystem — the resolved config, the mutable state, the collision substrate,
 * the intent buffer, the event channel, and the `MovementController` that drives
 * them — and exposes the small surface the game loop actually touches: feed
 * input with `drive()`, step the simulation with `tick()`, relocate with
 * `teleport()`.
 *
 * It owns objects; it does not solve. Every frame of physics lives behind
 * `MovementController`; this file's only job is to hold the pieces together and
 * translate the game's raw input (camera-relative stick axes, button booleans)
 * into the standardized `MovementIntent` the pipeline consumes.
 *
 * DATA FLOW
 *   Game ─drive()→ MovementIntent ─┐
 *                                  ├→ MovementController → CharacterState
 *   Game ─tick()───────────────────┘                          │
 *   audio / vfx / ui  ←──────────────  CharacterEvents  ←──────┘
 *
 * This is the drop-in replacement for `world/Player.js`: same ground feel (jog
 * 6.4, sprint 12.5, accel 14, brake 20, the snappy `pow(0.00002, dt)` turn),
 * now with the vertical axis, forgiveness windows, and slope handling the legacy
 * controller never had.
 */
export class Character {
  /** Resolved, frozen tuning for this character. */
  private readonly config: IResolvedCharacterConfig

  /** The single mutable record of what is true about this character right now. */
  private readonly _state: CharacterState

  /** One-way notification channel out to audio, particles, UI, analytics. */
  private readonly _events: CharacterEvents

  /** The world collision substrate. Rebuilt on every world transition via
   *  `setColliders()`. */
  private readonly collider: CapsuleCollider

  /** The hardware-agnostic intent buffer. `drive()` writes it; the controller
   *  reads it. */
  private readonly intent: MovementIntent

  /** The orchestrator that advances the whole pipeline each frame. */
  private readonly controller: MovementController

  /** Scratch position for `teleport()`, so relocating allocates nothing. */
  private readonly _teleportPos = new THREE.Vector3()

  /**
   * @param overrides Sparse per-character tuning layered onto the stock config.
   *                  Omit for the default POUNCE pedestrian.
   */
  constructor(overrides?: CharacterConfigOverrides) {
    this.config = createCharacterConfig(overrides)
    this._state = new CharacterState()
    this._events = new CharacterEvents()
    this.collider = new CapsuleCollider()
    this.intent = new MovementIntent()
    this.controller = new MovementController(
      this.config,
      this._state,
      this.intent.getIntent(),
      this.collider,
      this._events,
    )
  }

  /**
   * Load this character's collision world from a legacy `world/BaseWorld.js`
   * collider list. Forwarded verbatim to the `CapsuleCollider`, which promotes
   * the flat XZ rectangles into real 3-D AABBs.
   */
  setColliders(legacyColliders: readonly ILegacyCollider[]): void {
    this.collider.setColliders(legacyColliders)
  }

  /**
   * Feed one frame of input. Rebuilds the movement intent from the raw stick
   * axes and the camera basis, then latches the discrete action buttons.
   *
   * Separated from `tick()` on purpose: input arrives on the event thread /
   * render cadence, simulation advances on the fixed step, and an AI-driven
   * character supplies intent without ever calling this at all.
   *
   * @param rawInput   Raw stick/key axes: `x` strafe (+ right), `y` forward
   *                   (+ forward). Magnitudes above 1 are clamped downstream.
   * @param camForward Camera forward vector; flattened to XZ by the intent.
   * @param camRight   Camera right vector; flattened to XZ by the intent.
   * @param jump       Jump button level (held = true). Edge detection is the
   *                   `JumpController`'s job, not this call's.
   * @param sprint     Sprint button level.
   * @param crouch     Crouch button level.
   *
   * Zero allocation.
   */
  drive(
    rawInput: THREE.Vector2,
    camForward: THREE.Vector3,
    camRight: THREE.Vector3,
    jump: boolean,
    sprint: boolean,
    crouch: boolean,
  ): void {
    this.intent.update(rawInput, camForward, camRight, this._state.heading)
    this.intent.setActions(jump, sprint, crouch)
  }

  /**
   * Advance the character by one simulation frame.
   *
   * @param dt Frame delta in seconds. Clamped to `MAX_DELTA_TIME` inside the
   *           controller.
   */
  tick(dt: number): void {
    this.controller.tick(dt)
  }

  /**
   * Relocate to `x, y, z`, wiping momentum, timers, buffered input, and solver
   * memory so nothing survives the jump. Heading is preserved unless supplied.
   *
   * @param heading Optional new facing in radians; keeps the current facing when
   *                omitted.
   */
  teleport(x: number, y: number, z: number, heading?: number): void {
    this._teleportPos.set(x, y, z)
    this.controller.teleport(this._teleportPos)
    if (heading !== undefined) this._state.heading = heading
    // Drop any input held across the transition so a key down during a teleport
    // does not immediately re-accelerate or re-jump on arrival.
    this.intent.clear()
  }

  /** The live character record. Read freely; do not retain copies across frames. */
  get state(): CharacterState {
    return this._state
  }

  /** The collision substrate, for systems that raycast the same world — Foot IK
   *  (ground probes under each foot) and the camera's occlusion sweep. */
  get collisionWorld(): CapsuleCollider {
    return this.collider
  }

  /** The character's event channel, for audio/vfx/ui to subscribe to. */
  get events(): CharacterEvents {
    return this._events
  }
}
