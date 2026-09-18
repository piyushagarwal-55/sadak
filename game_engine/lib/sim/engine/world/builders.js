import * as THREE from 'three'
import { makeCanvasTexture, normalizeToSize } from '../core/util.js'

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o })

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// Rectangular shop interior: floor, ceiling, 4 walls with a centered door gap on
// the +Z (south) wall. Registers wall colliders and sets world.bounds.
export function buildRoom(world, { w, d, h = 4.4, floorColor = '#c9b8a4', floorTexture = null, wallColor = '#e8e0d4', ceilColor = '#f4f1ec', doorW = 3.2 }) {
  const scene = world.scene

  const floorMat = floorTexture
    ? new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 })
    : std(floorColor, { roughness: 0.9 })
  const floor = mesh(new THREE.PlaneGeometry(w, d), floorMat)
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  const ceil = mesh(new THREE.PlaneGeometry(w, d), std(ceilColor))
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = h
  scene.add(ceil)

  const wallMat = std(wallColor)
  const T = 0.3
  // north
  scene.add(mesh(new THREE.BoxGeometry(w, h, T), wallMat, 0, h / 2, -d / 2))
  world.addCollider(-w / 2, w / 2, -d / 2 - T / 2, -d / 2 + T / 2, h)
  // east / west
  scene.add(mesh(new THREE.BoxGeometry(T, h, d), wallMat, w / 2, h / 2, 0))
  world.addCollider(w / 2 - T / 2, w / 2 + T / 2, -d / 2, d / 2, h)
  scene.add(mesh(new THREE.BoxGeometry(T, h, d), wallMat, -w / 2, h / 2, 0))
  world.addCollider(-w / 2 - T / 2, -w / 2 + T / 2, -d / 2, d / 2, h)
  // south, split around the door
  const segW = (w - doorW) / 2
  for (const sx of [-(doorW / 2 + segW / 2), doorW / 2 + segW / 2]) {
    scene.add(mesh(new THREE.BoxGeometry(segW, h, T), wallMat, sx, h / 2, d / 2))
    world.addCollider(sx - segW / 2, sx + segW / 2, d / 2 - T / 2, d / 2 + T / 2, h)
  }
  // lintel above the door
  scene.add(mesh(new THREE.BoxGeometry(doorW, h - 3, T), wallMat, 0, 3 + (h - 3) / 2, d / 2))
  // invisible blocker across the doorway — exits happen via the E interactable,
  // and this keeps the follow-camera from slipping outside through the gap
  world.addCollider(-doorW / 2, doorW / 2, d / 2 - T / 2, d / 2 + T / 2, h)
  // glowing doorway backdrop so the gap reads as a way out, not a hole
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(doorW, 3), new THREE.MeshBasicMaterial({ color: '#cfe3f7' }))
  glow.position.set(0, 1.5, d / 2 + 0.16)
  glow.rotation.y = Math.PI
  scene.add(glow)

  // EXIT sign over the gap (inside)
  const exitTex = makeCanvasTexture(256, 80, (ctx, cw, ch) => {
    ctx.fillStyle = '#14532d'
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = '#86efac'
    ctx.font = 'bold 48px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('EXIT →', cw / 2, ch / 2)
  })
  const exitSign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: exitTex }))
  exitSign.position.set(0, 2.75, d / 2 - 0.2)
  exitSign.rotation.y = Math.PI
  scene.add(exitSign)

  world.bounds = { minX: -w / 2 + 0.35, maxX: w / 2 - 0.35, minZ: -d / 2 + 0.35, maxZ: d / 2 - 0.35 }
}

// Free-standing display shelf; products laid across its tiers, clickable.
export function shelf(world, { x, z, rotY = 0, w = 3.6, color = '#7c5a3a', tiers = [0.55, 1.25], products = [] }) {
  const g = new THREE.Group()
  const mat = std(color)
  const D = 0.55
  for (const sx of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.12, 1.85, D), mat, sx, 0.925, 0))
  g.add(mesh(new THREE.BoxGeometry(w, 1.85, 0.07), mat, 0, 0.925, -D / 2 + 0.035))
  g.add(mesh(new THREE.BoxGeometry(w + 0.12, 0.07, D), mat, 0, 1.85, 0))
  for (const ty of tiers) g.add(mesh(new THREE.BoxGeometry(w, 0.07, D), mat, 0, ty, 0))

  const perTier = Math.ceil(products.length / tiers.length)
  products.forEach((p, i) => {
    const tier = tiers[Math.floor(i / perTier)]
    const slot = i % perTier
    const usable = w - 1.0
    const px = perTier === 1 ? 0 : -usable / 2 + (slot * usable) / (perTier - 1)
    const model = normalizeToSize(p.build(), 0.48)
    model.position.x = px
    model.position.y += tier + 0.035
    model.position.z = 0.05
    world.registerClickable(model, p)
    g.add(model)
  })

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.colliderFromObject(g, 1.9)
  return g
}

