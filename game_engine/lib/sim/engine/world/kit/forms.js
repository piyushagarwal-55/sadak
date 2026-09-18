import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RADIUS } from '../../core/design.js'

// Geometry kit — the shapes that replace raw BoxGeometry for anything the
// player can get close to. Hard 90° edges are the single most obvious "this is
// a prototype" tell; a 12–50 mm fillet catches light and reads as manufactured.
// See docs/PRD-v0.2-sole-flagship.md §1.6.

// Geometry is immutable once built, so identical calls can share one instance.
const geoCache = new Map()
const cached = (key, make) => {
  let g = geoCache.get(key)
  if (!g) {
    g = make()
    geoCache.set(key, g)
  }
  return g
}

// Rounded box. Note the argument order in three's RoundedBoxGeometry is
// (w, h, d, segments, radius) — segments before radius.
export function roundedBox(w, h, d, r = RADIUS.panel, segments = 3) {
  // radius cannot exceed half the smallest dimension or the geometry inverts
  const safe = Math.max(0.001, Math.min(r, Math.min(w, h, d) / 2 - 0.0005))
  return cached(`rb:${w},${h},${d},${safe},${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, safe))
}

// Extruded flat shape with a bevelled edge — signage plates, wall panels,
// anything that should look milled rather than sliced.
export function bevelPlate(shape, depth = 0.04, bevel = 0.008) {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  })
}

// Turned profile — plinth feet, bollards, vases, pedestals. `profile` is a list
// of [x, y] pairs describing the silhouette from bottom to top.
export function lathe(profile, segments = 32) {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y))
  return new THREE.LatheGeometry(pts, segments)
}

// Rounded-top arch, extruded — storefront openings and portals.
export function arch(w, h, thickness = 0.3) {
  const hw = w / 2
  const springLine = Math.max(0.01, h - hw)
  const s = new THREE.Shape()
  s.moveTo(-hw, 0)
  s.lineTo(-hw, springLine)
  s.absarc(0, springLine, hw, Math.PI, 0, true)
  s.lineTo(hw, 0)
  s.lineTo(-hw, 0)
  return new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: false, curveSegments: 24 })
}

// Chamfered wall panel — the vertical fluting that gives a flat wall a rhythm
// of highlight and shadow instead of reading as a painted plane.
export function chamferPanel(w, h, chamfer = 0.02, depth = 0.05) {
  const hw = w / 2
  const hh = h / 2
  const c = Math.min(chamfer, hw / 2, hh / 2)
  const s = new THREE.Shape()
  s.moveTo(-hw + c, -hh)
  s.lineTo(hw - c, -hh)
  s.lineTo(hw, -hh + c)
  s.lineTo(hw, hh - c)
  s.lineTo(hw - c, hh)
  s.lineTo(-hw + c, hh)
  s.lineTo(-hw, hh - c)
  s.lineTo(-hw, -hh + c)
  s.closePath()
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
}

// A run of fluting across a wall, returned as one InstancedMesh so a whole
// feature wall costs a single draw call.
export function flutedWall(material, { width, height, fluteWidth = 0.18, depth = 0.04 }) {
  const count = Math.max(1, Math.floor(width / fluteWidth))
  const geo = chamferPanel(fluteWidth * 0.92, height, 0.012, depth)
  const inst = new THREE.InstancedMesh(geo, material, count)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    dummy.position.set(-width / 2 + fluteWidth * (i + 0.5), 0, 0)
    dummy.updateMatrix()
    inst.setMatrixAt(i, dummy.matrix)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = true
  inst.receiveShadow = true
  return inst
}

export function disposeFormCache() {
  for (const g of geoCache.values()) g.dispose()
  geoCache.clear()
}
