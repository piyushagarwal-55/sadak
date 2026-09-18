import * as THREE from 'three'

// Spatial rules for the world.
//
// Colliders alone are not a spatial model. They answer "did I hit something?"
// but never "where am I allowed to be?", so every system had to invent its own
// answer: NPC roam rectangles were hand-typed and overlapped the carriageway,
// cars integrated position with no notion of a road at all, and the player
// could be pushed into a pocket between a building's collider and the world
// bound and end up standing inside a wall.
//
// Zones is the single authority. Every zone is a rectangle tagged with a
// surface type, and each surface declares who may stand on it. Agents ask
// before they move rather than each guessing.
//
// Priority matters: zones are tested last-added-first, so a CROSSING painted
// over a ROAD wins, and a BUILDING dropped on PAVEMENT wins. Add general
// surfaces first and exceptions afterwards.

export const SURFACE = {
  ROAD: 'road',
  CROSSING: 'crossing',
  PAVEMENT: 'pavement',
  PLAZA: 'plaza',
  LAWN: 'lawn',
  PLAY: 'play',
  BUILDING: 'building',
  WATER: 'water',
}

// Who may occupy each surface. This table IS the rule set — everything else
// in the file is lookup machinery.
const RULES = {
  [SURFACE.ROAD]: { pedestrian: false, vehicle: true },
  [SURFACE.CROSSING]: { pedestrian: true, vehicle: true },
  [SURFACE.PAVEMENT]: { pedestrian: true, vehicle: false },
  [SURFACE.PLAZA]: { pedestrian: true, vehicle: false },
  [SURFACE.LAWN]: { pedestrian: true, vehicle: false },
  [SURFACE.PLAY]: { pedestrian: true, vehicle: false },
  [SURFACE.BUILDING]: { pedestrian: false, vehicle: false },
  [SURFACE.WATER]: { pedestrian: false, vehicle: false },
}

const SURFACE_COLOR = {
  [SURFACE.ROAD]: '#4B5563',
  [SURFACE.CROSSING]: '#FBBF24',
  [SURFACE.PAVEMENT]: '#38BDF8',
  [SURFACE.PLAZA]: '#A78BFA',
  [SURFACE.LAWN]: '#4ADE80',
  [SURFACE.PLAY]: '#F472B6',
  [SURFACE.BUILDING]: '#EF4444',
  [SURFACE.WATER]: '#22D3EE',
}

export class Zones {
  constructor({ fallback = SURFACE.PLAZA } = {}) {
    this.rects = []
    // Surface assumed outside every declared zone. Somewhere has to be legal
    // by default or an agent that drifts off the map can never get back.
    this.fallback = fallback
    this.debugGroup = null
  }

  // minX/maxX/minZ/maxZ are inclusive bounds in world space.
  add(surface, minX, maxX, minZ, maxZ, meta = {}) {
    this.rects.push({
      surface,
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
      ...meta,
    })
    return this
  }

  // Convenience for a centred rect, which is how most of the world is authored.
  addAt(surface, x, z, w, d, meta = {}) {
    return this.add(surface, x - w / 2, x + w / 2, z - d / 2, z + d / 2, meta)
  }

  zoneAt(x, z) {
    // last added wins — exceptions are painted over general surfaces
    for (let i = this.rects.length - 1; i >= 0; i--) {
      const r = this.rects[i]
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r
    }
    return null
  }

  surfaceAt(x, z) {
    return this.zoneAt(x, z)?.surface ?? this.fallback
  }

  allows(kind, x, z) {
    const rule = RULES[this.surfaceAt(x, z)]
    return rule ? rule[kind] === true : true
  }

  // Resolve an attempted move. Returns the position the agent may actually
  // occupy: the target if it is legal, otherwise the furthest legal point.
  //
  // Axis separation is what makes this feel right rather than sticky — sliding
  // along a kerb should still let you walk parallel to it. Blocking the whole
  // move because one axis is illegal is what makes an agent appear to snag on
  // nothing.
  resolve(kind, fromX, fromZ, toX, toZ) {
    if (this.allows(kind, toX, toZ)) return [toX, toZ]
    if (this.allows(kind, toX, fromZ)) return [toX, fromZ]
    if (this.allows(kind, fromX, toZ)) return [fromX, toZ]
    return [fromX, fromZ]
  }

  // Nearest legal standing point, searched outward in rings. Used to rescue an
  // agent that has somehow ended up somewhere illegal — spawned inside a
  // building footprint, or pushed there by a collider.
  nearestLegal(kind, x, z, maxRadius = 14) {
    if (this.allows(kind, x, z)) return [x, z]
    for (let r = 0.5; r <= maxRadius; r += 0.5) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        const nx = x + Math.cos(a) * r
        const nz = z + Math.sin(a) * r
        if (this.allows(kind, nx, nz)) return [nx, nz]
      }
    }
    return [x, z]
  }

  // Is this rectangle free of the given surface? Used when scattering props so
  // a bench never lands in the carriageway.
  isClear(surface, minX, maxX, minZ, maxZ) {
    for (const r of this.rects) {
      if (r.surface !== surface) continue
      if (minX <= r.maxX && maxX >= r.minX && minZ <= r.maxZ && maxZ >= r.minZ) return false
    }
    return true
  }

  // ---- debug overlay (F6) ----
  // Rules you cannot see are rules you cannot verify. This draws every zone as
  // a translucent colour-coded slab just above the ground.
  buildDebug() {
    if (this.debugGroup) return this.debugGroup
    const g = new THREE.Group()
    const geo = new THREE.PlaneGeometry(1, 1)
    for (const r of this.rects) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: SURFACE_COLOR[r.surface] ?? '#FFFFFF',
          transparent: true,
          opacity: r.surface === SURFACE.BUILDING ? 0.34 : 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      )
      m.rotation.x = -Math.PI / 2
      m.position.set((r.minX + r.maxX) / 2, 0.06, (r.minZ + r.maxZ) / 2)
      m.scale.set(r.maxX - r.minX, r.maxZ - r.minZ, 1)
      g.add(m)
    }
    g.visible = false
    this.debugGroup = g
    return g
  }

  toggleDebug() {
    if (!this.debugGroup) return false
    this.debugGroup.visible = !this.debugGroup.visible
    return this.debugGroup.visible
  }
}
