import { EPSILON } from '../core/CharacterConstants'
import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import type { CharacterState } from '../core/CharacterState'
import type { CapsuleCollider, IAABB } from './CapsuleCollider'

/**
 * POUNCE Engine — CollisionSolver
 *
 * Takes the position the integrator just wrote — which may sit *inside* a wall —
 * and nudges it back out to a legal one, sliding along faces instead of stopping
 * dead at them. When the character is grinding into geometry it cannot get past,
 * it reports a *stall* so the controller can bleed off the wasted velocity.
 *
 * SINGLE RESPONSIBILITY
 * This solver resolves horizontal overlap and nothing else. It writes only the
 * XZ components of `state.position` and, on a stall, the XZ components of
 * `state.velocity`. It never touches Y (gravity, steps and snapping own that
 * axis), never re-reads input, and never calls a controller.
 *
 * THE MODEL: A CIRCLE, NOT A CAPSULE
 * In XZ the capsule is exactly a circle of radius `capsule.radius`, so wall
 * resolution collapses to the 2-D "push a circle out of axis-aligned boxes"
 * problem. This is deliberate, not a shortcut:
 *   - POUNCE worlds are vertical extrusions of an XZ floor plan; every wall
 *     is a box with vertical sides, so the swept cross-section really is a
 *     circle at every height.
 *   - It reproduces the exact feel of the legacy `collideCircle` in
 *     `src/core/util.js` that the whole game was tuned against.
 * The push-out math below mirrors that function line for line, including its
 * degenerate "centre exactly inside the box" branch.
 *
 * VERTICAL GATING (the one thing legacy could not do)
 * The legacy controller pinned the character to y=0, so every box was an
 * infinitely tall wall. Now that the character has a Y axis, a box whose top is
 * at or below the feet is a *floor* to stand on, and a box entirely above the
 * head is overhead clearance — neither is a wall. We therefore skip any box that
 * does not vertically overlap the capsule's span `[feet, feet+height]`. On flat
 * ground with feet at y=0 and boxes spanning `[0, h]` this gate always passes,
 * so legacy parity is preserved exactly; it only changes behaviour once the
 * character is elevated, which legacy never was.
 *
 * ZERO ALLOCATION
 * `resolve()` and its per-box visitor allocate nothing. The working position,
 * radius and vertical span live in pre-allocated scratch fields, and the visitor
 * itself is a single arrow bound once at construction — not a closure minted per
 * frame or per box.
 */
export class CollisionSolver {
  private readonly config: IResolvedCharacterConfig
  private readonly collider: CapsuleCollider

  // --- Per-frame scratch (mutated in place, never reallocated) -------------

  /** Working XZ position, seeded from `state.position` and pushed out in place. */
  private _x = 0
  private _z = 0
  /** Circle radius for the current resolve pass. */
  private _r = 0
  /** Capsule vertical span for the current frame, for the overlap gate. */
  private _feetY = 0
  private _headY = 0
  /** Set true by the visitor whenever it displaced the circle this pass, so the
   *  iteration loop knows whether another slide pass is worth running. */
  private _passMoved = false

  constructor(config: IResolvedCharacterConfig, collider: CapsuleCollider) {
    this.config = config
    this.collider = collider
  }

