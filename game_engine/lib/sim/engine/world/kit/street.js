import * as THREE from 'three'
import { makeCanvasTexture, pbrCanvas, mergeSafe } from '../../core/util.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { roundedBox } from './forms.js'
import { PALETTE } from '../../core/design.js'

// Street furniture kit: pavements, signage, lighting, traffic control and
// police presence. These are the props that make a road read as a real street
// rather than a grey plane with buildings on it.

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, ...o })
const METAL = M('#6B7280', { roughness: 0.45, metalness: 0.55 })
const DARK = M('#2B3038')
const WHITE = M('#E8E6E1')

// ---------- pavement ----------

// A real footpath is not one grey slab. It's a paved field of slabs sunk between
// two raised kerbs, each kerb chamfered along its top edge with a shallow gutter
// channel running at its foot and cut into kerbstone lengths by joint grooves.
// Every pavement() placement auto-upgrades into that section; the callers in
// Outdoor.js are untouched.
//
// One paving-slab world size, so slabs stay the same size on a 58 m promenade
// and a 120 m avenue. Tiling is baked into the top surface's UVs (below) rather
// than the texture repeat, which is what lets a single shared material serve
// every pavement regardless of length.
const SLAB_TILE = 3.2 // metres of paving covered by one texture repeat (4×4 slabs)

// Shared surfaces — built once, reused by every footpath in the world.
let _pavedMat, _kerbMat, _baseMat, _channelMat
function pavedMat() {
  if (_pavedMat) return _pavedMat
  const base = PALETTE.city.concrete // #A8A29A
  const { map, roughnessMap, normalMap } = pbrCanvas(512, (ctx, w, h) => {
    const grout = '#6E6A63'
    ctx.fillStyle = grout
    ctx.fillRect(0, 0, w, h)
    const n = 4
    const cell = w / n
    const gap = 4 // grout width in px → recessed groove via the normal map
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        // per-slab tone drift so the field isn't a flat colour
        const t = (Math.random() - 0.5) * 18
        const mix = (v) => Math.max(0, Math.min(255, v + t))
        ctx.fillStyle = `rgb(${mix(168)},${mix(162)},${mix(154)})`
        ctx.fillRect(c * cell + gap, r * cell + gap, cell - gap * 2, cell - gap * 2)
      }
    }
    // fine aggregate speckle across the whole field
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '50,48,44'},${Math.random() * 0.14})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
  }, {
    // grout lines read as grooves; slab faces are a touch smoother than grout
    rough: (ctx, w, h) => {
      ctx.fillStyle = '#d8d8d8'
      ctx.fillRect(0, 0, w, h)
      const n = 4, cell = w / n, gap = 4
      ctx.fillStyle = '#a2a2a2'
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          ctx.fillRect(c * cell + gap, r * cell + gap, cell - gap * 2, cell - gap * 2)
    },
    normalStrength: 1.1,
  })
  _pavedMat = new THREE.MeshStandardMaterial({
    map, roughnessMap, normalMap,
    color: base, roughness: 0.96, metalness: 0,
    normalScale: new THREE.Vector2(0.7, 0.7),
  })
  _pavedMat.map.anisotropy = 8
  return _pavedMat
}
const kerbMat = () => (_kerbMat ??= M('#C4BFB6', { roughness: 0.9 }))       // lighter cast stone
const baseMat = () => (_baseMat ??= M('#8F8981', { roughness: 0.95 }))       // concrete body/edges
const channelMat = () => (_channelMat ??= M('#3C3934', { roughness: 0.95 })) // gutter + joint grooves (dark)

// Rescale a geometry's UVs in place so a fixed-size texture tiles across it by
// world size instead of stretching once across the whole surface.
function tileUV(geo, ru, rv) {
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv)
  uv.needsUpdate = true
}

