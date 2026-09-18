/**
 * POUNCE Engine — SurfaceMaterial
 *
 * The registry that gives `IGroundState.surfaceMaterialId` its meaning.
 *
 * Passive data plus a lookup. Nothing here reads the world or the character —
 * it answers "given that the character is standing on material 3, what is the
 * friction, and which footstep bank should play?" and nothing else.
 *
 * Ids are small integers rather than strings so `IGroundState` stays a
 * primitive-only struct that can be copied without allocating.
 */

/** Fallback used whenever geometry carries no explicit material. */
export const DEFAULT_MATERIAL_ID = 0

/** One surface definition. */
export interface ISurfaceMaterial {
  readonly id: number
  /** Human-readable name, for debug overlays. */
  readonly name: string
  /**
   * Friction multiplier applied to braking deceleration. 1.0 is the tuned
   * baseline; below 1 is slippery, above 1 is grippy. Consumed by
   * `FrictionSolver`.
   */
  readonly friction: number
  /** Footstep sample bank key, resolved by `audio/SurfaceAudio.ts`. */
  readonly footstepBank: string
  /** Whether footfalls leave a decal, for `effects/Footprints.ts`. */
  readonly leavesFootprints: boolean
  /** Whether footfalls kick up particles, for `effects/Dust.ts`. */
  readonly raisesDust: boolean
}

/**
 * The stock POUNCE surface set. Ids are stable — persisted world data may
 * reference them, so append rather than renumber.
 */
export const SURFACE_MATERIALS: readonly ISurfaceMaterial[] = Object.freeze([
  Object.freeze({ id: 0, name: 'concrete', friction: 1.0, footstepBank: 'concrete', leavesFootprints: false, raisesDust: true }),
  Object.freeze({ id: 1, name: 'tile', friction: 0.92, footstepBank: 'tile', leavesFootprints: false, raisesDust: false }),
  Object.freeze({ id: 2, name: 'carpet', friction: 1.15, footstepBank: 'carpet', leavesFootprints: false, raisesDust: false }),
  Object.freeze({ id: 3, name: 'wood', friction: 1.0, footstepBank: 'wood', leavesFootprints: false, raisesDust: false }),
  Object.freeze({ id: 4, name: 'grass', friction: 1.05, footstepBank: 'grass', leavesFootprints: true, raisesDust: false }),
  Object.freeze({ id: 5, name: 'gravel', friction: 0.95, footstepBank: 'gravel', leavesFootprints: true, raisesDust: true }),
  Object.freeze({ id: 6, name: 'metal', friction: 0.9, footstepBank: 'metal', leavesFootprints: false, raisesDust: false }),
  Object.freeze({ id: 7, name: 'water', friction: 0.7, footstepBank: 'water', leavesFootprints: false, raisesDust: false }),
])

/**
 * Dense lookup array, indexed by id. Built once at module load so the hot path
 * is an array index rather than a find() or a Map hash.
 */
const BY_ID: readonly ISurfaceMaterial[] = (() => {
  let maxId = 0
  for (const m of SURFACE_MATERIALS) if (m.id > maxId) maxId = m.id
  const fallback = SURFACE_MATERIALS[DEFAULT_MATERIAL_ID] as ISurfaceMaterial
  const table: ISurfaceMaterial[] = new Array(maxId + 1).fill(fallback)
  for (const m of SURFACE_MATERIALS) table[m.id] = m
  return table
})()

/**
 * Resolve a material id. Out-of-range ids fall back to the default rather than
 * returning undefined — a bad id in world data should produce plain concrete
 * footsteps, not a crash in the audio system.
 *
 * Zero allocation.
 */
export function getSurfaceMaterial(id: number): ISurfaceMaterial {
  return BY_ID[id] ?? (SURFACE_MATERIALS[DEFAULT_MATERIAL_ID] as ISurfaceMaterial)
}

/** Friction multiplier for a material id. Hot path — used every braking frame. */
export function getSurfaceFriction(id: number): number {
  return getSurfaceMaterial(id).friction
}