// Round display table with products on top.
export function displayTable(world, { x, z, r = 1, color = '#8a6d4f', products = [] }) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(r, r, 0.08, 24), std(color), 0, 0.92, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.92, 12), std(color), 0, 0.46, 0))
  products.forEach((p, i) => {
    const model = normalizeToSize(p.build(), 0.42)
    const a = (i / Math.max(products.length, 1)) * Math.PI * 2
    const rad = products.length > 1 ? r * 0.5 : 0
    model.position.x = Math.cos(a) * rad
    model.position.z = Math.sin(a) * rad
    model.position.y += 0.96
    world.registerClickable(model, p)
    g.add(model)
  })
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.colliderFromObject(g, 1.0)
  return g
}

// Cashier desk: counter + register; proximity interactable opens checkout.
export function cashierDesk(world, { x, z, rotY = 0, color = '#3f4a5f' }) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(2.6, 1.02, 0.9), std(color), 0, 0.51, 0))
  g.add(mesh(new THREE.BoxGeometry(2.8, 0.07, 1.05), std('#d9d2c5'), 0, 1.06, 0))
  // register + screen
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.3, 0.35), std('#1f2937'), 0.75, 1.25, 0))
  const scrTex = makeCanvasTexture(128, 96, (ctx, cw, ch) => {
    ctx.fillStyle = '#052e16'
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = '#4ade80'
    ctx.font = 'bold 44px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('₹', cw / 2, ch / 2)
  })
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.26), new THREE.MeshBasicMaterial({ map: scrTex }))
  scr.position.set(0.75, 1.28, 0.19)
  scr.rotation.x = -0.15
  g.add(scr)
  // card reader
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.18, 0.12), std('#475569'), -0.6, 1.18, 0.25))

  // hanging CHECKOUT sign
  const signTex = makeCanvasTexture(512, 128, (ctx, cw, ch) => {
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = '#fbbf24'
    ctx.font = 'bold 64px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('CHECKOUT', cw / 2, ch / 2)
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }))
  sign.position.set(0, 2.4, 0)
  g.add(sign)

  g.position.set(x, 0, z)
  g.rotation.y = rotY
  world.scene.add(g)
  world.colliderFromObject(g, 1.1)

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

// Glowing AR wall screen; interacting opens the AR viewer for the shop's
// featured product (or the last product the player looked at).
export function arWall(world, { x, z, rotY = 0, w = 4.5, h = 2.5, tagline = 'See products in your space' }) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.14), std('#0f172a', { roughness: 0.4 })))
  const tex = makeCanvasTexture(1024, 576, (ctx, cw, ch) => {
    const grad = ctx.createLinearGradient(0, 0, cw, ch)
    grad.addColorStop(0, '#0e7490')
    grad.addColorStop(0.5, '#1e1b4b')
    grad.addColorStop(1, '#7e22ce')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, cw, ch)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97) % cw
      const sy = (i * 173) % ch
      ctx.fillRect(sx, sy, 3, 3)
    }
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 110px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('AR WALL', cw / 2, ch / 2 - 30)
    ctx.font = '44px ui-sans-serif, system-ui'
    ctx.fillStyle = '#c7d2fe'
    ctx.fillText(tagline, cw / 2, ch / 2 + 60)
    ctx.font = '36px ui-sans-serif, system-ui'
    ctx.fillStyle = '#67e8f9'
    ctx.fillText('walk up & press E', cw / 2, ch / 2 + 130)
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }))
  screen.position.z = 0.08
  g.add(screen)
  g.position.set(x, 1.62, z)
  g.rotation.y = rotY
  world.scene.add(g)

  const fx = x + Math.sin(rotY) * 1.5
  const fz = z + Math.cos(rotY) * 1.5
  world.addInteractable({
    pos: () => ({ x: fx, z: fz }),
    radius: 2.4,
    label: 'Use AR Wall (E)',
    action: (game) => game.openARWall(),
  })
  return g
}

// Canvas-texture signboard plane (shop names etc.).
export function signPlane({ text, w = 6, h = 1.3, bg = '#b45309', fg = '#fff7ed', sub = '' }) {
  const tex = makeCanvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, cw, ch)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 8
    ctx.strokeRect(10, 10, cw - 20, ch - 20)
    ctx.fillStyle = fg
    ctx.font = `bold ${sub ? 96 : 110}px ui-sans-serif, system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, cw / 2, sub ? ch / 2 - 24 : ch / 2)
    if (sub) {
      ctx.font = '44px ui-sans-serif, system-ui'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(sub, cw / 2, ch / 2 + 62)
    }
  })
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }))
}

// Potted plant decor.
export function plant(world, { x, z, scale = 1 }) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 12), std('#9a3412'), 0, 0.175, 0))
  g.add(mesh(new THREE.SphereGeometry(0.32, 12, 10), std('#16a34a'), 0, 0.62, 0))
  g.add(mesh(new THREE.SphereGeometry(0.22, 10, 8), std('#22c55e'), 0.14, 0.82, 0.06))
  g.scale.setScalar(scale)
  g.position.set(x, 0, z)
  world.scene.add(g)
  world.colliderFromObject(g, 0.9)
  return g
}