// Raised kerbed footpath with a paving-slab surface. `dir` is 'x' or 'z'.
// Built in a local frame (length → X, width → Z) and rotated for 'z', so the
// world footprint matches what every caller already relies on.
export function pavement(world, { x, z, length, width = 3.2, dir = 'x', height = 0.16 }) {
  const lenX = length
  const widZ = width

  const kerbW = 0.16   // kerbstone width
  const raise = 0.12   // how far the kerb stands above the paved field
  const cham = 0.05    // chamfer on the kerb's inner top edge
  const gutterW = 0.12 // gutter channel at the foot of the kerb
  const border = kerbW + gutterW

  const g = new THREE.Group()

  // concrete body — its top forms the gutter floor and the exposed edges
  const body = new THREE.Mesh(new THREE.BoxGeometry(lenX, height, widZ), baseMat())
  body.position.y = height / 2
  body.receiveShadow = true
  g.add(body)

  // paved field, inset from both long edges to leave room for gutter + kerb
  const paveW = Math.max(0.5, widZ - 2 * border)
  const topGeo = new THREE.PlaneGeometry(lenX, paveW)
  topGeo.rotateX(-Math.PI / 2)
  tileUV(topGeo, lenX / SLAB_TILE, paveW / SLAB_TILE)
  const top = new THREE.Mesh(topGeo, pavedMat())
  top.position.y = height + 0.004 // sit just proud of the body to avoid z-fighting
  top.receiveShadow = true
  g.add(top)

  // kerbs + gutters run along both long edges (road side and planting side)
  const kerbParts = []
  const channelParts = []
  const kerbTop = height + raise
  const jointStep = 2.4 // kerbstone length between joint grooves
  for (const s of [-1, 1]) {
    const edgeZ = s * (widZ / 2 - kerbW / 2)
    // kerb block
    const block = new THREE.BoxGeometry(lenX, kerbTop, kerbW)
    block.translate(0, kerbTop / 2, edgeZ)
    kerbParts.push(block)
    // chamfer strip on the inner top edge — a thin box turned 45°
    const innerZ = edgeZ - s * kerbW / 2
    const chip = new THREE.BoxGeometry(lenX, cham, cham)
    chip.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 4))
    chip.translate(0, kerbTop - cham * 0.35, innerZ + s * cham * 0.35)
    kerbParts.push(chip)

    // gutter channel at the foot of the kerb, recessed just below the paving
    const gz = s * (widZ / 2 - kerbW - gutterW / 2)
    const gutter = new THREE.BoxGeometry(lenX, 0.02, gutterW)
    gutter.translate(0, height - 0.006, gz)
    channelParts.push(gutter)

    // periodic joint grooves cutting the kerb into individual stones
    for (let jx = -lenX / 2 + jointStep; jx < lenX / 2 - 0.1; jx += jointStep) {
      const joint = new THREE.BoxGeometry(0.03, raise * 0.85, kerbW * 1.02)
      joint.translate(jx, height + raise * 0.5, edgeZ)
      channelParts.push(joint)
    }
  }
  const kerb = new THREE.Mesh(mergeSafe(kerbParts), kerbMat())
  kerb.castShadow = true
  kerb.receiveShadow = true
  g.add(kerb)
  const channel = new THREE.Mesh(mergeSafe(channelParts), channelMat())
  channel.receiveShadow = true
  g.add(channel)

  g.position.set(x, 0, z)
  g.rotation.y = dir === 'z' ? Math.PI / 2 : 0
  world.scene.add(g)
  // no collider: the player steps up onto it visually, but shouldn't be stopped
  return g
}

// Zebra crossing.
export function crossing(world, { x, z, width = 6.6, dir = 'x' }) {
  const g = new THREE.Group()
  for (let i = -3; i <= 3; i++) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(dir === 'x' ? 0.7 : width, dir === 'x' ? width : 0.7),
      new THREE.MeshBasicMaterial({ color: '#E4E7EA' })
    )
    s.rotation.x = -Math.PI / 2
    s.position.set(dir === 'x' ? i * 1.15 : 0, 0.04, dir === 'x' ? 0 : i * 1.15)
    g.add(s)
  }
  g.position.set(x, 0, z)
  world.scene.add(g)
  return g
}

// ---------- signage ----------

function signFace(draw, w = 256, h = 256) {
  return new THREE.MeshBasicMaterial({ map: makeCanvasTexture(w, h, draw), side: THREE.DoubleSide })
}

function post(height = 2.6, color = '#7A828C') {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, height, 8), M(color, { roughness: 0.5, metalness: 0.4 }))
  p.position.y = height / 2
  p.castShadow = true
  return p
}

