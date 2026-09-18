import * as THREE from 'three'
import { EPSILON } from '../core/CharacterConstants'

/**
 * POUNCE Engine — MovementIntent
 *
 * A decoupled data buffer between hardware and locomotion. It answers one
 * question — "where does this character want to go, in world space?" — and
 * knows nothing about what produced the input. A keyboard, a gamepad, a replay
 * file and an NPC brain all drive it identically, which is what lets the same
 * `MovementController` run the player and the crowd.
 *
 * It decides nothing about whether the movement is *possible*. Walls, slopes
 * and speed ceilings belong to the solvers downstream.
 */

/** The standardized intent record read by `MovementController`. */
export interface IMovementIntent {
  /** Unit-length desired heading in world space, flattened to the XZ plane.
   *  Zero-length when there is no input — check `magnitude`, not this. */
  worldDirection: THREE.Vector3
  /** `worldDirection` rotated into the character's own frame: +Z is straight
   *  ahead, +X is to their right. This is what drives strafe/backpedal
   *  animation blending and directional speed limits. */
  localDirection: THREE.Vector3
  /** Analog throttle, 0.0 to 1.0. Digital keys produce exactly 0 or 1; a
   *  stick produces everything between. */
  magnitude: number
  wantsToJump: boolean
  wantsToSprint: boolean
  wantsToCrouch: boolean
}

export class MovementIntent {
  /**
   * The single intent instance, allocated once and mutated forever. `getIntent()`
   * hands out this exact reference — callers must treat it as read-only and must
   * not retain a copy across frames.
   */
  private readonly intent: IMovementIntent = {
    worldDirection: new THREE.Vector3(),
    localDirection: new THREE.Vector3(),
    magnitude: 0,
    wantsToJump: false,
    wantsToSprint: false,
    wantsToCrouch: false,
  }

  // Pre-allocated scratch. Never escapes this class, never reallocated.
  private readonly fwd = new THREE.Vector3()
  private readonly right = new THREE.Vector3()

  /**
   * Rebuild the desired world-space direction from raw input and camera basis.
   *
   * @param rawInput        Raw stick/key axes. `x` is strafe (+ right), `y` is
   *                        forward (+ forward). Magnitudes above 1 are clamped.
   * @param cameraForward   Camera's forward vector. Need not be normalized or
   *                        flat — both are handled here.
   * @param cameraRight     Camera's right vector. Same.
   * @param characterHeading Current facing in radians, for `localDirection`.
   *                        Defaults to 0.
   *
   * Zero allocation.
   */
  update(
    rawInput: THREE.Vector2,
    cameraForward: THREE.Vector3,
    cameraRight: THREE.Vector3,
    characterHeading = 0,
  ): void {
    const intent = this.intent

    // --- 1 & 2. Clamp the raw 2D vector to a maximum length of 1 ------------
    // Below 1 the analog magnitude is preserved; above 1 it saturates. This is
    // the step that stops W+D outrunning W: the raw (1,1) has length 1.414, so
    // it is scaled down rather than passed through.
    const rx = rawInput.x
    const ry = rawInput.y
    const rawLen = Math.sqrt(rx * rx + ry * ry)

    if (rawLen < EPSILON) {
      intent.magnitude = 0
      intent.worldDirection.set(0, 0, 0)
      intent.localDirection.set(0, 0, 0)
      return
    }

    intent.magnitude = rawLen > 1 ? 1 : rawLen
    const nx = rx / rawLen // unit strafe component
    const ny = ry / rawLen // unit forward component

    // --- 3 & 4. Flatten the camera basis onto the XZ plane ------------------
    // Without flattening, pitching the camera down would shrink the forward
    // vector and slow the character to a crawl — the classic "movement speed
    // depends on where I'm looking" bug.
    this.fwd.set(cameraForward.x, 0, cameraForward.z)
    this.right.set(cameraRight.x, 0, cameraRight.z)

    // A camera aimed straight up or down flattens to nothing. Rebuild the
    // missing axis from the other one via the world-up cross product, which
    // stays exact instead of degenerating.
    if (this.fwd.lengthSq() < EPSILON) {
      // forward = up × right
      this.fwd.set(this.right.z, 0, -this.right.x)
    }
    if (this.right.lengthSq() < EPSILON) {
      // right = forward × up
      this.right.set(-this.fwd.z, 0, this.fwd.x)
    }
    this.fwd.normalize()
    this.right.normalize()

    // --- 5. Combine and normalize ------------------------------------------
    // worldDirection stays unit-length; throttle rides separately in
    // `magnitude`, so a half-pressed stick changes speed without ever changing
    // the direction the character faces.
    const wx = this.fwd.x * ny + this.right.x * nx
    const wz = this.fwd.z * ny + this.right.z * nx
    const wLen = Math.sqrt(wx * wx + wz * wz)

    if (wLen < EPSILON) {
      // Forward and right were parallel and the inputs cancelled — degenerate
      // basis. Keep the throttle honest by dropping it rather than emitting a
      // direction we cannot justify.
      intent.magnitude = 0
      intent.worldDirection.set(0, 0, 0)
      intent.localDirection.set(0, 0, 0)
      return
    }

    const dx = wx / wLen
    const dz = wz / wLen
    intent.worldDirection.set(dx, 0, dz)

    // --- 6. Rotate into the character's own frame ---------------------------
    // Character forward is (sin h, 0, cos h), matching the avatar rig in
    // `world/Avatar.js`. Right is the cross product `forward x WORLD_UP`, which
    // expands to (-cos h, 0, sin h) — the same handedness the legacy camera
    // basis uses, where yaw 0 gives forward (0,0,-1) and right (1,0,0).
    //
    // Projecting onto that basis is two dot products, cheaper and more stable
    // than building a rotation matrix:
    //   localZ = dot(world, forward) = wx*sin h + wz*cos h
    //   localX = dot(world, right)   = -wx*cos h + wz*sin h
    const sh = Math.sin(characterHeading)
    const ch = Math.cos(characterHeading)
    intent.localDirection.set(dz * sh - dx * ch, 0, dx * sh + dz * ch)
  }

  /**
   * Set the discrete action intents. Separate from `update()` because they come
   * from button edges rather than axes, and because an AI driver supplies them
   * without ever touching a camera basis.
   *
   * `wantsToJump` is level-triggered here by design — edge detection and input
   * buffering are `JumpController`'s job, not this buffer's.
   */
  setActions(jump: boolean, sprint: boolean, crouch: boolean): void {
    this.intent.wantsToJump = jump
    this.intent.wantsToSprint = sprint
    this.intent.wantsToCrouch = crouch
  }

  /**
   * The live intent record. Returns the internal instance, not a copy — reading
   * it is free, retaining it across frames is a bug.
   */
  getIntent(): Readonly<IMovementIntent> {
    return this.intent
  }

  /** Zero every field. Used on world transitions and when input focus is lost,
   *  so a key held during a teleport does not survive the trip. */
  clear(): void {
    const intent = this.intent
    intent.worldDirection.set(0, 0, 0)
    intent.localDirection.set(0, 0, 0)
    intent.magnitude = 0
    intent.wantsToJump = false
    intent.wantsToSprint = false
    intent.wantsToCrouch = false
  }
}
