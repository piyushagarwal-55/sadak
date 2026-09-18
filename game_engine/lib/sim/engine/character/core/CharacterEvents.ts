/**
 * POUNCE Engine — CharacterEvents
 *
 * The one-way notification channel out of the character pipeline.
 *
 * Data flows strictly downward through the solvers; this is how the systems
 * hanging off the side — audio, particles, UI, analytics — hear about what
 * happened without any solver acquiring a reference to them. A solver emits;
 * it never knows or cares who listened.
 *
 * Emitting must not allocate, because footstep and contact events fire inside
 * the frame budget. The payload objects below are therefore owned and reused
 * by the emitter: a listener may read a payload, but must copy anything it
 * intends to keep past the end of its own callback.
 */

/** Fired when the character touches down after being airborne. */
export interface ILandEvent {
  /** Downward speed at the moment of contact, m/s, positive. */
  impactSpeed: number
  /** How long the character was airborne, in seconds. */
  airTime: number
  /** Material landed on. */
  surfaceMaterialId: number
}

/** Fired once per planted foot, from an animation event rather than a timer. */
export interface IFootstepEvent {
  /** 0 = left, 1 = right. */
  foot: number
  /** Material underfoot. */
  surfaceMaterialId: number
  /** Horizontal speed at the moment of the footfall, for volume scaling. */
  speed: number
}

/** Fired when the collision solver stops horizontal motion against geometry. */
export interface IWallImpactEvent {
  /** Horizontal speed lost to the impact, m/s. */
  impactSpeed: number
  normalX: number
  normalZ: number
}

/** Fired on every locomotion state change. */
export interface IStateChangeEvent {
  from: string
  to: string
}

/** The event map. Adding an event here makes it type-safe everywhere. */
export interface ICharacterEventMap {
  jump: void
  land: ILandEvent
  footstep: IFootstepEvent
  wallImpact: IWallImpactEvent
  stateChange: IStateChangeEvent
  teleport: void
}

export type CharacterEventName = keyof ICharacterEventMap

type Listener<K extends CharacterEventName> = (payload: ICharacterEventMap[K]) => void

/**
 * A small typed emitter, scoped to one character.
 *
 * Deliberately not a generic pub/sub: the closed event map means a typo in an
 * event name is a compile error, and the listener signature is inferred from
 * the name at every call site.
 */
export class CharacterEvents {
  private readonly listeners = new Map<CharacterEventName, Listener<CharacterEventName>[]>()

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends CharacterEventName>(event: K, listener: Listener<K>): () => void {
    let list = this.listeners.get(event)
    if (!list) {
      list = []
      this.listeners.set(event, list)
    }
    list.push(listener as Listener<CharacterEventName>)
    return () => this.off(event, listener)
  }

  /** Unsubscribe a previously registered listener. */
  off<K extends CharacterEventName>(event: K, listener: Listener<K>): void {
    const list = this.listeners.get(event)
    if (!list) return
    const i = list.indexOf(listener as Listener<CharacterEventName>)
    if (i >= 0) list.splice(i, 1)
  }

  /**
   * Notify every listener.
   *
   * Iterates by index over the live array rather than copying it, so emitting
   * costs nothing. The trade-off is that unsubscribing from inside a handler
   * can skip the next listener — acceptable here because character events are
   * consumed by long-lived systems that subscribe once at construction.
   */
  emit<K extends CharacterEventName>(event: K, payload: ICharacterEventMap[K]): void {
    const list = this.listeners.get(event)
    if (!list) return
    for (let i = 0; i < list.length; i++) {
      const fn = list[i]
      if (fn) (fn as Listener<K>)(payload)
    }
  }

  /** Drop every listener. Called when a character is destroyed. */
  clear(): void {
    this.listeners.clear()
  }
}
