import * as THREE from 'three'
import { EPSILON } from '../core/CharacterConstants'
import { DEFAULT_MATERIAL_ID } from './SurfaceMaterial'

/**
 * POUNCE Engine — CapsuleCollider
 *
 * The collision substrate every solver queries. It owns the world's collision
 * geometry and answers swept-volume questions about it; it never moves anything
 * and holds no character state.
 *
 * WHY THIS EXISTS
 * The spec for `GroundSolver` assumes "an Octree, BVH, or physics scene" is
 * already available. POUNCE has none — `world/BaseWorld.js` exposes a flat
 * list of XZ rectangles whose `h` field was only ever read by the camera
 * occlusion probe. This file promotes those rectangles into real 3D AABBs and
 * provides the sweep queries the physics layer needs.
 *
 * BROADPHASE
 * Deliberately a linear scan. A POUNCE world holds on the order of 100
 * colliders and the character issues a handful of casts per frame, so a tree
 * would cost more to maintain than it saves. `setColliders()` is the only
 * place that would need to change to swap in a BVH later.
 */

/** An axis-aligned box in world space, with the material of its top surface. */
export interface IAABB {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  /** Surface lookup id for the top face. Drives footstep audio and effects. */
  materialId: number
}

/** The result of a sweep or ray query. Reused across calls — never retained. */
export interface ISweepHit {
  /** Distance travelled along the cast direction before contact, in metres. */
  distance: number
  /** World-space point of contact on the surface. */
  point: THREE.Vector3
  /** Unit surface normal at the contact. */
  normal: THREE.Vector3
  /** Material of the surface that was hit. */
  materialId: number
}

/** Allocate a hit record. Call once, at construction — never per query. */
export function createSweepHit(): ISweepHit {
  return {
    distance: Infinity,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    materialId: DEFAULT_MATERIAL_ID,
  }
}

/** The shape of a legacy collider from `world/BaseWorld.js`. */
export interface ILegacyCollider {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  h?: number
}

export class CapsuleCollider {
  /** World collision boxes. Rebuilt on every world transition. */
  private readonly boxes: IAABB[] = []

  /**
   * Height of the implicit infinite ground plane, or `null` for none.
   * POUNCE worlds are floored at y=0; interiors that sit on a raised slab
   * can move this without adding a giant box.
   */
  private groundPlaneY: number | null = 0

  /** Material reported for the implicit ground plane. */
  private groundPlaneMaterialId: number = DEFAULT_MATERIAL_ID

  // -------------------------------------------------------------------------
  // Geometry ingestion
  // -------------------------------------------------------------------------

  /**
   * Replace the collision set from a world's legacy collider list.
   *
   * The legacy format is an XZ rectangle plus a height `h`, with an implied
   * base at y=0. That assumption is preserved here: every box spans
   * `[0, h]` vertically. Once world geometry carries real vertical extents,
   * this adapter is the single place that needs to change.
   */
  setColliders(colliders: readonly ILegacyCollider[], materialId = DEFAULT_MATERIAL_ID): void {
    this.boxes.length = 0
    for (const c of colliders) {
      this.boxes.push({
        minX: c.minX,
        maxX: c.maxX,
        minY: 0,
        maxY: c.h ?? 3,
        minZ: c.minZ,
        maxZ: c.maxZ,
        materialId,
      })
    }
  }

  /** Add one box directly, for geometry that already knows its vertical span. */
  addBox(box: IAABB): void {
    this.boxes.push(box)
  }

  /** Configure the implicit floor. Pass `null` to remove it entirely. */
  setGroundPlane(y: number | null, materialId = DEFAULT_MATERIAL_ID): void {
    this.groundPlaneY = y
    this.groundPlaneMaterialId = materialId
  }

  /** Number of boxes currently loaded. Diagnostics only. */
  get boxCount(): number {
    return this.boxes.length
  }