  /**
   * Resolve the just-integrated position against the world.
   *
   * Runs up to `collision.maxSlideIterations` depenetration passes. Each pass
   * visits every box once and pushes the circle out of any it overlaps; pushing
   * clear of one box can shove the circle into a neighbour (the classic inside
   * corner), which is exactly why more than one pass exists. The loop stops
   * early the moment a pass moves nothing — the common case is zero or one pass.
   *
   * STALL DETECTION (legacy parity)
   * After resolution, compare how far the character actually travelled in XZ
   * this frame against how far it *intended* to (its horizontal speed times dt).
   * If it kept less than `collision.stallThreshold` of that intent, it is
   * grinding into a wall it cannot pass, so we scale its horizontal velocity by
   * `collision.stallVelocityRetention` and report the stall. This mirrors the
   * old controller's `moved < speed*dt*0.3  =>  vx,vz *= 0.2` check verbatim.
   *
   * The pre-integration position comes from `state.previousPosition`, which the
   * controller snapshotted in `beginFrame()` before any solver ran — so
   * "movedThisFrame" measures the whole frame's net XZ displacement, integration
   * and collision combined.
   *
   * Zero allocation.
   *
   * @param state The live character record. Only XZ of position (always) and
   *              velocity (on a stall) are written; Y is never touched.
   * @param dt    Frame delta in seconds, already clamped to `MAX_DELTA_TIME`.
   * @returns     True if the character stalled against a wall this frame.
   */
  resolve(state: CharacterState, dt: number): boolean {
    const prevX = state.previousPosition.x
    const prevZ = state.previousPosition.z

    // Seed the scratch state for this frame.
    this._x = state.position.x
    this._z = state.position.z
    this._r = this.config.capsule.radius
    this._feetY = state.position.y
    const height = state.isCrouching
      ? this.config.capsule.crouchHeight
      : this.config.capsule.height
    this._headY = state.position.y + height

    // Depenetrate-and-reslide. `forEachBox` invokes the visitor once per world
    // box; the collider now exposes it directly, so no structural cast is
    // needed.
    const maxIterations = this.config.collision.maxSlideIterations
    for (let i = 0; i < maxIterations; i++) {
      this._passMoved = false
      this.collider.forEachBox(this.pushOutOfBox)
      if (!this._passMoved) break
    }

    // Commit the resolved XZ. Y is left exactly as the caller had it.
    state.position.x = this._x
    state.position.z = this._z

    // Stall check. `intendedMove` is the distance the current horizontal
    // velocity would have carried the character this frame.
    const movedX = this._x - prevX
    const movedZ = this._z - prevZ
    const movedThisFrame = Math.hypot(movedX, movedZ)
    const intendedMove = Math.hypot(state.velocity.x, state.velocity.z) * dt

    // Guard the "not trying to move" case: with intendedMove ~0 the character is
    // idle or being carried by external motion, not stalling, so never report.
    if (
      intendedMove > EPSILON &&
      movedThisFrame < intendedMove * this.config.collision.stallThreshold
    ) {
      const retention = this.config.collision.stallVelocityRetention
      state.velocity.x *= retention
      state.velocity.z *= retention
      return true
    }

    return false
  }

  /**
   * Push the working circle out of a single box, mirroring `collideCircle` from
   * `src/core/util.js` exactly.
   *
   * MATH
   * `(nx, nz)` is the point on the box's XZ rectangle nearest the circle centre.
   * The centre-to-nearest vector `(dx, dz)` has squared length `d²`:
   *   - `d² >= r²` — the circle clears the box, nothing to do.
   *   - `d² > 0`   — the centre is outside the rectangle; slide it straight out
   *                  along `(dx, dz)` until it rests exactly `r` from the face
   *                  (or edge/corner). This is what produces the "slide along the
   *                  wall" feel: motion parallel to the face survives untouched,
   *                  only the penetrating component is cancelled.
   *   - `d² == 0`  — the centre is *inside* the rectangle, so there is no
   *                  outward direction to normalise. Fall back to ejecting
   *                  through whichever of the four faces is closest, matching the
   *                  legacy degenerate branch precisely.
   *
   * Bound once as a field so it can be handed to `forEachBox` every frame
   * without allocating a closure. It reads and writes the `_x`/`_z` scratch in
   * place and flips `_passMoved` on any displacement.
   *
   * Zero allocation.
   */
  private readonly pushOutOfBox = (box: IAABB): void => {
    // Vertical overlap gate: ignore boxes we are standing on top of (top at or
    // below the feet) or that clear the head entirely. Only true walls remain.
    if (box.maxY <= this._feetY + EPSILON) return
    if (box.minY >= this._headY - EPSILON) return

    const r = this._r
    const x = this._x
    const z = this._z

    // Closest point on the box's XZ rectangle to the circle centre.
    const nx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x
    const nz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z
    const dx = x - nx
    const dz = z - nz
    const d2 = dx * dx + dz * dz

    if (d2 >= r * r) return

    if (d2 === 0) {
      // Centre inside the box — eject through the nearest face.
      const left = x - box.minX
      const right = box.maxX - x
      const near = z - box.minZ
      const far = box.maxZ - z
      const m = Math.min(left, right, near, far)
      if (m === left) this._x = box.minX - r
      else if (m === right) this._x = box.maxX + r
      else if (m === near) this._z = box.minZ - r
      else this._z = box.maxZ + r
    } else {
      // Centre outside — push radially clear of the nearest face/edge/corner.
      const d = Math.sqrt(d2)
      this._x = nx + (dx / d) * r
      this._z = nz + (dz / d) * r
    }

    this._passMoved = true
  }
}
