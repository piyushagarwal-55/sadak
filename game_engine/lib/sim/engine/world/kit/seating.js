import * as THREE from 'three'
import { mergeSafe } from '../../core/util.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Outdoor seating kit for the plaza. Everything here follows the same rule as
// street.js's bench(): build the piece out of dozens of small slats and rails,
// then merge by material so it ships as two or three draw calls instead of
// twenty. Seat height stays in the 0.44–0.46 m band used across the kit, so a
// player standing beside any of these reads at the right scale.
//
// Plain BoxGeometry for every slat — roundedBox costs ~1,700 verts and a 4 cm
// slat shows no visible fillet, so the radius is pure waste at this thickness.

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, ...o })

// Shared at module scope: a plaza carries a dozen of these and there is no
// reason for each call to allocate its own copy of the same material.
const WOOD = M('#8A6242', { roughness: 0.82 })
const IRON = M('#2F4034', { roughness: 0.5, metalness: 0.5 })
// Café furniture is powder-coated rather than cast, so it sits lighter and
// cooler than the park iron — it should not read as the same object family.
const CAFE_METAL = M('#44514E', { roughness: 0.42, metalness: 0.6 })
const CANOPY_A = M('#D96F3C', { roughness: 0.95, side: THREE.DoubleSide })
const CANOPY_B = M('#F0E0C8', { roughness: 0.95, side: THREE.DoubleSide })

const SEAT_Y = 0.45

// Merge a bucket of geometries into one shadowed mesh, or return null if the
// bucket is empty (umbrella-less café sets have no fabric).
function merged(parts, material) {
  if (!parts.length) return null
  const m = new THREE.Mesh(mergeSafe(parts), material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const rotY = (a) => new THREE.Matrix4().makeRotationY(a)

// ---------- tree surround ----------

// The classic plaza tree seat: a continuous ring of slatted benches facing out
// from the trunk. Backless on purpose — the tree is the backrest, and a real
// backrest would hide the trunk from every angle and wreck the silhouette.
// The ring is continuous rather than gapped; a gap reads as a broken bench from
// across the square, while a closed ring reads as one deliberate object.
//
// Two draw calls: all timber merged, all iron merged.
export function treeSeat(world, { x, z, radius = 1.5, sides = 6, rotY: yaw = 0 }) {
  const g = new THREE.Group()
  const wood = []
  const iron = []

  const n = Math.max(3, Math.round(sides))
  const depth = 0.55 // seat depth; the centre inside this is left clear for the trunk
  const rMid = radius - depth / 2
  // straight segments chorded onto the polygon, sized so neighbours meet at the corners
  const segLen = 2 * rMid * Math.tan(Math.PI / n)

  const slatW = 0.15
  const slatGap = 0.05

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    // rotY(-a) sends local +X to the outward radial and local +Z to the tangent,
    // so a segment can be authored flat and then swung into place.
    const place = rotY(-a)

    // 3 slats per segment, running tangentially. Slats not a solid plank: the
    // gaps shed rain, and from ten metres away the stripes are what say "bench".
    for (let s = 0; s < 3; s++) {
      const r = radius - depth + slatW / 2 + s * (slatW + slatGap)
      const slat = new THREE.BoxGeometry(slatW, 0.045, segLen)
      slat.translate(r, SEAT_Y, 0)
      slat.applyMatrix4(place)
      wood.push(slat)
    }

    // a support frame at each end of the segment, so corners are carried twice
    for (const sz of [-1, 1]) {
      const zOff = sz * (segLen / 2 - 0.13)
      const rail = new THREE.BoxGeometry(depth - 0.04, 0.05, 0.06)
      rail.translate(rMid, SEAT_Y - 0.03, zOff)
      rail.applyMatrix4(place)
      iron.push(rail)
      for (const lr of [-0.18, 0.18]) {
        const leg = new THREE.BoxGeometry(0.05, SEAT_Y - 0.05, 0.05)
        leg.translate(rMid + lr, (SEAT_Y - 0.05) / 2, zOff)
        leg.applyMatrix4(place)
        iron.push(leg)
      }
    }
  }

  for (const m of [merged(wood, WOOD), merged(iron, IRON)]) if (m) g.add(m)

  g.position.set(x, 0, z)
  g.rotation.y = yaw
  world.scene.add(g)
  // One square over the whole footprint. It swallows the open centre too, but
  // the trunk lives there anyway — nobody should be walking into it.
  world.addCollider(x - radius, x + radius, z - radius, z + radius, 0.5)
  return g
}

// ---------- café set ----------

// One bistro chair, authored facing -X (seat forward, back on the outward +X
// side) and then swung into place by `place`.
function chairGeos(place) {
  const parts = []

  const pan = new THREE.CylinderGeometry(0.185, 0.185, 0.035, 10)
  pan.translate(0, SEAT_Y, 0)
  parts.push(pan)

  for (const [lx, lz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
    const leg = new THREE.BoxGeometry(0.028, SEAT_Y, 0.028)
    leg.translate(lx, SEAT_Y / 2, lz)
    parts.push(leg)
  }

  // back uprights, raked outward so the chair doesn't look like a stool
  for (const uz of [-0.15, 0.15]) {
    const u = new THREE.BoxGeometry(0.028, 0.46, 0.028)
    u.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.12))
    u.translate(0.165, SEAT_Y + 0.23, uz)
    parts.push(u)
  }
  for (let i = 0; i < 2; i++) {
    const rail = new THREE.BoxGeometry(0.03, 0.05, 0.36)
    rail.applyMatrix4(new THREE.Matrix4().makeRotationZ(-0.12))
    rail.translate(0.192 + i * 0.022, SEAT_Y + 0.15 + i * 0.18, 0)
    parts.push(rail)
  }

  for (const p of parts) p.applyMatrix4(place)
  return parts
}