  /**
   * Visit every collision box in insertion order.
   *
   * The XZ push-out in `CollisionSolver` needs to test the capsule against each
   * box directly rather than through a sweep, so it iterates here. `visit`
   * receives the live box — treat it as read-only; mutating it corrupts the
   * collision set. Zero allocation: no array copy, no closure created per call.
   */
  forEachBox(visit: (box: IAABB) => void): void {
    for (const b of this.boxes) visit(b)
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * Sweep a sphere straight down and report the first surface it lands on.
   *
   * MATH
   * Because the cast is purely vertical, the sphere's XZ footprint is constant,
   * which collapses the general (and fiddly) rounded-box raycast into a closed
   * form. For a box with top face at `maxY`:
   *
   *   q  = the point on the box's XZ rectangle closest to the sphere's centre
   *   d² = squared XZ distance from the centre to q
   *
   * If `d² >= r²` the sphere's vertical column misses the box entirely. Contact
   * otherwise occurs when the centre sits at
   *
   *   y = maxY + sqrt(r² - d²)
   *
   * which is exact for all three regions at once: directly over the face
   * (d²=0, so y = maxY + r), over an edge, and over a corner. That single
   * expression is what keeps the character from sinking into box corners —
   * the naive "is my centre inside the rectangle" test pops by up to a full
   * radius at every edge.
   *
   * Only downward-facing contact with the TOP of a box registers. A sphere
   * brushing the side of a wall as it falls is not standing on anything, and
   * reporting it as ground is what makes characters stick to walls mid-fall.
   *
   * @param cx,cy,cz    Sphere centre at the start of the sweep.
   * @param radius      Sphere radius.
   * @param maxDistance Maximum downward travel.
   * @param out         Hit record to fill. Only written when this returns true.
   * @returns           True if a surface was found within `maxDistance`.
   *
   * Zero allocation.
   */
  sphereCastDown(
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    maxDistance: number,
    out: ISweepHit,
  ): boolean {
    const r2 = radius * radius
    let bestDistance = Infinity
    let bestTopY = 0
    let bestMaterial = DEFAULT_MATERIAL_ID
    let bestQx = cx
    let bestQz = cz
    let bestOnFace = true
    let found = false

    for (const b of this.boxes) {
      // Closest point on the box's XZ rectangle to the sphere's centre.
      const qx = cx < b.minX ? b.minX : cx > b.maxX ? b.maxX : cx
      const qz = cz < b.minZ ? b.minZ : cz > b.maxZ ? b.maxZ : cz
      const dx = cx - qx
      const dz = cz - qz
      const d2 = dx * dx + dz * dz

      // The sphere's vertical column does not overlap this box at all.
      if (d2 >= r2) continue

      // Centre height at the moment of contact with the top face.
      const contactCentreY = b.maxY + Math.sqrt(r2 - d2)

      // Distance fallen to reach that height. Negative means the sphere already
      // starts at or below the contact height — treat as an immediate contact
      // rather than letting it sweep through from inside the geometry.
      const distance = cy - contactCentreY
      if (distance > maxDistance) continue
      if (distance < 0) {
        // Already penetrating. Only accept if the sphere's centre is still
        // above the top face, otherwise it is inside the box from the side and
        // the ground solver is not the system that should resolve it.
        if (cy < b.maxY) continue
      }

      const clamped = distance < 0 ? 0 : distance
      if (clamped < bestDistance) {
        bestDistance = clamped
        bestTopY = b.maxY
        bestMaterial = b.materialId
        bestQx = qx
        bestQz = qz
        bestOnFace = d2 < EPSILON
        found = true
      }
    }

    // Implicit ground plane. Flat, infinite, always faces up.
    if (this.groundPlaneY !== null) {
      const contactCentreY = this.groundPlaneY + radius
      const distance = cy - contactCentreY
      if (distance <= maxDistance) {
        const clamped = distance < 0 ? 0 : distance
        if (clamped < bestDistance) {
          bestDistance = clamped
          bestTopY = this.groundPlaneY
          bestMaterial = this.groundPlaneMaterialId
          bestQx = cx
          bestQz = cz
          bestOnFace = true
          found = true
        }
      }
    }

    if (!found) return false

    out.distance = bestDistance
    out.point.set(bestQx, bestTopY, bestQz)
    out.materialId = bestMaterial
    // Box tops are flat, so the surface normal is world-up. The rounded normal
    // at an edge belongs to the sphere, not the surface, and using it would
    // make the character slide off every kerb. Ledge behaviour is decided by
    // GroundSolver's centre-of-mass test instead.
    out.normal.set(0, 1, 0)
    // `bestOnFace` is intentionally unused for the normal; kept for clarity at
    // the call site that the distinction was considered.
    void bestOnFace
    return true
  }

  /**
   * Cast an infinitely thin ray straight down. Used for the centre-of-mass
   * check that distinguishes standing on a ledge from teetering off it.
   *
   * Zero allocation.
   */
  rayCastDown(x: number, y: number, z: number, maxDistance: number, out: ISweepHit): boolean {
    let bestDistance = Infinity
    let bestTopY = 0
    let bestMaterial = DEFAULT_MATERIAL_ID
    let found = false

    for (const b of this.boxes) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
      const distance = y - b.maxY
      if (distance < 0 || distance > maxDistance) continue
      if (distance < bestDistance) {
        bestDistance = distance
        bestTopY = b.maxY
        bestMaterial = b.materialId
        found = true
      }
    }

    if (this.groundPlaneY !== null) {
      const distance = y - this.groundPlaneY
      if (distance >= 0 && distance <= maxDistance && distance < bestDistance) {
        bestDistance = distance
        bestTopY = this.groundPlaneY
        bestMaterial = this.groundPlaneMaterialId
        found = true
      }
    }

    if (!found) return false
    out.distance = bestDistance
    out.point.set(x, bestTopY, z)
    out.normal.set(0, 1, 0)
    out.materialId = bestMaterial
    return true
  }
}
