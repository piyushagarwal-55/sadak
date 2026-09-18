import {
  DEFAULT_CHARACTER_CONFIG,
  cosMaxSlopeFor,
  groundProbeLengthFor,
  groundProbeRadiusFor,
  jumpVelocityFor,
} from './CharacterConstants'
import type { ICharacterConfig } from './CharacterConstants'

/**
 * POUNCE Engine — CharacterConfig
 *
 * The instance layer over `CharacterConstants`.
 *
 * `CharacterConstants` holds the frozen defaults — one canonical set of
 * numbers for the whole engine. This file turns those defaults plus a sparse
 * set of per-character overrides into a single resolved, frozen config, and
 * precomputes the derived values every solver would otherwise recalculate.
 *
 * A pedestrian, a sprinting teenager and a shop assistant are three configs,
 * not three code paths.
 */

/** Recursive partial, for sparse override objects. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** Sparse overrides layered onto the defaults. */
export type CharacterConfigOverrides = DeepPartial<ICharacterConfig>

/**
 * Values computed once from a config so no solver has to recompute them.
 *
 * Every field here is something that would otherwise appear inside a per-frame
 * `Math.cos`, `Math.sqrt` or division. Precomputing them is the difference
 * between the ground sweep costing two trig calls a frame and costing none.
 */
export interface IDerivedConfig {
  /** Initial upward velocity that reaches `jump.height`. */
  readonly jumpVelocity: number
  /** `cos(ground.maxSlopeAngle)`, for dot-product slope tests. */
  readonly cosMaxSlope: number
  /** Radius of the downward ground probe sphere. */
  readonly groundProbeRadius: number
  /** Total length of the downward ground sweep. */
  readonly groundProbeLength: number
  /** Half of the standing capsule height, the offset from feet to centre. */
  readonly halfHeight: number
  /** Centre height of the capsule's lower sphere, measured from the feet. */
  readonly lowerSphereOffset: number
}

/** A resolved character config: the merged values plus their derivations. */
export interface IResolvedCharacterConfig extends ICharacterConfig {
  readonly derived: IDerivedConfig
}

/**
 * Merge one level of overrides onto a frozen default group.
 *
 * Only the eight known groups are merged, and only one level deep, because the
 * config tree is exactly two levels deep by design. A general recursive merge
 * would be slower, harder to type, and would silently accept typo'd keys.
 */
function mergeGroup<T extends object>(base: T, override: DeepPartial<T> | undefined): T {
  if (!override) return base
  const out = { ...base } as Record<string, unknown>
  for (const key of Object.keys(override) as (keyof T)[]) {
    const v = override[key]
    if (v !== undefined) out[key as string] = v
  }
  return Object.freeze(out) as T
}

/**
 * Build a resolved config from sparse overrides.
 *
 * Call this once per character, at construction. The result is frozen, so
 * solvers can hold a reference without defensive copying, and any attempt to
 * retune at runtime throws instead of silently desyncing the derived values.
 *
 * @example
 *   // A shop assistant who never sprints and turns more deliberately.
 *   const cfg = createCharacterConfig({
 *     speed: { sprint: 6.4 },
 *     rotation: { maxTurnRate: 8 },
 *   })
 */
export function createCharacterConfig(
  overrides: CharacterConfigOverrides = {},
): IResolvedCharacterConfig {
  const base = DEFAULT_CHARACTER_CONFIG

  const speed = mergeGroup(base.speed, overrides.speed)
  const acceleration = mergeGroup(base.acceleration, overrides.acceleration)
  const rotation = mergeGroup(base.rotation, overrides.rotation)
  const gravity = mergeGroup(base.gravity, overrides.gravity)
  const jump = mergeGroup(base.jump, overrides.jump)
  const capsule = mergeGroup(base.capsule, overrides.capsule)
  const ground = mergeGroup(base.ground, overrides.ground)
  const collision = mergeGroup(base.collision, overrides.collision)

  const derived: IDerivedConfig = Object.freeze({
    jumpVelocity: jumpVelocityFor(jump.height, gravity.acceleration),
    cosMaxSlope: cosMaxSlopeFor(ground.maxSlopeAngle),
    groundProbeRadius: groundProbeRadiusFor(capsule),
    groundProbeLength: groundProbeLengthFor(ground),
    halfHeight: capsule.height * 0.5,
    lowerSphereOffset: capsule.radius,
  })

  return Object.freeze({
    speed,
    acceleration,
    rotation,
    gravity,
    jump,
    capsule,
    ground,
    collision,
    derived,
  })
}

/**
 * The resolved stock config. Most characters can share this instance — it is
 * frozen, stateless, and read-only to every consumer.
 */
export const DEFAULT_RESOLVED_CONFIG: IResolvedCharacterConfig = createCharacterConfig()