// Pavement café: round bistro table, chairs facing in, optional parasol.
// Two draw calls dry, three with the umbrella (the canopy needs two colours to
// get the alternating panels, so the fabric merges into two meshes).
export function cafeSet(world, { x, z, rotY: yaw = 0, chairs = 3, umbrella = false }) {
  const g = new THREE.Group()
  const metal = []
  const fabricA = []
  const fabricB = []

  const TOP_Y = 0.74
  // pedestal + weighted foot: bistro tables are never four-legged, and the
  // single column is what lets chairs tuck all the way in
  const foot = new THREE.CylinderGeometry(0.26, 0.29, 0.04, 12)
  foot.translate(0, 0.02, 0)
  metal.push(foot)
  const column = new THREE.CylinderGeometry(0.045, 0.06, TOP_Y - 0.06, 8)
  column.translate(0, (TOP_Y - 0.06) / 2 + 0.04, 0)
  metal.push(column)
  const top = new THREE.CylinderGeometry(0.31, 0.31, 0.04, 16)
  top.translate(0, TOP_Y, 0)
  metal.push(top)
  const skirt = new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10)
  skirt.translate(0, TOP_Y - 0.045, 0)
  metal.push(skirt)

  const count = Math.max(0, Math.round(chairs))
  const seatR = 0.66
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const place = new THREE.Matrix4()
      .makeTranslation(Math.cos(a) * seatR, 0, Math.sin(a) * seatR)
      .multiply(rotY(-a))
    metal.push(...chairGeos(place))
  }

  if (umbrella) {
    const POLE_H = 2.3
    const pole = new THREE.CylinderGeometry(0.035, 0.045, POLE_H, 8)
    pole.translate(0, POLE_H / 2, 0)
    metal.push(pole)
    const finial = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 8)
    finial.translate(0, POLE_H + 0.03, 0)
    metal.push(finial)

    // Canopy as 8 separate cone sectors rather than one cone, purely so the
    // panels can alternate colour — each sector is a single flat facet, which
    // is exactly the facet an 8-sided cone would have had anyway.
    const canR = 1.1
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.ConeGeometry(canR, 0.42, 1, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4)
      seg.translate(0, POLE_H - 0.28, 0)
      ;(i % 2 ? fabricB : fabricA).push(seg)
    }
  }

  for (const m of [merged(metal, CAFE_METAL), merged(fabricA, CANOPY_A), merged(fabricB, CANOPY_B)]) {
    if (m) g.add(m)
  }

  g.position.set(x, 0, z)
  g.rotation.y = yaw
  world.scene.add(g)
  // Table-and-chairs footprint only. The canopy overhangs well above head
  // height, so blocking its full 2.2 m span would feel like an invisible wall.
  const r = count ? 0.95 : 0.4
  world.addCollider(x - r, x + r, z - r, z + r, 0.8)
  return g
}

// ---------- picnic table ----------

