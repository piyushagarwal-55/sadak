import type { IResolvedCharacterConfig } from '../core/CharacterConfig'
import type { CharacterState } from '../core/CharacterState'
import type { CharacterEvents } from '../core/CharacterEvents'
import type { IMovementIntent } from './MovementIntent'

/**
 * POUNCE Engine — JumpController
 *
 * Owns the vertical impulse and nothing else. It reads intent and the timers
 * `CharacterState` already carries, and its only write to the world is a single
 * assignment to `velocity.y` on the frame a jump fires. It never touches
 * horizontal velocity, never integrates gravity (that is the gravity solver's
 * job downstream), and never moves the capsule — it decides *when* to launch
 * and sets the launch speed, full stop.
 *
 * THE TWO FORGIVENESS WINDOWS
 * A jump that only fires on the exact frame the character is grounded and the
 * key goes down feels broken to a human, because human timing is never
 * frame-perfect. Every platformer that feels good cheats in the player's favour
 * with two small grace windows:
 *
 *   • COYOTE TIME — named for the cartoon coyote who keeps running a beat after
 *     the cliff ends. When the character walks off a ledge we do not zero their
 *     jump eligibility immediately; instead `coyoteTimer` is topped up to
 *     `jump.coyoteTime` every frame they are grounded and left to decay once
 *     they are airborne. So for a few frames after the ground vanishes a jump
 *     still fires, and a player who pressed jump "just too late" gets the jump
 *     they clearly meant.
 *
 *   • JUMP BUFFERING — the mirror image. When the player presses jump slightly
 *     *before* touching down — landing from a previous hop, say — we remember
 *     the press in `jumpBufferTimer` for `jump.bufferTime` seconds. The instant
 *     coyote time is valid again (i.e. they land) the buffered press is spent
 *     and the jump fires, so a player who pressed jump "just too early" also
 *     gets the jump they meant.
 *
 * Together the two windows mean the legal jump interval is widened at both ends:
 * `[press − bufferTime, groundLeft + coyoteTime]`. A `jumpCooldownTimer` then
 * enforces a minimum gap between launches so a held key cannot machine-gun
 * jumps on landing.
 *
 * TIMER OWNERSHIP
 * The three timers live on `CharacterState` because other systems read them
 * (animation blends off `coyoteTimer`, audio off the cooldown). This controller
 * is their sole writer: it decrements them, refills coyote time while grounded,
 * seeds the buffer on the input edge, and clears them on launch.
 *
 * ZERO ALLOCATION
 * `update()` allocates nothing — it only reads/writes numbers already on the
 * state and config. The single mutable field this class carries,
 * `previousWantsToJump`, is a primitive set at construction.
 */
export class JumpController {
  private readonly config: IResolvedCharacterConfig
  private readonly events: CharacterEvents | undefined

  /**
   * `intent.wantsToJump` from last frame. Intent exposes the key as a *level*
   * (held = true every frame), so we detect the rising edge ourselves here:
   * a jump is requested only on the frame the key transitions false → true.
   * Detecting the edge is what stops a held key from re-seeding the buffer every
   * frame and defeating the cooldown.
   */
  private previousWantsToJump = false

  /**
   * @param config Resolved config. `derived.jumpVelocity` is the pre-solved
   *               launch speed that reaches `jump.height` under gravity, and the
   *               `jump` group supplies the three window durations.
   * @param events Optional notification channel. `'jump'` is emitted on launch
   *               for audio/particles; passing nothing disables notification.
   */
  constructor(config: IResolvedCharacterConfig, events?: CharacterEvents) {
    this.config = config
    this.events = events
  }

  /**
   * Advance the jump machine by one frame.
   *
   * Order matters and is deliberate:
   *   1. Age all three timers, clamped at zero — they are countdowns, never
   *      negative.
   *   2. Refill coyote time while grounded, so it only ever *decays* once the
   *      character is airborne (step 1 already did that decay this frame).
   *   3. Seed the buffer on the rising edge of the jump key.
   *   4. If a buffered press, a live coyote window and a clear cooldown all
   *      coincide, launch.
   *
   * @param state  The live character record. Read for grounded status and the
   *               timers; written only to fire the jump.
   * @param intent Read-only intent for this frame. Only `wantsToJump` is used.
   * @param dt     Frame delta in seconds. Assumed already clamped to
   *               `MAX_DELTA_TIME` by the controller.
   *
   * Zero allocation.
   */
  update(state: CharacterState, intent: Readonly<IMovementIntent>, dt: number): void {
    const jump = this.config.jump

    // --- 1. Age the countdowns, flooring at zero ---------------------------
    // Subtracting dt and clamping is the whole lifetime of a forgiveness window:
    // once it hits zero the grace it represented has expired.
    if (state.coyoteTimer > 0) {
      state.coyoteTimer = Math.max(0, state.coyoteTimer - dt)
    }
    if (state.jumpBufferTimer > 0) {
      state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt)
    }
    if (state.jumpCooldownTimer > 0) {
      state.jumpCooldownTimer = Math.max(0, state.jumpCooldownTimer - dt)
    }

    // --- 2. Refill coyote time while grounded ------------------------------
    // Topping up to the full window every grounded frame means the timer reads
    // `coyoteTime` at the moment of takeoff and only begins its real decay (via
    // step 1 on subsequent airborne frames) once the ground is gone. That is
    // what keeps a jump legal for a beat after walking off a ledge.
    if (state.isGrounded) {
      state.coyoteTimer = jump.coyoteTime
    }

    // --- 3. Seed the buffer on the rising edge of the jump key -------------
    // Intent hands us a level, not an edge, so we compare against last frame.
    // Remembering the press for `bufferTime` lets a jump pressed a few frames
    // early still fire the instant the character is eligible.
    const risingEdge = intent.wantsToJump && !this.previousWantsToJump
    this.previousWantsToJump = intent.wantsToJump
    if (risingEdge) {
      state.jumpBufferTimer = jump.bufferTime
    }

    // --- 4. Launch when both windows overlap and the cooldown is clear -----
    // buffer > 0  : the player has pressed jump recently enough.
    // coyote > 0  : the character is grounded, or was grounded recently enough.
    // cooldown ==0: enough time has passed since the last launch.
    const canJump =
      state.jumpBufferTimer > 0 && state.coyoteTimer > 0 && state.jumpCooldownTimer <= 0

    if (canJump) {
      // The only mutation of world motion this file performs: set the vertical
      // launch speed. Horizontal velocity is left untouched, so a running jump
      // keeps its ground momentum for the gravity/integration stages downstream.
      state.velocity.y = this.config.derived.jumpVelocity

      // Open the cooldown and spend both forgiveness windows so this press can
      // fire exactly one jump — no double-launch from the same buffered input,
      // no second jump from lingering coyote time.
      state.jumpCooldownTimer = jump.cooldown
      state.jumpBufferTimer = 0
      state.coyoteTimer = 0

      this.events?.emit('jump', undefined)
    }
  }

  /**
   * Clear the one bit of frame-to-frame memory this controller owns. Call from
   * `MovementController.teleport()`/respawn alongside `CharacterState.reset()`,
   * which zeroes the timers themselves — together they guarantee no press held
   * across a world transition survives to fire a phantom jump on arrival.
   */
  reset(): void {
    this.previousWantsToJump = false
  }
}
