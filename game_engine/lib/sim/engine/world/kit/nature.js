import * as THREE from 'three'
import { makeCanvasTexture, mergeSafe } from '../../core/util.js'

// Planting kit. Trees are built as instanced clusters so a street can carry
// hundreds of them inside a handful of draw calls.

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o })

const BARK = M('#5C4433')
const BARK_PALM = M('#7A6248')
const LEAF = {
  canopy: ['#3F7D46', '#356B3B', '#4A8C52', '#2F6136', '#528F58'],
  spring: ['#5FA052', '#6FB35F', '#4E8F45', '#7BC169'],
  autumn: ['#C87A2E', '#B85C2A', '#D89A3C', '#A8482A'],
  palm: ['#3E7F46', '#417F49', '#4C8F52'],
  columnar: ['#2F6136', '#356B3B', '#28522F'],
  willow: ['#6FA653', '#7FB861', '#5E9448'],
  flowering: ['#F3B3CC', '#E8A0BF'],
  maple: ['#D2702B', '#C04A26', '#E0982F', '#B03A22', '#D8853A'],
  fruit: ['#4C8A46', '#3F7D3E', '#579751'],
  oak: ['#2E5F33', '#37703C', '#284F2C', '#3E7A42'],
}

// ---------- foliage detail ----------
// A canopy built only from blobs reads as a bush from any distance. The fix is
// a layer of alpha-cut cards scattered over the blob surface: the blob supplies
// mass and shadow, the cards supply an actual leaf silhouette at the edges.
// Each card carries a small cluster of leaves rather than one, so a convincing
// canopy needs ~10 cards instead of ~60.

let LEAF_TEX = null
function leafClusterTexture() {
  if (LEAF_TEX) return LEAF_TEX
  LEAF_TEX = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // one pointed-oval leaf with a midrib, drawn white so instanceColor tints it
    const leaf = (cx, cy, len, wid, rot) => {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.moveTo(0, -len / 2)
      ctx.quadraticCurveTo(wid / 2, 0, 0, len / 2)
      ctx.quadraticCurveTo(-wid / 2, 0, 0, -len / 2)
      ctx.fillStyle = 'rgba(255,255,255,0.96)'
      ctx.fill()
      // midrib reads as a vein and breaks up the flat fill
      ctx.strokeStyle = 'rgba(180,180,180,0.75)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(0, -len / 2)
      ctx.lineTo(0, len / 2)
      ctx.stroke()
      ctx.restore()
    }
    const spots = [
      [64, 40, 54, 26, 0.1], [40, 70, 46, 22, -0.7], [88, 66, 46, 22, 0.75],
      [58, 96, 40, 19, 0.35], [92, 30, 34, 16, -0.35], [30, 34, 32, 15, 0.5],
    ]
    for (const [x, y, l, wd, r] of spots) leaf(x, y, l, wd, r)
  })
  LEAF_TEX.wrapS = LEAF_TEX.wrapT = THREE.ClampToEdgeWrapping
  return LEAF_TEX
}

let BLOSSOM_TEX = null
function blossomTexture() {
  if (BLOSSOM_TEX) return BLOSSOM_TEX
  BLOSSOM_TEX = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    // three five-petal blooms — the notched petal tip is what makes it read
    // as cherry blossom rather than a generic dot
    const bloom = (cx, cy, r) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.ellipse(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.46, r * 0.34, a, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.95)'
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(210,210,210,0.9)'
      ctx.fill()
    }
    bloom(52, 48, 34)
    bloom(94, 84, 26)
    bloom(28, 94, 22)
  })
  return BLOSSOM_TEX
}

// Cards are alpha-TESTED, not alpha-blended: blending thousands of quads would
// need back-to-front sorting and still fight the depth buffer. alphaTest gives
// a clean cut-out with correct depth for free.
function cardMaterial(map) {
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    roughness: 0.85,
    color: '#FFFFFF',
  })
}

const CARD_GEO = new THREE.PlaneGeometry(1, 1)
const FRUIT_GEO = new THREE.SphereGeometry(1, 8, 6)