// The standard A-frame park table: slatted top, seats hung off the same frames.
// All timber in one mesh, the visible hardware in a second — two draw calls.
export function picnicTable(world, { x, z, rotY: yaw = 0 }) {
  const g = new THREE.Group()
  const wood = []
  const iron = []

  const LEN = 1.9
  const TOP_Y = 0.75
  const frameX = 0.62 // the two A-frames sit inboard of the ends so knees clear them

  // top: 5 slats across, gapped. A single 0.68 m plank would read as a crate lid.
  for (let i = 0; i < 5; i++) {
    const s = new THREE.BoxGeometry(LEN, 0.05, 0.12)
    s.translate(0, TOP_Y, -0.28 + i * 0.14)
    wood.push(s)
  }

  // seats: two slats each side, both hung at the kit's standard seat height
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const s = new THREE.BoxGeometry(LEN, 0.045, 0.13)
      s.translate(0, SEAT_Y, side * (0.62 + i * 0.16))
      wood.push(s)
    }
  }

  for (const fx of [-frameX, frameX]) {
    // splayed legs — the splay is what stops the table tipping when everyone
    // sits on one side, and it is the whole visual signature of the type
    for (const side of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.1, 1.02, 0.09)
      leg.applyMatrix4(new THREE.Matrix4().makeRotationX(-side * 0.74))
      leg.translate(fx, TOP_Y / 2, side * 0.6)
      wood.push(leg)
    }
    // seat bearer spanning the frame, and the short beam the top slats land on
    const bearer = new THREE.BoxGeometry(0.09, 0.07, 1.95)
    bearer.translate(fx, SEAT_Y - 0.055, 0)
    wood.push(bearer)
    const spine = new THREE.BoxGeometry(0.09, 0.07, 0.74)
    spine.translate(fx, TOP_Y - 0.06, 0)
    wood.push(spine)

    // through-bolts at the four joints — tiny, but they are what make timber
    // read as bolted-together rather than modelled in one lump
    for (const bz of [-0.62, -0.2, 0.2, 0.62]) {
      const bolt = new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6)
      bolt.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
      bolt.translate(fx, Math.abs(bz) > 0.4 ? SEAT_Y - 0.055 : TOP_Y - 0.09, bz)
      iron.push(bolt)
    }
  }

  for (const m of [merged(wood, WOOD), merged(iron, IRON)]) if (m) g.add(m)

  g.position.set(x, 0, z)
  g.rotation.y = yaw
  world.scene.add(g)
  world.colliderFromObject(g, 1)
  return g
}

// ---------- cluster ----------

// Informal grouping, the way real plazas fill up: a couple of café sets with a
// picnic table or a tree seat dropped in, all at odd angles. Rejection sampling
// keeps them from intersecting — overlapping furniture is the single most
// obvious tell that a scene was scattered by a loop.
//
// The pieces register their own colliders as they are built, so this adds none
// of its own; a cluster-wide box would wall off the gaps people walk through.
export function seatCluster(world, { x, z, rng = Math.random, spread = 4 }) {
  const g = new THREE.Group()
  world.scene.add(g)

  const kinds = ['cafe', rng() < 0.5 ? 'tree' : 'picnic']
  if (rng() < 0.55) kinds.push(rng() < 0.6 ? 'cafe' : 'picnic')

  const FOOTPRINT = { cafe: 1.2, tree: 1.9, picnic: 1.45 }
  const placed = []

  for (const kind of kinds) {
    const r = FOOTPRINT[kind]
    let px = null
    let pz = null
    for (let attempt = 0; attempt < 30; attempt++) {
      // uniform over the disc, not the square — sqrt keeps the middle from clumping
      const a = rng() * Math.PI * 2
      const d = Math.sqrt(rng()) * spread
      const cx = x + Math.cos(a) * d
      const cz = z + Math.sin(a) * d
      const clear = placed.every((p) => Math.hypot(p.x - cx, p.z - cz) > p.r + r + 0.5)
      if (clear) {
        px = cx
        pz = cz
        break
      }
    }
    if (px === null) continue // no room left; better a sparse cluster than a collision

    placed.push({ x: px, z: pz, r })
    const yaw = rng() * Math.PI * 2

    let piece
    if (kind === 'cafe') {
      piece = cafeSet(world, { x: px, z: pz, rotY: yaw, chairs: 2 + Math.floor(rng() * 3), umbrella: rng() < 0.5 })
    } else if (kind === 'tree') {
      piece = treeSeat(world, { x: px, z: pz, radius: 1.4 + rng() * 0.3, sides: rng() < 0.5 ? 6 : 8, rotY: yaw })
    } else {
      piece = picnicTable(world, { x: px, z: pz, rotY: yaw })
    }
    // reparent for tidiness — the cluster group sits at the origin, so the
    // pieces' world transforms (and the colliders already taken from them)
    // are unchanged by the move
    g.add(piece)
  }

  return g
}
