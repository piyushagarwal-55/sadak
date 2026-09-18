import * as THREE from 'three'
import { MATERIAL } from './materials.js'
import { roundedBox, flutedWall } from './forms.js'
import { PALETTE } from '../../core/design.js'
import { makeCanvasTexture, normalizeToSize } from '../../core/util.js'

const S = PALETTE.sole

// High-end retail fixtures. Everything here assumes scene.environment is set
// (SoleFlagship declares envKind), because the brass and glass depend on
// image-based lighting to read as metal rather than plastic.

// ---------- the signature fixture: an illuminated shoe wall ----------
//
// 8 bays x 5 rows of lit niches. The niche shells are one InstancedMesh and the
// LED lips are another, so the whole wall costs 2 draw calls plus the shoes.
export function shoeWall(world, { x, z, rotY = 0, bays = 8, rows = 5, bayW = 0.9, rowH = 0.34, products = [] }) {
  const g = new THREE.Group()
  const width = bays * bayW
  const height = rows * (rowH + 0.28) + 0.4

  // back panel
  const back = new THREE.Mesh(roundedBox(width + 0.3, height, 0.12, 0.02), MATERIAL.microCement(S.plaster, 2))
  back.position.y = height / 2
  back.receiveShadow = true
  g.add(back)

  const count = bays * rows
  const shelfGeo = roundedBox(bayW - 0.06, 0.035, 0.34, 0.008)
  const shelves = new THREE.InstancedMesh(shelfGeo, MATERIAL.brushedBrass(), count)
  const lipGeo = new THREE.BoxGeometry(bayW - 0.1, 0.012, 0.02)
  const lips = new THREE.InstancedMesh(lipGeo, MATERIAL.ledStrip('#FFF0D2'), count)
  // vertical dividers between bays
  const divGeo = roundedBox(0.03, height - 0.5, 0.34, 0.008)
  const divs = new THREE.InstancedMesh(divGeo, MATERIAL.brushedBrass(), bays + 1)

  const d = new THREE.Object3D()
  let i = 0
  const slots = []
  for (let r = 0; r < rows; r++) {
    const y = 0.42 + r * (rowH + 0.28)
    for (let b = 0; b < bays; b++) {
      const bx = -width / 2 + bayW * (b + 0.5)
      d.position.set(bx, y, 0.18)
      d.rotation.set(0, 0, 0)
      d.updateMatrix()
      shelves.setMatrixAt(i, d.matrix)
      // LED lip sits at the top of each niche, washing light down over the shoe
      d.position.set(bx, y + rowH + 0.2, 0.3)
      d.updateMatrix()
      lips.setMatrixAt(i, d.matrix)
      slots.push({ x: bx, y, z: 0.2 })
      i++
    }
  }
  for (let b = 0; b <= bays; b++) {
    d.position.set(-width / 2 + bayW * b, height / 2, 0.18)
    d.updateMatrix()
    divs.setMatrixAt(b, d.matrix)
  }
  shelves.instanceMatrix.needsUpdate = true
  lips.instanceMatrix.needsUpdate = true
  divs.instanceMatrix.needsUpdate = true
  shelves.castShadow = true
  g.add(shelves, lips, divs)

  // shoes, tilted 12° up — the standard retail presentation angle
  products.forEach((p, idx) => {
    const slot = slots[idx % slots.length]
    // low-detail build + no shadow casting: these sit inside lit niches, so they
    // gain nothing from shadows and cost a full extra pass each if they cast.
    const model = normalizeToSize(p.build({ detail: 'low' }), 0.28)
    model.position.set(slot.x, slot.y + 0.05, slot.z)
    model.rotation.x = -0.21
    model.rotation.y = 0.35
    model.traverse((o) => (o.castShadow = false))
    world.registerClickable(model, p)
    g.add(model)
  })

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(
    x - Math.abs(Math.cos(rotY)) * width / 2 - 0.3,
    x + Math.abs(Math.cos(rotY)) * width / 2 + 0.3,
    z - Math.abs(Math.sin(rotY)) * width / 2 - 0.3,
    z + Math.abs(Math.sin(rotY)) * width / 2 + 0.3,
    height
  )
  return g
}

// ---------- hero plinth ----------
export function plinth(world, { x, z, h = 0.45, r = 0.55, product = null, spot = true, shadow = true }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(roundedBox(r * 2, h, r * 2, 0.04), MATERIAL.walnut(1))
  body.position.y = h / 2
  body.castShadow = body.receiveShadow = true
  g.add(body)
  // brass toe-kick reflects the floor and lifts the mass visually
  const kick = new THREE.Mesh(new THREE.BoxGeometry(r * 2 - 0.06, 0.05, r * 2 - 0.06), MATERIAL.brushedBrass())
  kick.position.y = 0.025
  g.add(kick)

  if (product) {
    const m = normalizeToSize(product.build(), 0.42)
    m.position.set(0, h + 0.02, 0)
    m.rotation.y = 0.6
    world.registerClickable(m, product)
    g.add(m)
    g.userData.hero = m
  }
  if (spot) {
    const light = new THREE.SpotLight('#FFF4E2', 130, 9, 0.45, 0.62, 1.4)
    light.position.set(x, 4.4, z)
    light.target.position.set(x, h, z)
    light.castShadow = shadow
    if (shadow) light.shadow.mapSize.set(1024, 1024)
    world.scene.add(light, light.target)
  }
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.addCollider(x - r, x + r, z - r, z + r, h + 0.4)
  return g
}