// One shared blob geometry per detail level keeps the crowd of foliage cheap.
const blob = (() => {
  const cache = {}
  return (seg = 8) => (cache[seg] ??= new THREE.IcosahedronGeometry(1, seg > 8 ? 1 : 0))
})()

const trunkGeo = (() => {
  const cache = {}
  return (k = 'a') => (cache[k] ??= new THREE.CylinderGeometry(0.13, 0.2, 1, 7))
})()

// A single tree as a Group. `species` changes silhouette, which matters far
// more than leaf detail for reading as a varied streetscape.
export function tree(species = 'canopy', rng = Math.random, { scale = 1 } = {}) {
  const g = new THREE.Group()
  const leafColors = LEAF[species] ?? LEAF.canopy
  const leafMat = M(leafColors[Math.floor(rng() * leafColors.length)], { flatShading: true })

  if (species === 'palm') {
    const h = 4.2 + rng() * 2.4
    const t = new THREE.Mesh(trunkGeo('palm'), BARK_PALM)
    t.scale.set(0.7, h, 0.7)
    t.position.y = h / 2
    t.castShadow = true
    g.add(t)
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.Mesh(blob(), leafMat)
      const a = (i / 7) * Math.PI * 2
      frond.scale.set(1.5, 0.16, 0.5)
      frond.position.set(Math.cos(a) * 1.1, h - 0.1, Math.sin(a) * 1.1)
      frond.rotation.y = -a
      frond.rotation.z = 0.32
      frond.castShadow = true
      g.add(frond)
    }
  } else if (species === 'columnar') {
    const h = 4.5 + rng() * 2.2
    const t = new THREE.Mesh(trunkGeo(), BARK)
    t.scale.set(0.55, h * 0.5, 0.55)
    t.position.y = h * 0.25
    t.castShadow = true
    g.add(t)
    const body = new THREE.Mesh(blob(), leafMat)
    body.scale.set(0.95, h * 0.42, 0.95)
    body.position.y = h * 0.62
    body.castShadow = true
    g.add(body)
  } else if (species === 'flowering') {
    const h = 2.9 + rng() * 1.2
    const t = new THREE.Mesh(trunkGeo(), BARK)
    t.scale.set(0.6, h * 0.55, 0.6)
    t.position.y = h * 0.28
    t.castShadow = true
    g.add(t)
    const blossom = M(rng() < 0.5 ? '#E8A0BF' : '#F2C6D6', { flatShading: true })
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(blob(), blossom)
      const s = 0.85 + rng() * 0.5
      c.scale.setScalar(s)
      c.position.set((rng() - 0.5) * 1.3, h * 0.62 + (rng() - 0.5) * 0.5, (rng() - 0.5) * 1.3)
      c.castShadow = true
      g.add(c)
    }
  } else {
    // broad canopy — the default street tree
    const h = 3.6 + rng() * 2.2
    const t = new THREE.Mesh(trunkGeo(), BARK)
    t.scale.set(1, h * 0.55, 1)
    t.position.y = h * 0.28
    t.castShadow = true
    g.add(t)
    const puffs = 3 + Math.floor(rng() * 3)
    for (let i = 0; i < puffs; i++) {
      const c = new THREE.Mesh(blob(), leafMat)
      const s = 1.0 + rng() * 0.85
      c.scale.set(s * 1.25, s * 0.95, s * 1.25)
      c.position.set((rng() - 0.5) * 1.5, h * 0.62 + (rng() - 0.5) * 0.7, (rng() - 0.5) * 1.5)
      c.castShadow = true
      g.add(c)
    }
  }
  g.scale.setScalar(scale)
  return g
}