// Circular / octagonal regulatory road sign (STOP, speed limit, no entry).
export function roadSign(world, { x, z, rotY = 0, type = 'stop', text = '' }) {
  const g = new THREE.Group()
  g.add(post(2.4))

  let face
  let geo
  if (type === 'stop') {
    geo = new THREE.CircleGeometry(0.42, 8)
    face = signFace((ctx, w, h) => {
      ctx.fillStyle = '#C0392B'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#FFF'
      ctx.lineWidth = 12
      ctx.strokeRect(18, 18, w - 36, h - 36)
      ctx.fillStyle = '#FFF'
      ctx.font = 'bold 76px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('STOP', w / 2, h / 2)
    })
  } else if (type === 'speed') {
    geo = new THREE.CircleGeometry(0.4, 24)
    face = signFace((ctx, w, h) => {
      ctx.fillStyle = '#FFF'
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#C0392B'
      ctx.lineWidth = 26
      ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 22, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = '#1B1B1B'
      ctx.font = 'bold 108px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text || '30', w / 2, h / 2 + 4)
    })
  } else if (type === 'pedestrian') {
    geo = new THREE.PlaneGeometry(0.7, 0.7)
    face = signFace((ctx, w, h) => {
      ctx.fillStyle = '#1B6CA8'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#FFF'
      ctx.font = '150px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🚶', w / 2, h / 2 + 8)
    })
  } else {
    geo = new THREE.PlaneGeometry(0.78, 0.5)
    face = signFace((ctx, w, h) => {
      ctx.fillStyle = '#2A7A46'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#FFF'
      ctx.lineWidth = 8
      ctx.strokeRect(12, 12, w - 24, h - 24)
      ctx.fillStyle = '#FFF'
      ctx.font = 'bold 52px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text || 'CITY CENTRE', w / 2, h / 2)
    }, 512, 320)
  }

  const plate = new THREE.Mesh(geo, face)
  plate.position.y = 2.1
  plate.position.z = 0.04
  g.add(plate)
  const back = new THREE.Mesh(geo, M('#9AA1A9', { metalness: 0.3 }))
  back.position.y = 2.1
  back.position.z = 0.02
  g.add(back)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 0.12, x + 0.12, z - 0.12, z + 0.12, 2.4)
  return g
}

// Overhead street-name / direction gantry beside the road.
export function directionSign(world, { x, z, rotY = 0, lines = ['Neon Square →'] }) {
  const g = new THREE.Group()
  g.add(post(3.4, '#5D646D'))
  const h = 0.42 * lines.length + 0.2
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, h, 0.08),
    signFace((ctx, w, ch) => {
      ctx.fillStyle = '#1F5E3A'
      ctx.fillRect(0, 0, w, ch)
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 6
      ctx.strokeRect(10, 10, w - 20, ch - 20)
      ctx.fillStyle = '#FFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const per = ch / lines.length
      lines.forEach((t, i) => {
        ctx.font = `bold ${Math.min(56, per * 0.5)}px ui-sans-serif, system-ui`
        ctx.fillText(t, w / 2, per * (i + 0.5))
      })
    }, 768, 256 * lines.length)
  )
  board.position.y = 3.0
  board.castShadow = true
  g.add(board)
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 0.14, x + 0.14, z - 0.14, z + 0.14, 3)
  return g
}

// ---------- lighting & traffic ----------

export function streetLamp(world, { x, z, rotY = 0, warm = '#FFD9A0' }) {
  const g = new THREE.Group()
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), METAL)
  mast.position.y = 2.6
  mast.castShadow = true
  g.add(mast)
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), METAL)
  arm.position.set(0.5, 5.1, 0)
  g.add(arm)
  const head = new THREE.Mesh(roundedBox(0.5, 0.14, 0.26, 0.05), M('#4B535C', { metalness: 0.4 }))
  head.position.set(1.0, 5.0, 0)
  g.add(head)
  const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), new THREE.MeshBasicMaterial({ color: warm, toneMapped: false }))
  lens.rotation.x = Math.PI / 2
  lens.position.set(1.0, 4.92, 0)
  g.add(lens)
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 3)
  return g
}