// ---------- glass display case for grails / collabs ----------
export function vitrine(world, { x, z, rotY = 0, product = null, label = 'ARCHIVE' }) {
  const g = new THREE.Group()
  const base = new THREE.Mesh(roundedBox(1.0, 0.85, 0.7, 0.03), MATERIAL.walnut(1))
  base.position.y = 0.425
  base.castShadow = true
  g.add(base)

  // four brass corner posts + glass box
  for (const [sx, sz] of [[-0.46, -0.31], [0.46, -0.31], [-0.46, 0.31], [0.46, 0.31]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.03), MATERIAL.brushedBrass())
    post.position.set(sx, 1.3, sz)
    g.add(post)
  }
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.9, 0.64), MATERIAL.glassPanel())
  glass.position.y = 1.3
  g.add(glass)
  const cap = new THREE.Mesh(roundedBox(1.02, 0.05, 0.72, 0.015), MATERIAL.brushedBrass())
  cap.position.y = 1.78
  g.add(cap)

  if (product) {
    const m = normalizeToSize(product.build(), 0.3)
    m.position.set(0, 0.88, 0)
    m.rotation.y = -0.5
    world.registerClickable(m, product)
    g.add(m)
  }

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.11),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(512, 112, (ctx, w, h) => {
        ctx.fillStyle = '#1A1512'
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = S.brass
        ctx.font = 'bold 52px ui-sans-serif, system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.letterSpacing = '10px'
        ctx.fillText(label, w / 2, h / 2)
      }),
      transparent: true,
    })
  )
  plate.position.set(0, 0.62, 0.36)
  g.add(plate)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.addCollider(x - 0.55, x + 0.55, z - 0.4, z + 0.4, 1.8)
  return g
}

// ---------- seating: where people actually try shoes on ----------
export function benchSeat(world, { x, z, rotY = 0, w = 2.4 }) {
  const g = new THREE.Group()
  const cushion = new THREE.Mesh(roundedBox(w, 0.22, 0.7, 0.09), MATERIAL.knitFabric('#2F2A26'))
  cushion.position.y = 0.46
  cushion.castShadow = true
  g.add(cushion)
  const frame = new THREE.Mesh(roundedBox(w - 0.12, 0.1, 0.6, 0.03), MATERIAL.walnut(1))
  frame.position.y = 0.33
  g.add(frame)
  for (const lx of [-w / 2 + 0.2, w / 2 - 0.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.5), MATERIAL.brushedBrass())
    leg.position.set(lx, 0.15, 0)
    g.add(leg)
  }
  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.colliderFromObject(g, 0.7)
  return g
}

export function stool(world, { x, z }) {
  const g = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 18), MATERIAL.knitFabric('#3A322C'))
  seat.position.y = 0.5
  seat.castShadow = true
  g.add(seat)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), MATERIAL.brushedBrass())
    leg.position.set(Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15)
    leg.rotation.set(Math.cos(a) * 0.09, 0, -Math.sin(a) * 0.09)
    g.add(leg)
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 18), MATERIAL.brushedBrass())
  rail.rotation.x = Math.PI / 2
  rail.position.y = 0.16
  g.add(rail)
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.addCollider(x - 0.24, x + 0.24, z - 0.24, z + 0.24, 0.6)
  return g
}

// ---------- fluted feature wall ----------
export function featureWall(world, { x, z, rotY = 0, width, height }) {
  const w = flutedWall(MATERIAL.microCement(S.plaster, 1), { width, height, fluteWidth: 0.18, depth: 0.05 })
  w.position.set(x, height / 2, z)
  w.rotation.y = rotY
  world.scene.add(w)
  return w
}

// ---------- cashier monolith ----------
export function cashierMonolith(world, { x, z, rotY = 0 }) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(roundedBox(2.8, 1.06, 0.9, 0.04), MATERIAL.walnut(2))
  body.position.y = 0.53
  body.castShadow = body.receiveShadow = true
  g.add(body)
  const top = new THREE.Mesh(roundedBox(2.94, 0.06, 1.02, 0.02), MATERIAL.terrazzo(2))
  top.position.y = 1.09
  g.add(top)
  const kick = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 0.86), MATERIAL.brushedBrass())
  kick.position.y = 0.03
  g.add(kick)

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.26),
    new THREE.MeshBasicMaterial({
      map: makeCanvasTexture(512, 128, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = '#C9A227'
        ctx.font = 'bold 74px ui-sans-serif, system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.letterSpacing = '14px'
        ctx.fillText('PAY', w / 2, h / 2)
      }),
      transparent: true,
      toneMapped: false,
    })
  )
  sign.position.set(0, 2.3, 0)
  g.add(sign)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.colliderFromObject(g, 1.15)

  const fx = x + Math.sin(rotY) * 1.7
  const fz = z + Math.cos(rotY) * 1.7
  world.addInteractable({
    pos: () => ({ x: fx, z: fz }),
    radius: 2.2,
    label: 'Pay at counter (E)',
    action: (game) => game.openCheckout(true),
  })
  return g
}