// Scatter a lot of trees cheaply.
//
// Building each tree as its own Group costs ~5 draw calls apiece, which put the
// plaza at 1500+ calls. Everything is batched into two InstancedMeshes instead
// — one for trunks, one for foliage with per-instance colour — so an entire
// avenue of trees costs 2 draw calls regardless of count.
export function treeLine(world, points, { species = 'canopy', rng = Math.random, collide = true } = {}) {
  const trunks = []
  const foliage = []
  const petals = []
  const cards = [] // alpha-cut leaf clusters
  const blooms = [] // alpha-cut flowers
  const fruits = [] // apples/oranges hanging in the canopy
  const canopies = [] // {x, z, h} handed back so critters know where to perch
  const c = new THREE.Color()

  // Scatter leaf cards over the shell of a foliage blob. Placing them on the
  // surface rather than through the volume is what gives a ragged silhouette;
  // cards buried inside the blob are invisible and pure cost.
  // Cards sit at 1.12× the blob radius, i.e. deliberately PROTRUDING through
  // the surface. Placed flush at 0.98 they are swallowed by the opaque blob and
  // do nothing — it's the overhang past the silhouette that turns a smooth
  // dome into a ragged leafy edge. Card scale is tuned against canopy blobs
  // that are 3–4 m across: a 1 m card is invisible at that size.
  const dressPuff = (p, hex, n, tex) => {
    const target = tex === 'bloom' ? blooms : cards
    const OUT = 1.12
    // A 4 m canopy blob has ~50 m² of surface; a dozen 2 m cards cover barely a
    // third of it and leave the dome reading as bare geometry between them.
    // Density is what makes the fringe continuous — and it is still one draw
    // call no matter how many go in.
    n = Math.round(n * 3.6)
    for (let i = 0; i < n; i++) {
      const th = rng() * Math.PI * 2
      const ph = Math.acos(2 * rng() - 1)
      const rx = (p.sx / 2) * OUT
      const ry = (p.sy / 2) * OUT
      const rz = (p.sz / 2) * OUT
      target.push({
        x: p.x + Math.sin(ph) * Math.cos(th) * rx,
        y: p.y + Math.cos(ph) * ry,
        z: p.z + Math.sin(ph) * Math.sin(th) * rz,
        // ~0.6–1.1 m per cluster. Bigger cards cover the canopy with fewer
        // instances but each one reads as a single absurd leaf the moment you
        // stand under the tree, so keep them hand-sized and add density instead.
        s: (tex === 'bloom' ? 0.62 : 0.85) * (0.7 + rng() * 0.6),
        rx: rng() * Math.PI,
        ry: rng() * Math.PI * 2,
        rz: rng() * Math.PI,
        color: hex,
      })
    }
  }

  for (const [x, z, sp] of points) {
    const kind = sp ?? species
    const scale = 0.85 + rng() * 0.35
    const yaw = rng() * Math.PI * 2
    const colors = LEAF[kind] ?? LEAF.canopy
    const leafHex = colors[Math.floor(rng() * colors.length)]

    // Canopies must clear head height (~2 m) or people walk straight through the
    // leaves. Every species below lifts its foliage well above that.
    if (kind === 'palm') {
      const h = (7.5 + rng() * 2.8) * scale
      trunks.push({ x, z, y: h / 2, sx: 0.62 * scale, sy: h, yaw, bark: '#7A6248' })
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + yaw
        foliage.push({
          x: x + Math.cos(a) * 1.7 * scale, y: h - 0.15 * scale, z: z + Math.sin(a) * 1.7 * scale,
          sx: 2.3 * scale, sy: 0.2 * scale, sz: 0.75 * scale, yaw: -a, rz: 0.34, color: leafHex,
        })
      }
    } else if (kind === 'columnar') {
      const h = (9 + rng() * 3) * scale
      trunks.push({ x, z, y: h * 0.3, sx: 0.6 * scale, sy: h * 0.6, yaw, bark: '#5C4433' })
      foliage.push({ x, y: h * 0.66, z, sx: 1.5 * scale, sy: h * 0.42, sz: 1.5 * scale, yaw, rz: 0, color: leafHex })
      dressPuff(foliage[foliage.length - 1], leafHex, 16)
      canopies.push({ x, z, h: h * 0.66 })
    } else if (kind === 'flowering') {
      // cherry-blossom style: broad pink crown, plus a drift of fallen petals
      const h = (5.6 + rng() * 1.8) * scale
      trunks.push({ x, z, y: h * 0.3, sx: 0.72 * scale, sy: h * 0.6, yaw, bark: '#6B5140' })
      const blossom = ['#F3B3CC', '#E8A0BF', '#F7CBDC', '#EFA7C4'][Math.floor(rng() * 4)]
      for (let i = 0; i < 7; i++) {
        const s = (1.5 + rng() * 0.9) * scale
        const a = (i / 7) * Math.PI * 2
        foliage.push({
          x: x + Math.cos(a) * (1.5 + rng() * 0.8) * scale,
          y: h * 0.78 + (rng() - 0.5) * 0.9 * scale,
          z: z + Math.sin(a) * (1.5 + rng() * 0.8) * scale,
          sx: s * 1.2, sy: s * 0.8, sz: s * 1.2, yaw, rz: 0, color: blossom,
        })
        // real five-petal blooms on the crown, plus a few green leaves so it
        // isn't a solid wall of pink
        dressPuff(foliage[foliage.length - 1], blossom, 8, 'bloom')
        dressPuff(foliage[foliage.length - 1], '#4E8F45', 3)
      }
      petals.push({ x, z, color: blossom, r: 2.6 * scale })
      canopies.push({ x, z, h: h * 0.78 })
    } else if (kind === 'willow') {
      const h = (6.2 + rng() * 1.6) * scale
      trunks.push({ x, z, y: h * 0.32, sx: 0.8 * scale, sy: h * 0.64, yaw, bark: '#5A4A38' })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        foliage.push({
          x: x + Math.cos(a) * 1.9 * scale, y: h * 0.72, z: z + Math.sin(a) * 1.9 * scale,
          sx: 0.85 * scale, sy: 2.1 * scale, sz: 0.85 * scale, yaw, rz: 0, color: leafHex,
        })
      }
      foliage.push({ x, y: h * 0.9, z, sx: 2.4 * scale, sy: 1.3 * scale, sz: 2.4 * scale, yaw, rz: 0, color: leafHex })
      dressPuff(foliage[foliage.length - 1], leafHex, 10)
      canopies.push({ x, z, h: h * 0.8 })
    } else {
      // Broad canopy — the default street tree. 'maple', 'oak' and 'fruit' all
      // share this silhouette and differ by palette, crown size and what hangs
      // in them, which is enough to stop an avenue reading as one cloned tree.
      const bark = kind === 'fruit' ? '#6A5140' : kind === 'maple' ? '#54402F' : '#5C4433'
      const spread = kind === 'oak' ? 1.25 : kind === 'fruit' ? 0.85 : 1
      const h = (kind === 'fruit' ? 5.4 + rng() * 1.4 : 7 + rng() * 3) * scale
      trunks.push({ x, z, y: h * 0.3, sx: 1.15 * scale, sy: h * 0.6, yaw, bark })
      const puffs = 5 + Math.floor(rng() * 4)
      for (let i = 0; i < puffs; i++) {
        const s = (1.7 + rng() * 1.1) * scale * spread
        const a = (i / puffs) * Math.PI * 2 + rng() * 0.6
        const rad = (i === 0 ? 0 : 1.2 + rng() * 1.0) * scale * spread
        const p = {
          x: x + Math.cos(a) * rad,
          y: h * 0.74 + (rng() - 0.5) * 1.1 * scale,
          z: z + Math.sin(a) * rad,
          sx: s * 1.3, sy: s * 0.95, sz: s * 1.3, yaw, rz: 0, color: leafHex,
        }
        foliage.push(p)
        dressPuff(p, leafHex, 9)
        if (kind === 'fruit') {
          const fruitHex = ['#D23B2E', '#E2542F', '#C9312B', '#E8A02C'][Math.floor(rng() * 4)]
          for (let k = 0; k < 3; k++) {
            const th = rng() * Math.PI * 2
            fruits.push({
              x: p.x + Math.cos(th) * (p.sx / 2) * 0.85,
              y: p.y - (p.sy / 2) * (0.25 + rng() * 0.55),
              z: p.z + Math.sin(th) * (p.sz / 2) * 0.85,
              s: 0.1 + rng() * 0.045,
              color: fruitHex,
            })
          }
        }
      }
      // windfall under fruit trees — a fruit tree with nothing on the ground
      // looks tended in a way a plaza never is
      if (kind === 'fruit') {
        for (let k = 0; k < 4; k++) {
          const th = rng() * Math.PI * 2
          const rr = (0.7 + rng() * 1.5) * scale
          fruits.push({
            x: x + Math.cos(th) * rr, y: 0.1, z: z + Math.sin(th) * rr,
            s: 0.1, color: '#C9312B',
          })
        }
      }
      canopies.push({ x, z, h: h * 0.74 })
    }
    // trunk collider — wider than before so people actually bump into the tree
    if (collide) world.addCollider(x - 0.55, x + 0.55, z - 0.55, z + 0.55, 2.6)
  }

  const d = new THREE.Object3D()

  const trunkMesh = new THREE.InstancedMesh(trunkGeo(), M('#FFFFFF'), trunks.length)
  trunks.forEach((t, i) => {
    d.position.set(t.x, t.y, t.z)
    d.rotation.set(0, t.yaw, 0)
    d.scale.set(t.sx, t.sy, t.sx)
    d.updateMatrix()
    trunkMesh.setMatrixAt(i, d.matrix)
    trunkMesh.setColorAt(i, c.set(t.bark))
  })
  trunkMesh.instanceMatrix.needsUpdate = true
  if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true
  trunkMesh.castShadow = true

  const leafMesh = new THREE.InstancedMesh(blob(), M('#FFFFFF', { flatShading: true }), foliage.length)
  foliage.forEach((f, i) => {
    d.position.set(f.x, f.y, f.z)
    d.rotation.set(0, f.yaw, f.rz)
    d.scale.set(f.sx, f.sy, f.sz)
    d.updateMatrix()
    leafMesh.setMatrixAt(i, d.matrix)
    leafMesh.setColorAt(i, c.set(f.color))
  })
  leafMesh.instanceMatrix.needsUpdate = true
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true
  leafMesh.castShadow = true

  world.scene.add(trunkMesh, leafMesh)

  // Leaf / blossom cards and fruit: one instanced draw call each, however many
  // trees were planted. Cards deliberately do NOT cast shadows — the blob they
  // sit on already casts one, and shadow-mapping thousands of alpha-tested
  // quads costs far more than it adds.
  const buildCards = (list, tex) => {
    if (!list.length) return null
    const m = new THREE.InstancedMesh(CARD_GEO, cardMaterial(tex), list.length)
    list.forEach((f, i) => {
      d.position.set(f.x, f.y, f.z)
      d.rotation.set(f.rx, f.ry, f.rz)
      d.scale.set(f.s, f.s, f.s)
      d.updateMatrix()
      m.setMatrixAt(i, d.matrix)
      m.setColorAt(i, c.set(f.color))
    })
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.castShadow = false
    m.receiveShadow = false
    world.scene.add(m)
    return m
  }

  const cardMesh = buildCards(cards, leafClusterTexture())
  const bloomMesh = buildCards(blooms, blossomTexture())

  let fruitMesh = null
  if (fruits.length) {
    fruitMesh = new THREE.InstancedMesh(FRUIT_GEO, M('#FFFFFF', { roughness: 0.55 }), fruits.length)
    fruits.forEach((f, i) => {
      d.position.set(f.x, f.y, f.z)
      d.rotation.set(0, 0, 0)
      d.scale.setScalar(f.s)
      d.updateMatrix()
      fruitMesh.setMatrixAt(i, d.matrix)
      fruitMesh.setColorAt(i, c.set(f.color))
    })
    fruitMesh.instanceMatrix.needsUpdate = true
    if (fruitMesh.instanceColor) fruitMesh.instanceColor.needsUpdate = true
    fruitMesh.castShadow = true
    world.scene.add(fruitMesh)
  }

  // fallen-petal drifts under blossom trees — the cheapest possible way to say
  // "it's blossom season"
  if (petals.length) {
    const petalGeo = new THREE.CircleGeometry(1, 12)
    const petalMesh = new THREE.InstancedMesh(
      petalGeo,
      new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.34, depthWrite: false }),
      petals.length
    )
    petals.forEach((p, i) => {
      d.position.set(p.x, 0.035, p.z)
      d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI)
      d.scale.set(p.r, p.r, 1)
      d.updateMatrix()
      petalMesh.setMatrixAt(i, d.matrix)
      petalMesh.setColorAt(i, c.set(p.color))
    })
    petalMesh.instanceMatrix.needsUpdate = true
    if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true
    petalMesh.renderOrder = 1
    world.scene.add(petalMesh)
  }

  // `canopies` is returned so other systems (falling leaves, perching birds)
  // can attach to real trees instead of guessing where the planting went.
  return { trunkMesh, leafMesh, cardMesh, bloomMesh, fruitMesh, canopies }
}