export function trafficLight(world, { x, z, rotY = 0, state = 0 }) {
  const g = new THREE.Group()
  g.add(post(3.2, '#3A4048'))
  const box = new THREE.Mesh(roundedBox(0.34, 0.92, 0.28, 0.05), M('#23282E'))
  box.position.y = 3.2
  box.castShadow = true
  g.add(box)
  const colors = ['#E4453A', '#F2C14E', '#3FBF6B']
  const lamps = []
  colors.forEach((c, i) => {
    const on = i === state
    const l = new THREE.Mesh(
      new THREE.CircleGeometry(0.1, 14),
      new THREE.MeshBasicMaterial({ color: on ? c : '#31363C', toneMapped: false })
    )
    l.position.set(0, 3.5 - i * 0.29, 0.15)
    g.add(l)
    lamps.push({ mesh: l, color: c })
  })
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 0.16, x + 0.16, z - 0.16, z + 0.16, 3)
  return { group: g, lamps, state }
}

// ---------- small furniture ----------

export function bin(world, { x, z }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.72, 12), M('#3F5D48'))
  body.position.y = 0.36
  body.castShadow = true
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.028, 6, 16), M('#2B3F33'))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.72
  g.add(body, rim)
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.addCollider(x - 0.26, x + 0.26, z - 0.26, z + 0.26, 0.8)
  return g
}

export function bollard(world, { x, z }) {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 10), M('#4A515A', { metalness: 0.4 }))
  b.position.set(x, 0.45, z)
  b.castShadow = true
  world.scene.add(b)
  world.addCollider(x - 0.12, x + 0.12, z - 0.12, z + 0.12, 0.9)
  return b
}

// Park bench, after the cast-iron-and-slat benches in Central Park: a dark
// green scrolled iron frame at each end carrying separated timber slats. The
// gaps between slats are the whole point — a solid plank reads as a crate,
// while slats read as a bench from any distance.
//
// Ships as two draw calls (all wood merged, all iron merged) rather than the
// ~14 a slatted bench would naively cost.
const BENCH_WOOD = M('#8A6242', { roughness: 0.82 })
const BENCH_IRON = M('#2F4034', { roughness: 0.5, metalness: 0.5 })

// Registers its seat positions on world.seatAnchors so people can actually be
// placed ON the bench. Hardcoding sitter coordinates meant they floated in
// midair the moment a bench moved.
export function bench(world, { x, z, rotY = 0, length = 1.8 }) {
  const g = new THREE.Group()
  const wood = []
  const iron = []

  const SEAT_Y = 0.44
  const slatW = 0.085
  const gap = 0.038

  // Plain boxes, not roundedBox: a 4.5 cm slat shows no visible corner radius,
  // and roundedBox costs ~1,700 verts apiece — 12k per bench across 15 benches.
  // seat: 4 slats running the length of the bench, front to back
  for (let i = 0; i < 4; i++) {
    const s = new THREE.BoxGeometry(length, 0.045, slatW)
    s.translate(0, SEAT_Y, -0.19 + i * (slatW + gap))
    wood.push(s)
  }
  // back: 3 slats, raked back for comfort
  for (let i = 0; i < 3; i++) {
    const s = new THREE.BoxGeometry(length, slatW, 0.042)
    s.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.16))
    s.translate(0, SEAT_Y + 0.19 + i * (slatW + gap), -0.245 - i * 0.032)
    wood.push(s)
  }

  for (const sx of [-1, 1]) {
    const ex = sx * (length / 2 - 0.06)
    // front and back legs, splayed slightly like the real frame
    const f = new THREE.BoxGeometry(0.05, SEAT_Y, 0.05)
    f.translate(ex, SEAT_Y / 2, 0.17)
    iron.push(f)
    const b = new THREE.BoxGeometry(0.05, SEAT_Y, 0.05)
    b.translate(ex, SEAT_Y / 2, -0.2)
    iron.push(b)
    // seat rail the slats sit on
    const rail = new THREE.BoxGeometry(0.055, 0.05, 0.5)
    rail.translate(ex, SEAT_Y - 0.03, -0.02)
    iron.push(rail)
    // back upright, raked to match the slats
    const up = new THREE.BoxGeometry(0.05, 0.5, 0.05)
    up.applyMatrix4(new THREE.Matrix4().makeRotationX(-0.16))
    up.translate(ex, SEAT_Y + 0.24, -0.26)
    iron.push(up)
    // the scroll: a quarter torus standing in for the cast-iron curl at the top
    const scroll = new THREE.TorusGeometry(0.075, 0.022, 6, 12, Math.PI * 1.4)
    scroll.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2))
    scroll.translate(ex, SEAT_Y + 0.5, -0.3)
    iron.push(scroll)
    // armrest
    const arm = new THREE.BoxGeometry(0.05, 0.045, 0.42)
    arm.translate(ex, SEAT_Y + 0.26, -0.02)
    iron.push(arm)
  }

  const woodMesh = new THREE.Mesh(mergeSafe(wood), BENCH_WOOD)
  const ironMesh = new THREE.Mesh(mergeSafe(iron), BENCH_IRON)
  for (const m of [woodMesh, ironMesh]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.colliderFromObject(g, 1)
  // two seat spots per bench, offset along its length and rotated into world space
  world.seatAnchors ??= []
  for (const off of [-length * 0.26, length * 0.26]) {
    world.seatAnchors.push({
      x: x + Math.cos(rotY) * off,
      z: z - Math.sin(rotY) * off,
      heading: rotY,
      height: SEAT_Y,
    })
  }

  return g
}