// Drifting leaf-fall. Leaves spawn inside a canopy, then tumble down on a slow
// sine drift — falling straight down reads as rain, so the lateral wander and
// the tumble are what sell it. One instanced draw call for the whole system.
export class FallingLeaves {
  constructor({ canopies = [], count = 90, rng = Math.random, colors = null } = {}) {
    this.canopies = canopies.length ? canopies : [{ x: 0, z: 0, h: 6 }]
    this.count = count
    this.rng = rng
    this.t = 0
    this.leaves = []

    const palette = colors ?? ['#C87A2E', '#D89A3C', '#B85C2A', '#4A8C52', '#E8A0BF']
    const c = new THREE.Color()
    this.mesh = new THREE.InstancedMesh(CARD_GEO, cardMaterial(leafClusterTexture()), count)
    this.mesh.castShadow = false
    this.mesh.frustumCulled = false

    for (let i = 0; i < count; i++) {
      this.leaves.push(this.spawn(rng() * 1))
      this.mesh.setColorAt(i, c.set(palette[Math.floor(rng() * palette.length)]))
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
    this._d = new THREE.Object3D()
  }

  spawn(progress = 0) {
    const rng = this.rng
    const t = this.canopies[Math.floor(rng() * this.canopies.length)]
    const a = rng() * Math.PI * 2
    const r = rng() * 2.4
    const top = t.h + 0.4
    return {
      x: t.x + Math.cos(a) * r,
      z: t.z + Math.sin(a) * r,
      top,
      y: top - progress * top,
      fall: 0.5 + rng() * 0.55,
      swayAmp: 0.3 + rng() * 0.7,
      swayFreq: 0.7 + rng() * 1.1,
      phase: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 2.4,
      s: 0.16 + rng() * 0.13,
      rot: rng() * Math.PI * 2,
    }
  }

  update(dt) {
    this.t += dt
    const d = this._d
    for (let i = 0; i < this.leaves.length; i++) {
      const L = this.leaves[i]
      L.y -= L.fall * dt
      L.rot += L.spin * dt
      if (L.y <= 0.05) Object.assign(L, this.spawn(0))
      const sway = Math.sin(this.t * L.swayFreq + L.phase) * L.swayAmp
      d.position.set(L.x + sway, L.y, L.z + Math.cos(this.t * L.swayFreq * 0.8 + L.phase) * L.swayAmp * 0.6)
      // tumble about two axes so it flutters rather than spinning like a coin
      d.rotation.set(L.rot * 0.7, L.rot, Math.sin(this.t + L.phase) * 0.8)
      d.scale.setScalar(L.s)
      d.updateMatrix()
      this.mesh.setMatrixAt(i, d.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  addTo(world) {
    world.scene.add(this.mesh)
    return this
  }
}

// Low hedge run, instanced.
export function hedge(world, { x, z, length, rotY = 0, height = 0.75, color = '#3C6B3F' }) {
  const count = Math.max(1, Math.round(length / 0.6))
  const geo = new THREE.BoxGeometry(0.62, height, 0.7)
  const inst = new THREE.InstancedMesh(geo, M(color, { flatShading: true }), count)
  const d = new THREE.Object3D()
  for (let i = 0; i < count; i++) {
    d.position.set(-length / 2 + 0.6 * (i + 0.5), height / 2 + (Math.random() - 0.5) * 0.06, 0)
    d.rotation.y = (Math.random() - 0.5) * 0.2
    d.updateMatrix()
    inst.setMatrixAt(i, d.matrix)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = inst.receiveShadow = true
  const g = new THREE.Group()
  g.add(inst)
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  const ax = Math.abs(Math.cos(rotY)) * length * 0.5 + 0.35
  const az = Math.abs(Math.sin(rotY)) * length * 0.5 + 0.35
  world.addCollider(x - ax, x + ax, z - az, z + az, height)
  return g
}

// Grass / lawn patch with gentle colour noise, so it isn't a flat green plane.
export function lawn(world, { x, z, w, d, color = '#5C8A42' }) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '30,60,25' : '130,170,90'},${Math.random() * 0.28})`
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(w / 6, d / 6)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }))
  m.rotation.x = -Math.PI / 2
  m.position.set(x, 0.025, z)
  m.receiveShadow = true
  world.scene.add(m)
  return m
}

// Potted planter — the small green note that softens hard paving.
export function planter(world, { x, z, scale = 1 }) {
  const g = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, 10), M('#8A7A66'))
  pot.position.y = 0.25
  pot.castShadow = true
  const bush = new THREE.Mesh(blob(), M('#42804A', { flatShading: true }))
  bush.scale.set(0.55, 0.45, 0.55)
  bush.position.y = 0.72
  bush.castShadow = true
  g.add(pot, bush)
  g.scale.setScalar(scale)
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.addCollider(x - 0.42 * scale, x + 0.42 * scale, z - 0.42 * scale, z + 0.42 * scale, 1)
  return g
}

// ---------- distant scenery: snow-capped mountains ----------
// A low-poly ridge for the horizon — a run of overlapping angular peaks, each a
// hazy rock cone with a snow cap. This is BACKDROP, not terrain: it carries no
// colliders and is meant to be placed well outside the play bounds, sunk a
// little below ground so its feet melt into the scene fog. The snow cap is a
// scaled copy of the peak's upper cone, so its slopes line up exactly with the
// rock below and the snow line reads as one clean face rather than two shells.
//
// Every rock cone in a range is merged into ONE geometry and every snow cap
// into another (via mergeSafe), so a whole ridge costs two draw calls no matter
// how many peaks it carries.
const MTN_ROCK = M('#4A3F63', { flatShading: true, roughness: 1 }) // dusk-purple haze rock
const MTN_SNOW = M('#E4DAF0', { flatShading: true, roughness: 1 }) // cool lavender-white cap

export function snowRange(rng = Math.random, {
  peaks = 4, spread = 150, base = 44, vary = 24, snowLine = 0.52, seg = 5,
} = {}) {
  const g = new THREE.Group()
  const rockParts = []
  const snowParts = []

  for (let i = 0; i < peaks; i++) {
    const t = peaks === 1 ? 0.5 : i / (peaks - 1)
    const h = base + rng() * vary
    const r = h * (0.55 + rng() * 0.3)
    const spinY = rng() * Math.PI * 2 // rotate facets so no two peaks line up
    const squash = 0.85 + rng() * 0.4 // per-peak steepness
    // overlap the peaks along the ridge, with a little depth stagger so the
    // silhouette layers instead of reading as one flat wall
    const px = (t - 0.5) * spread + (rng() - 0.5) * spread * 0.12
    const pz = (rng() - 0.5) * spread * 0.18

    const place = (geo) => {
      geo.scale(1, squash, 1)
      geo.rotateY(spinY)
      geo.translate(px, 0, pz)
      return geo
    }

    const rock = new THREE.ConeGeometry(r, h, seg, 1)
    rock.translate(0, h / 2, 0)
    rockParts.push(place(rock))

    // cap cone shares the rock's slope: base radius / height scaled by the same
    // fraction and sat on the snow line, then nudged out 3% to beat z-fighting
    const capH = h * (1 - snowLine)
    const capR = r * (1 - snowLine)
    const cap = new THREE.ConeGeometry(capR, capH, seg, 1)
    cap.scale(1.03, 1, 1.03)
    cap.translate(0, h * snowLine + capH / 2, 0)
    snowParts.push(place(cap))
  }

  const rockMesh = new THREE.Mesh(mergeSafe(rockParts), MTN_ROCK)
  const snowMesh = new THREE.Mesh(mergeSafe(snowParts), MTN_SNOW)
  rockMesh.castShadow = rockMesh.receiveShadow = false
  snowMesh.castShadow = snowMesh.receiveShadow = false
  g.add(rockMesh, snowMesh)
  return g
}