export function busStop(world, { x, z, rotY = 0 }) {
  const g = new THREE.Group()
  const roof = new THREE.Mesh(roundedBox(3.4, 0.12, 1.5, 0.04), M('#37414C', { metalness: 0.3 }))
  roof.position.y = 2.5
  roof.castShadow = true
  g.add(roof)
  for (const px of [-1.55, 1.55]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 8), METAL)
    p.position.set(px, 1.25, -0.6)
    g.add(p)
  }
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3, 1.8),
    new THREE.MeshStandardMaterial({ color: '#A8C4D4', transparent: true, opacity: 0.28, roughness: 0.1, side: THREE.DoubleSide })
  )
  glass.position.set(0, 1.4, -0.68)
  g.add(glass)
  const bnch = new THREE.Mesh(roundedBox(2.6, 0.1, 0.42, 0.03), M('#6B7280'))
  bnch.position.set(0, 0.5, -0.4)
  g.add(bnch)
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.5),
    signFace((ctx, w, h) => {
      ctx.fillStyle = '#1B4F8A'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#FFF'
      ctx.font = '90px serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🚌', w / 2, h / 2)
    })
  )
  sign.position.set(1.55, 2.0, -0.55)
  g.add(sign)
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 1.7, x + 1.7, z - 0.85, z + 0.85, 2.6)
  return g
}

// ---------- police ----------

// Marked patrol car with a light bar that actually flashes.
export function policeCar(world, { x, z, rotY = 0 }) {
  const g = new THREE.Group()
  const white = M('#EDEDEF', { roughness: 0.35 })
  const blue = M('#1B3B7A', { roughness: 0.35 })

  const body = new THREE.Mesh(roundedBox(4.2, 0.85, 1.85, 0.16), white)
  body.position.y = 0.72
  body.castShadow = true
  g.add(body)
  const cabin = new THREE.Mesh(roundedBox(2.1, 0.72, 1.66, 0.14), M('#20262E', { roughness: 0.2, metalness: 0.2 }))
  cabin.position.set(-0.2, 1.42, 0)
  cabin.castShadow = true
  g.add(cabin)
  // blue door panel — the classic two-tone livery
  for (const sz of [-0.94, 0.94]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.03), blue)
    door.position.set(-0.1, 0.72, sz)
    g.add(door)
  }
  const hubMat = M('#C2C8CF', { roughness: 0.35, metalness: 0.7 })
  for (const [wx, wz] of [[-1.3, 0.95], [1.3, 0.95], [-1.3, -0.95], [1.3, -0.95]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 16), M('#15181D'))
    w.rotation.x = Math.PI / 2
    w.position.set(wx, 0.36, wz)
    g.add(w)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 10), hubMat)
    hub.rotation.x = Math.PI / 2
    hub.position.set(wx, 0.36, wz + Math.sign(wz) * 0.09)
    g.add(hub)
  }

  // dark glass: a raked windshield, a backlight and the side glazing, so the
  // greenhouse reads as windows rather than a solid painted block.
  const glassMat = M('#0E141C', { roughness: 0.12, metalness: 0.4 })
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 1.5), glassMat)
  windshield.position.set(0.92, 1.4, 0)
  windshield.rotation.z = 0.42
  g.add(windshield)
  const backlight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 1.5), glassMat)
  backlight.position.set(-1.2, 1.42, 0)
  backlight.rotation.z = -0.38
  g.add(backlight)
  for (const sz of [-0.84, 0.84]) {
    const sideWin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.04), glassMat)
    sideWin.position.set(-0.2, 1.44, sz)
    g.add(sideWin)
  }

  // bumpers, headlights and tail lights
  const bumperMat = M('#20262E', { roughness: 0.5, metalness: 0.4 })
  for (const bx of [2.05, -2.05]) {
    const bump = new THREE.Mesh(roundedBox(0.22, 0.34, 1.86, 0.06), bumperMat)
    bump.position.set(bx, 0.52, 0)
    g.add(bump)
  }
  for (const lz of [-0.62, 0.62]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.32), new THREE.MeshBasicMaterial({ color: '#FFF7D6', toneMapped: false }))
    hl.position.set(2.08, 0.78, lz)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: '#E4453A', toneMapped: false }))
    tl.position.set(-2.08, 0.8, lz)
    g.add(tl)
  }
  // light bar
  const bar = new THREE.Mesh(roundedBox(1.0, 0.16, 0.5, 0.04), M('#2B3038'))
  bar.position.set(-0.2, 1.86, 0)
  g.add(bar)
  const lampR = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.44), new THREE.MeshBasicMaterial({ color: '#FF3B3B', toneMapped: false }))
  lampR.position.set(-0.45, 1.87, 0)
  const lampB = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.44), new THREE.MeshBasicMaterial({ color: '#3B6BFF', toneMapped: false }))
  lampB.position.set(0.05, 1.87, 0)
  g.add(lampR, lampB)
  // POLICE lettering
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.3),
    signFace((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#1B3B7A'
      ctx.font = 'bold 92px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('POLICE', w / 2, h / 2)
    }, 512, 96)
  )
  decal.position.set(-0.1, 0.95, 0.94)
  g.add(decal)
  const decal2 = decal.clone()
  decal2.position.z = -0.94
  decal2.rotation.y = Math.PI
  g.add(decal2)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 2.2, x + 2.2, z - 1.1, z + 1.1, 1.9)
  return { group: g, lampR, lampB }
}

export function barricade(world, { x, z, rotY = 0 }) {
  const g = new THREE.Group()
  const stripe = makeCanvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#E8E6E1'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#D9541E'
    for (let i = -h; i < w; i += 44) {
      ctx.beginPath()
      ctx.moveTo(i, 0); ctx.lineTo(i + 22, 0); ctx.lineTo(i + 22 + h, h); ctx.lineTo(i + h, h)
      ctx.closePath(); ctx.fill()
    }
  })
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 0.07), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.8 }))
  board.position.y = 0.82
  board.castShadow = true
  g.add(board)
  for (const lx of [-0.8, 0.8]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.5), M('#B8B4AE'))
    leg.position.set(lx, 0.48, 0)
    g.add(leg)
  }
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 1, x + 1, z - 0.3, z + 0.3, 1)
  return g
}

// Traffic cone — cheap, and reads as "roadworks" instantly.
export function cones(world, points) {
  const geo = new THREE.ConeGeometry(0.2, 0.6, 10)
  const inst = new THREE.InstancedMesh(geo, M('#E4572E'), points.length)
  const base = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.05, 0.36), M('#2B2B2B'), points.length)
  const d = new THREE.Object3D()
  points.forEach(([x, z], i) => {
    d.position.set(x, 0.3, z)
    d.updateMatrix()
    inst.setMatrixAt(i, d.matrix)
    d.position.set(x, 0.025, z)
    d.updateMatrix()
    base.setMatrixAt(i, d.matrix)
  })
  inst.instanceMatrix.needsUpdate = true
  base.instanceMatrix.needsUpdate = true
  inst.castShadow = true
  world.scene.add(inst, base)
  return inst
}
