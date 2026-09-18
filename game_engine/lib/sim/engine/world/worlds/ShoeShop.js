import * as THREE from 'three'
import { BaseWorld } from '../BaseWorld.js'
import { mesh } from '../builders.js'
import { NPC } from '../NPC.js'
import { Mirror } from '../../systems/Mirror.js'
import { makeCanvasTexture, normalizeToSize } from '../../core/util.js'
import { buildStaff } from '../../data/staff.js'
import { bySection, SHOES, shoeBox, boxStack, buildPair, buildPairLite } from '../../data/shoes.js'
import { fetchCampusProducts, proxiedImage, formatINR } from '../../systems/Campus.js'

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o })
const emis = (c) => new THREE.MeshBasicMaterial({ color: c })

// ============================================================================
// POUNCE FOOTWEAR — a premium, spacious sneaker boutique.
// Designed like a real retail floor (Rockstar-style breathing room): one big
// hall, wide central aisle, departments defined by matte-black steel shelving
// along the perimeter, a spotlit feature island, a few uncluttered center
// tables, a customer lounge, a foot-scanner, a private fitting-room corridor,
// a staff-only stockroom, and a premium checkout. Warm commercial lighting,
// natural wood floors, white walls, concrete columns. No clutter, no RGB.
// ============================================================================
export class ShoeShop extends BaseWorld {
  constructor(game) {
    super(game)
    this.key = 'fashion'
    this.title = 'POUNCE Footwear'
    this.camDist = 6.4

    // dimensions of the hall
    this.W = 44
    this.D = 34
    this.H = 5.0

    this.scene.background = new THREE.Color('#e9ecf1')
    this.scene.fog = new THREE.Fog('#e9ecf1', 42, 90)

    this.ledStrips = []
    this.spins = []
    this.presentation = null
    this.anim = { fans: [], cam: null, screens: [], queue: null, drawer: null }
    this.doors = []
    this._ann = 12 + Math.random() * 20 // seconds to next PA announcement

    this.buildLighting()
    this.buildArchitecture()
    this.buildDepartments()
    this.buildFeatureIsland()
    this.buildDisplayTables()
    this.buildLounge()
    this.buildFootScanner()
    this.buildTrialWing()
    this.buildCheckout()
    this.buildStockRoom()
    this.buildSignage()
    this.buildStaffMembers()
    this.buildCampusWall()
    this.buildAnimatedProps()
    this.buildCustomers()

    // exit back to the plaza (the entrance doubles as the exit)
    this.addInteractable({
      pos: () => ({ x: 0, z: this.D / 2 - 1.6 }),
      radius: 1.6,
      label: 'Leave shop (E)',
      action: (g) => g.switchWorld('outdoor', 'fashion'),
    })

    this.featuredProduct = SHOES.find((s) => s.id === 'velocity-pro') || SHOES[0]
  }

  // ---------------------------------------------------------------- lighting
  buildLighting() {
    // Bright, even, warm — commercial not cinematic-dark. Emissive ceiling
    // panels do the visual heavy lifting; a few soft point lights add warmth.
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#d5d9e0', 1.05))
    this.scene.add(new THREE.AmbientLight('#fff6ea', 0.45))
    const win = new THREE.DirectionalLight('#fff2df', 0.7) // daylight from the storefront
    win.position.set(0, 10, 22)
    this.scene.add(win)
    for (const [x, z] of [[-12, 8], [12, 8], [-12, -6], [12, -6], [0, 0], [0, -13]]) {
      const pt = new THREE.PointLight('#fff2df', 0.3, 26)
      pt.position.set(x, 4.4, z)
      this.scene.add(pt)
    }
  }

  // ------------------------------------------------------------ architecture
  buildArchitecture() {
    const W = this.W, D = this.D, H = this.H, T = 0.35

    // ---- wood floor with a darker inlaid border ----
    const floorTex = this.woodTexture()
    const floor = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.04 }))
    floor.rotation.x = -Math.PI / 2
    this.scene.add(floor)
    // concrete perimeter strip framing the wood
    for (const [w, d, x, z] of [[W, 1.2, 0, -D / 2 + 0.6], [W, 1.2, 0, D / 2 - 0.6], [1.2, D, -W / 2 + 0.6, 0], [1.2, D, W / 2 - 0.6, 0]]) {
      const strip = mesh(new THREE.PlaneGeometry(w, d), std('#cfd3da', { roughness: 0.95 }))
      strip.rotation.x = -Math.PI / 2
      strip.position.set(x, 0.012, z)
      this.scene.add(strip)
    }

    // ---- ceiling: white with a coffered grid + recessed light panels ----
    const ceil = mesh(new THREE.PlaneGeometry(W, D), std('#f4f6f9'))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = H
    this.scene.add(ceil)
    // recessed glowing panels in a grid
    for (let gx = -14; gx <= 14; gx += 7) {
      for (let gz = -12; gz <= 12; gz += 6) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.4), emis('#fff6ea'))
        panel.rotation.x = Math.PI / 2
        panel.position.set(gx, H - 0.03, gz)
        this.scene.add(panel)
        this.ledStrips.push(panel)
      }
    }
    // shallow coffer beams
    const beamMat = std('#eceef2')
    for (let gx = -17.5; gx <= 17.5; gx += 7) this.scene.add(mesh(new THREE.BoxGeometry(0.25, 0.3, D), beamMat, gx, H - 0.15, 0))

    // ---- walls: white textured; concrete accent base ----
    const wallMat = std('#f2f4f7', { roughness: 0.96 })
    const concrete = std('#c6cad2', { roughness: 0.98 })
    const addWall = (w, d, x, z) => {
      this.scene.add(mesh(new THREE.BoxGeometry(w, H, d), wallMat, x, H / 2, z))
      this.scene.add(mesh(new THREE.BoxGeometry(w + 0.02, 0.5, d + 0.02), concrete, x, 0.25, z)) // concrete skirting
    }
    addWall(W, T, 0, -D / 2) // north (back)
    this.addCollider(-W / 2, W / 2, -D / 2 - T / 2, -D / 2 + T / 2, H)
    addWall(T, D, -W / 2, 0) // west
    this.addCollider(-W / 2 - T / 2, -W / 2 + T / 2, -D / 2, D / 2, H)
    addWall(T, D, W / 2, 0) // east
    this.addCollider(W / 2 - T / 2, W / 2 + T / 2, -D / 2, D / 2, H)

    // ---- glass storefront (south / +Z) with an automatic-door gap ----
    this.buildStorefront()

    // ---- concrete structural columns for scale/realism ----
    for (const [x, z] of [[-11, 6], [11, 6], [-11, -8], [11, -8]]) {
      const col = mesh(new THREE.CylinderGeometry(0.35, 0.4, H, 20), concrete, x, H / 2, z)
      this.scene.add(col)
      this.addCollider(x - 0.4, x + 0.4, z - 0.4, z + 0.4, H)
    }

    this.bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.5, maxZ: D / 2 - 0.5 }
  }

  buildStorefront() {
    const W = this.W, D = this.D, H = this.H, T = 0.35
    const z = D / 2
    const doorW = 6
    const glassMat = new THREE.MeshStandardMaterial({ color: '#dcecf5', transparent: true, opacity: 0.2, roughness: 0.15, metalness: 0, emissive: '#c7e2ef', emissiveIntensity: 0.28, depthWrite: false })
    const mullion = std('#0d1014', { metalness: 0.5, roughness: 0.4 })
    const segW = (W - doorW) / 2
    // glass side panels with mullion frames
    for (const sx of [-(doorW / 2 + segW / 2), doorW / 2 + segW / 2]) {
      this.scene.add(mesh(new THREE.BoxGeometry(segW, H - 0.6, 0.08), glassMat, sx, (H - 0.6) / 2 + 0.3, z - 0.18))
      this.addCollider(sx - segW / 2, sx + segW / 2, z - T, z + T, H)
      // vertical mullions
      for (let mx = sx - segW / 2; mx <= sx + segW / 2 + 0.01; mx += segW / 3) this.scene.add(mesh(new THREE.BoxGeometry(0.08, H - 0.6, 0.12), mullion, mx, (H - 0.6) / 2 + 0.3, z - 0.14))
      // sill + head rail
      this.scene.add(mesh(new THREE.BoxGeometry(segW, 0.3, 0.3), std('#c6cad2'), sx, 0.15, z - 0.14))
      this.scene.add(mesh(new THREE.BoxGeometry(segW, 0.25, 0.25), mullion, sx, H - 0.4, z - 0.14))
    }
    // header + lintel above the door
    this.scene.add(mesh(new THREE.BoxGeometry(W, 0.6, T), std('#eceef2'), 0, H - 0.3, z))
    // automatic sliding glass doors (two leaves) — slide open near the player
    for (const sx of [-1.4, 1.4]) {
      const leaf = new THREE.Group()
      leaf.add(mesh(new THREE.BoxGeometry(2.6, H - 1.0, 0.08), glassMat, 0, (H - 1.0) / 2 + 0.3, 0))
      leaf.add(mesh(new THREE.BoxGeometry(2.7, 0.12, 0.12), mullion, 0, H - 0.7, 0))
      leaf.position.set(sx, 0, z - 0.2)
      this.scene.add(leaf)
      this.doors.push({ leaf, closedX: sx, openX: sx + Math.sign(sx) * 2.5 })
    }
    // interior blocker so the follow-cam can't slip through the doorway
    this.addCollider(-doorW / 2, doorW / 2, z - 0.28, z - 0.08, H)
    // welcome mat + threshold
    const mat = mesh(new THREE.PlaneGeometry(4.2, 1.8), std('#14171c'), 0, 0.02, z - 2.2)
    mat.rotation.x = -Math.PI / 2
    this.scene.add(mat)
    this.scene.add(this.textPlane('WELCOME', { w: 3, h: 0.5, bg: '#14171c', fg: '#f8fafc', x: 0, y: 0.03, z: z - 2.2, flat: true }))
    // illuminated logo over the door (inside)
    const logo = this.textPlane('POUNCE FOOTWEAR', { w: 7.5, h: 0.7, bg: '#0b0d11', fg: '#ffffff' })
    logo.position.set(0, H - 0.28, z - 0.34)
    logo.rotation.y = Math.PI
    this.scene.add(logo)

    // ---- unmistakable EXIT gate (readable from anywhere inside) ----
    const frameMat = std('#0b0d11', { roughness: 0.5 })
    // full-height dark door frame (posts to the ceiling + top lintel)
    for (const sx of [-(doorW / 2 + 0.25), doorW / 2 + 0.25]) this.scene.add(mesh(new THREE.BoxGeometry(0.5, H - 0.5, 0.68), frameMat, sx, (H - 0.5) / 2, z - 0.42))
    this.scene.add(mesh(new THREE.BoxGeometry(doorW + 1.0, 0.5, 0.68), frameMat, 0, H - 0.75, z - 0.42))
    // tall green glowing portal filling the whole doorway = the way out
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(doorW + 0.1, H - 0.9), new THREE.MeshBasicMaterial({ color: '#16a34a', transparent: true, opacity: 0.32, toneMapped: false }))
    portal.position.set(0, (H - 0.9) / 2, z - 0.5)
    portal.rotation.y = Math.PI
    this.scene.add(portal)
    // WAY OUT band across the top of the portal
    const wayout = this.textPlane('◄  WAY OUT  ►', { w: 3.6, h: 0.46, bg: '#166534', fg: '#bbf7d0' })
    wayout.position.set(0, H - 1.4, z - 0.46)
    wayout.rotation.y = Math.PI
    this.scene.add(wayout)
    // green chevron floor runner guiding to the door
    const arrowTex = makeCanvasTexture(128, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(34,197,94,0.9)'
      for (let i = 0; i < 3; i++) {
        const cy = 380 - i * 150
        ctx.beginPath()
        ctx.moveTo(w / 2, cy - 55); ctx.lineTo(w / 2 + 44, cy); ctx.lineTo(w / 2 + 20, cy)
        ctx.lineTo(w / 2, cy - 26); ctx.lineTo(w / 2 - 20, cy); ctx.lineTo(w / 2 - 44, cy)
        ctx.closePath(); ctx.fill()
      }
    })
    const arrows = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 4.0), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, toneMapped: false }))
    arrows.rotation.x = -Math.PI / 2
    arrows.position.set(0, 0.03, z - 4)
    this.scene.add(arrows)
  }

  // ------------------------------------------------------ perimeter shelving
  // One tall matte-black category unit. Waist-height to near ceiling: backlit
  // brand header, upper display shelves (a couple of lite pairs + price tags),
  // lower rows of aligned shoe boxes. LED strip under each shelf.
  buildWallUnit({ x, z, ry, w, label, products, accent = '#e11d48' }) {
    const g = new THREE.Group()
    const H = this.H - 0.6
    const D = 0.62
    const steel = std('#15181d', { roughness: 0.5, metalness: 0.2 })
    // cabinet back + sides + a warm backlit brand panel up top
    g.add(mesh(new THREE.BoxGeometry(w, H, 0.08), steel, 0, H / 2, -D / 2))
    const brand = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, 1.0), emis('#f7ead2'))
    brand.position.set(0, H - 0.7, -D / 2 + 0.05)
    g.add(brand)
    const header = this.textPlane(label, { w: Math.min(w - 0.6, 5), h: 0.44, bg: '#0b0d11', fg: accent })
    header.position.set(0, H - 0.7, -D / 2 + 0.07)
    g.add(header)
    for (const sx of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.08, H, D), steel, sx, H / 2, 0))

    // display shelves (upper) + box rows (lower)
    const displayTiers = [H - 1.6, H - 2.4]
    const boxTiers = [0.95, 1.55]
    for (const ty of [...displayTiers, ...boxTiers]) {
      g.add(mesh(new THREE.BoxGeometry(w, 0.05, D), std('#0d0f13', { metalness: 0.3, roughness: 0.4 }), 0, ty, 0))
      const led = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.025, 0.025), emis('#ffffff'))
      led.position.set(0, ty + 0.045, D / 2 - 0.06)
      g.add(led)
    }
    const palette = products.length ? products.flatMap((p) => p.colors.map((c) => c.hex)) : ['#c2410c', '#1e293b', '#64748b']
    // upper display: a couple of hero pairs, well spaced
    displayTiers.forEach((ty, ti) => {
      const picks = products.slice(ti * 2, ti * 2 + 2)
      const slots = 3
      for (let s = 0; s < slots; s++) {
        const px = -((slots - 1) / 2) * (w / slots) + s * (w / slots)
        const p = picks[s % Math.max(1, picks.length)]
        if (p && s % 2 === 0) {
          const model = normalizeToSize(buildPairLite(p.spec || { type: 'casual', upper: p.tint, sole: '#f1f5f9', accent }), 0.6)
          model.position.set(px, ty + 0.06, 0.06)
          model.rotation.y = 0.16
          this.registerClickable(model, p)
          g.add(model)
          const tag = this.priceTag(p)
          tag.position.set(px, ty + 0.46, 0.24)
          g.add(tag)
        } else {
          const box = shoeBox(palette[(ti * slots + s) % palette.length], 0.5, 0.2, 0.34)
          box.position.set(px, ty + 0.1, 0.04)
          g.add(box)
        }
      }
    })
    // lower: neatly aligned box rows (the "full inventory")
    boxTiers.forEach((ty, ti) => {
      const n = Math.max(4, Math.round(w / 0.9))
      for (let s = 0; s < n; s++) {
        const px = -((n - 1) / 2) * (w / n) + s * (w / n)
        const box = shoeBox(palette[(ti * n + s) % palette.length], w / n - 0.06, 0.18, 0.36)
        box.position.set(px, ty + 0.1, 0.02)
        g.add(box)
      }
    })

    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.scene.add(g)
    this.colliderFromObject(g, H)
  }

  buildDepartments() {
    const W = this.W, D = this.D
    // west wall (faces +x)
    this.buildWallUnit({ x: -W / 2 + 0.35, z: 9, ry: Math.PI / 2, w: 9, label: 'RUNNING', products: bySection('Running'), accent: '#f97316' })
    this.buildWallUnit({ x: -W / 2 + 0.35, z: -1, ry: Math.PI / 2, w: 9, label: 'TRAINING', products: bySection('Running'), accent: '#22c55e' })
    // back wall (faces +z)
    this.buildWallUnit({ x: -14, z: -D / 2 + 0.35, ry: 0, w: 9, label: 'BASKETBALL', products: bySection('Basketball'), accent: '#dc2626' })
    this.buildWallUnit({ x: -4.5, z: -D / 2 + 0.35, ry: 0, w: 8, label: 'CASUAL', products: bySection('Casual Sneakers'), accent: '#0ea5e9' })
    this.buildWallUnit({ x: 5, z: -D / 2 + 0.35, ry: 0, w: 8, label: 'LUXURY', products: bySection('Luxury'), accent: '#fbbf24' })
    this.buildWallUnit({ x: 14, z: -D / 2 + 0.35, ry: 0, w: 8, label: 'FORMAL', products: bySection('Formal'), accent: '#a16207' })
    // east wall (faces -x)
    this.buildWallUnit({ x: W / 2 - 0.35, z: -1, ry: -Math.PI / 2, w: 9, label: 'ACCESSORIES', products: bySection('Accessories'), accent: '#0ea5e9' })
    this.buildWallUnit({ x: W / 2 - 0.35, z: -11, ry: -Math.PI / 2, w: 9, label: 'OUTDOOR', products: bySection('Outdoor'), accent: '#65a30d' })
    // (east z=+7 reserved for the LIVE Campus wall)
  }

  // --------------------------------------------------------- feature island
  buildFeatureIsland() {
    const g = new THREE.Group()
    // a low, wide premium plinth (rectangular) with 3 hero shoes at 3 heights
    g.add(mesh(new THREE.BoxGeometry(3.6, 0.35, 2.0), std('#14171c', { roughness: 0.4, metalness: 0.25 }), 0, 0.175, 0))
    g.add(mesh(new THREE.BoxGeometry(3.7, 0.05, 2.1), emis('#f7ead2'), 0, 0.37, 0))
    const heroes = [SHOES.find((s) => s.id === 'monogram-runner'), SHOES.find((s) => s.id === 'court-legend'), SHOES.find((s) => s.id === 'velocity-pro')].filter(Boolean)
    const risers = [[-1.1, 0.55], [0, 0.85], [1.1, 0.55]]
    heroes.forEach((p, i) => {
      const [rx, rh] = risers[i]
      g.add(mesh(new THREE.CylinderGeometry(0.45, 0.5, rh, 28), std('#1b1e24'), rx, 0.37 + rh / 2, 0))
      const model = normalizeToSize(p.buildHero(), 0.9)
      model.position.set(rx, 0.37 + rh, 0)
      model.userData.spin = true
      this.registerClickable(model, p)
      g.add(model)
      this.spins.push(model)
      // spotlight
      const spot = new THREE.SpotLight('#ffffff', 5, 8, 0.5, 0.6)
      spot.position.set(rx, 4.6, 0)
      spot.target.position.set(rx, 1, 0)
      g.add(spot, spot.target)
    })
    // signage
    const sign = this.textPlane('LIMITED EDITION', { w: 2.6, h: 0.44, bg: '#0b0d11', fg: '#fbbf24' })
    sign.position.set(0, 2.5, 0)
    const sign2 = sign.clone()
    sign2.rotation.y = Math.PI
    g.add(sign, sign2)

    g.position.set(0, 0, 8.5)
    this.scene.add(g)
    this.addCollider(-1.9, 1.9, 8.5 - 1.1, 8.5 + 1.1, 0.9)
  }

  // ---------------------------------------------------- center display tables
  displayTable({ x, z, label, products, accent = '#e11d48' }) {
    const g = new THREE.Group()
    // low wood table with a steel base
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 16), std('#15181d', { metalness: 0.3 }), 0, 0.36, 0))
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.1, 1.3), std('#3f2a1e', { roughness: 0.55 }), 0, 0.74, 0))
    g.add(mesh(new THREE.BoxGeometry(2.26, 0.03, 1.36), std('#20242c'), 0, 0.8, 0))
    // a small collection sign on a stand
    const sign = this.textPlane(label, { w: 1.8, h: 0.34, bg: '#0b0d11', fg: accent })
    sign.position.set(0, 1.35, -0.4)
    g.add(sign)
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), std('#0b0d11'), 0, 1.05, -0.4))
    // 3–5 shoes at varied heights with spec plaques
    const items = products.slice(0, 4)
    const spots = [[-0.65, 0], [0.65, 0], [-0.65, 0.02], [0.65, 0.02]]
    items.forEach((p, i) => {
      const rh = i % 2 === 0 ? 0.16 : 0.0
      const [px, pz] = spots[i]
      if (rh > 0) g.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, rh, 20), std('#e7e5e4'), px, 0.8 + rh / 2, pz - 0.28 + (i < 2 ? -0.15 : 0.28)))
      const model = normalizeToSize(buildPair(p.spec || { type: 'casual', upper: p.tint, sole: '#f1f5f9', accent }), 0.5)
      model.position.set(px, 0.8 + rh, pz - 0.28 + (i < 2 ? -0.15 : 0.28))
      model.rotation.y = 0.4
      this.registerClickable(model, p)
      g.add(model)
      const plq = this.specPlaque(p)
      plq.position.set(px, 0.86, pz + 0.35 + (i < 2 ? -0.15 : 0.28))
      plq.rotation.x = -Math.PI / 2.2
      g.add(plq)
    })
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 1.2, x + 1.2, z - 0.8, z + 0.8, 0.85)
    return g
  }

  buildDisplayTables() {
    this.displayTable({ x: -7.5, z: -1, label: 'SUMMER RUNNING', products: bySection('Running'), accent: '#f97316' })
    this.displayTable({ x: 7.5, z: -1, label: 'BEST SELLERS', products: bySection('Casual Sneakers'), accent: '#0ea5e9' })
    this.displayTable({ x: 0, z: -9, label: 'COURT CLASSICS', products: bySection('Basketball'), accent: '#dc2626' })
    // the presentation table Rahul lays shoes on — central, a bit forward
    this.presentBench = new THREE.Group()
    this.presentBench.add(mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 16), std('#15181d', { metalness: 0.3 }), 0, 0.36, 0))
    this.presentBench.add(mesh(new THREE.BoxGeometry(2.4, 0.1, 1.3), std('#3f2a1e', { roughness: 0.55 }), 0, 0.74, 0))
    this.presentBench.add(mesh(new THREE.BoxGeometry(2.46, 0.03, 1.36), std('#20242c'), 0, 0.8, 0))
    this.presentBench.position.set(0, 0, 3)
    this.scene.add(this.presentBench)
    this.addCollider(-1.25, 1.25, 3 - 0.75, 3 + 0.75, 0.85)
    this.presentSlots = [-0.8, 0, 0.8]
  }

  // ------------------------------------------------------------ live campus
  // A premium "New Arrivals · Live" wall of framed real Campus photos with
  // price plaques — mounted on the east-front wall. Populated asynchronously.
  // Live Campus products on freestanding backlit stands, split left & right of
  // the aisle (facing inward) — populated asynchronously.
  async buildCampusWall() {
    const banner = this.textPlane('NEW ARRIVALS · LIVE FROM CAMPUS', { w: 6, h: 0.55, bg: '#e11d48', fg: '#fff1f2' })
    banner.position.set(0, 4.0, 5)
    this.scene.add(banner)
    const status = this.textPlane('loading live collection…', { w: 3.2, h: 0.36, bg: '#0b0d11', fg: '#94a3b8' })
    status.position.set(0, 3.5, 5)
    this.scene.add(status)

    let products = []
    try {
      products = await fetchCampusProducts('running shoes', 8)
    } catch {
      /* offline */
    }
    if (!products.length) {
      status.material.map = this.textPlane('live feed offline', { w: 3.2, h: 0.36, bg: '#0b0d11', fg: '#f87171' }).material.map
      status.material.needsUpdate = true
      return
    }
    status.visible = false
    this.campusProducts = products
    const items = products.slice(0, 6)
    const zs = [8, 4, 0]
    items.slice(0, 3).forEach((p, i) => this.campusStand(-9, zs[i], p, '+x')) // left row faces the aisle
    items.slice(3, 6).forEach((p, i) => this.campusStand(9, zs[i], p, '-x')) // right row faces the aisle
  }

  // one freestanding backlit photo stand (photo faces the aisle)
  campusStand(x, z, p, dir) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.BoxGeometry(0.72, 0.1, 0.5), std('#0b0d11', { metalness: 0.3, roughness: 0.4 }), 0, 0.05, 0))
    g.add(mesh(new THREE.BoxGeometry(1.32, 1.78, 0.1), std('#14171c', { roughness: 0.5 }), 0, 1.45, -0.03))
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.62), emis('#111318'))
    bl.position.set(0, 1.45, 0.025)
    g.add(bl)
    const mat = new THREE.MeshBasicMaterial({ color: '#1f2937' })
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 1.34), mat)
    photo.position.set(0, 1.58, 0.055)
    g.add(photo)
    if (p.image) {
      new THREE.TextureLoader().load(proxiedImage(p.image), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        mat.map = tex
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      }, undefined, () => {})
    }
    this.registerClickable(photo, p)
    const head = this.textPlane('CAMPUS · LIVE', { w: 1.05, h: 0.22, bg: '#e11d48', fg: '#ffffff' })
    head.position.set(0, 2.44, 0.06)
    g.add(head)
    const tag = this.campusTag(p)
    tag.position.set(0, 0.72, 0.06)
    g.add(tag)

    const rot = dir === '+x' ? Math.PI / 2 : dir === '-x' ? -Math.PI / 2 : 0
    g.position.set(x, 0, z)
    g.rotation.y = rot
    this.scene.add(g)
    if (dir === '+z') this.addCollider(x - 0.66, x + 0.66, z - 0.3, z + 0.3, 2.2)
    else this.addCollider(x - 0.3, x + 0.3, z - 0.66, z + 0.66, 2.2)
    const fx = dir === '+x' ? x + 1.2 : dir === '-x' ? x - 1.2 : x
    const fz = dir === '+z' ? z + 1.2 : z
    this.addInteractable({
      pos: () => ({ x: fx, z: fz }),
      radius: 1.7,
      label: `View ${p.title.slice(0, 20)} (E)`,
      action: (game) => game.ui.openCampus(p),
    })
  }

  // --------------------------------------------------------- customer lounge
  buildLounge() {
    // front-left quarter, separated from the aisle by a low planter divider.
    const cx = -15.5, cz = 11
    // rug
    const rug = mesh(new THREE.PlaneGeometry(7, 6), std('#20242c', { roughness: 0.95 }))
    rug.rotation.x = -Math.PI / 2
    rug.position.set(cx, 0.015, cz)
    this.scene.add(rug)
    // two leather sofas + two chairs around a coffee table (all sittable)
    this.sofa(cx - 2.6, cz, Math.PI / 2)
    this.addSeat(cx - 2.6, cz, Math.PI / 2, 0.62)
    this.sofa(cx + 2.6, cz, -Math.PI / 2)
    this.addSeat(cx + 2.6, cz, -Math.PI / 2, 0.62)
    this.sofa(cx, cz - 2.4, 0, true)
    this.addSeat(cx, cz - 2.4, 0, 0.48)
    // coffee table with magazines + catalog tablet
    const tbl = new THREE.Group()
    tbl.add(mesh(new THREE.BoxGeometry(1.4, 0.06, 0.8), std('#2a2f38', { metalness: 0.3 }), 0, 0.42, 0))
    for (const [lx, lz] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) tbl.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), std('#15181d'), lx, 0.21, lz))
    tbl.add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.24), std('#e11d48'), -0.3, 0.46, 0)) // magazine
    tbl.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.2), emis('#38bdf8'), 0.3, 0.46, 0)) // catalog tablet
    tbl.position.set(cx, 0, cz)
    this.scene.add(tbl)
    this.colliderFromObject(tbl, 0.5)
    // low planter divider along the aisle edge (x = cx+3.8), doesn't fully wall it
    for (let pz = cz - 2.6; pz <= cz + 2.6; pz += 1.3) this.planter(cx + 3.9, pz)
    // water dispenser + charging bench against the west wall
    const wg = new THREE.Group()
    wg.add(mesh(new THREE.BoxGeometry(0.5, 1.1, 0.4), std('#e2e8f0'), 0, 0.55, 0))
    wg.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), std('#38bdf8', { transparent: true, opacity: 0.8 }), 0, 1.2, 0))
    wg.position.set(-this.W / 2 + 0.9, 0, cz + 3.4)
    this.scene.add(wg)
    this.colliderFromObject(wg, 1.1)
    // catalog touchscreen on the west wall
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshBasicMaterial({ map: this.promoTexture() }))
    screen.position.set(-this.W / 2 + 0.22, 1.7, cz - 1)
    screen.rotation.y = Math.PI / 2
    this.scene.add(screen)
    // lounge sign
    const sign = this.textPlane('LOUNGE', { w: 1.6, h: 0.34, bg: '#0b0d11', fg: '#e2e8f0' })
    sign.position.set(cx, 2.7, cz - 3)
    this.scene.add(sign)
  }

  planter(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), std('#20242c'), 0, 0.25, 0))
    g.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), std('#2f6f3f'), 0, 0.72, 0))
    g.add(mesh(new THREE.SphereGeometry(0.24, 10, 8), std('#3f8f4f'), 0.12, 0.9, 0.05))
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.32, x + 0.32, z - 0.32, z + 0.32, 0.9)
  }

  sofa(x, z, ry, bench = false) {
    const g = new THREE.Group()
    const mat = std(bench ? '#1b1e24' : '#26140f', { roughness: 0.5, metalness: 0.05 }) // leather
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.35, 0.8), mat, 0, bench ? 0.25 : 0.4, 0))
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.14, 0.82), std(bench ? '#2a2f38' : '#3a2018'), 0, bench ? 0.45 : 0.62, 0))
    if (!bench) {
      g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 0.16), mat, 0, 0.85, -0.32))
      for (const sx of [-0.77, 0.77]) g.add(mesh(new THREE.BoxGeometry(0.16, 0.42, 0.8), mat, sx, 0.72, 0))
    }
    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.scene.add(g)
    this.colliderFromObject(g, bench ? 0.5 : 0.9)
  }

  addSeat(x, z, ry, seatHeight) {
    const game = this.game
    const fx = x + Math.sin(ry) * 1.1
    const fz = z + Math.cos(ry) * 1.1
    const spot = { x: x + Math.sin(ry) * 0.08, z: z + Math.cos(ry) * 0.08, heading: ry, seatHeight }
    this.addInteractable({
      pos: () => ({ x: fx, z: fz }),
      radius: 1.5,
      get label() {
        return game.player.sitting ? 'Stand up (E)' : 'Sit here (E)'
      },
      action: (g) => g.toggleSit(spot),
    })
  }

  // ---------------------------------------------------------- foot scanner
  buildFootScanner() {
    const x = -11, z = 2
    const g = new THREE.Group()
    // scanner pad + glowing scan surface
    g.add(mesh(new THREE.BoxGeometry(1.0, 0.08, 0.7), std('#15181d', { metalness: 0.4 }), 0, 0.04, 0))
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), emis('#38bdf8'))
    glow.rotation.x = -Math.PI / 2
    glow.position.set(0, 0.082, 0)
    g.add(glow)
    // upright screen
    g.add(mesh(new THREE.BoxGeometry(0.9, 1.3, 0.08), std('#0b0d11'), 0, 1.4, -0.35))
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 1.1), new THREE.MeshBasicMaterial({ map: this.scannerTexture() }))
    scr.position.set(0, 1.42, -0.31)
    g.add(scr)
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.55, x + 0.55, z - 0.45, z + 0.45, 1.5)
    const sign = this.textPlane('FOOT SCAN', { w: 1.4, h: 0.3, bg: '#0b0d11', fg: '#38bdf8' })
    sign.position.set(x, 2.3, z - 0.35)
    this.scene.add(sign)
  }

  // ---------------------------------------------------------- trial wing
  // A partitioned corridor in the back-left leading to 3 private fitting rooms.
  buildTrialWing() {
    const wallMat = std('#111318', { roughness: 0.7 })
    const xL = -this.W / 2 + 0.35 // west wall inner face
    const zTop = -6 // corridor mouth (open toward the room, +z side)
    const zBot = -15.5
    const xRight = -12.5 // corridor's east partition
    // east partition wall of the wing (with a doorway gap near the mouth)
    this.scene.add(mesh(new THREE.BoxGeometry(0.16, 3.2, zTop - zBot - 1.6), wallMat, xRight, 1.6, (zTop + zBot) / 2 - 0.8))
    this.addCollider(xRight - 0.08, xRight + 0.08, zBot, zTop - 1.6, 3.2)
    // header beam over the corridor mouth + sign
    this.scene.add(mesh(new THREE.BoxGeometry(xRight - xL, 0.5, 0.16), std('#e11d48'), (xL + xRight) / 2, 3.0, zTop - 1.6))
    const sign = this.textPlane('FITTING ROOMS', { w: 3.2, h: 0.44, bg: '#e11d48', fg: '#fff1f2' })
    sign.position.set((xL + xRight) / 2, 3.35, zTop - 1.55)
    this.scene.add(sign)
    // mirrored corridor wall (east partition inner face) + brand graphic
    const mirrorPanel = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshBasicMaterial({ map: this.mirrorSheen() }))
    mirrorPanel.position.set(xRight - 0.09, 1.6, -11)
    mirrorPanel.rotation.y = -Math.PI / 2
    this.scene.add(mirrorPanel)
    // back wall of the wing already exists (room back wall). Three cubicles
    // divide the wing with short partitions perpendicular to the west wall.
    const cubZ = [-8.5, -11, -13.5]
    for (const pz of cubZ) {
      this.scene.add(mesh(new THREE.BoxGeometry(4, 3, 0.14), wallMat, xL + 2.4, 1.5, pz))
      this.addCollider(xL, xL + 4.8, pz - 0.07, pz + 0.07, 3)
    }
    // curtains (front) — leave open gaps to enter; smart mirror in the middle room
    const mirror = new Mirror({ x: xL + 0.3, z: -11, rotY: Math.PI / 2, w: 1.5, h: 2.5 })
    mirror.addTo(this)
    // ambient warm light in the corridor
    const l = new THREE.PointLight('#ffd9a0', 0.5, 14)
    l.position.set(xR2(xL, xRight), 3, -11)
    this.scene.add(l)

    this.trialInside = { x: xL + 2.6, z: -11 }
    // the openTryOn interactable lives just inside the middle cubicle
    this.addInteractable({
      pos: () => ({ x: xL + 3.4, z: -11 }),
      radius: 1.7,
      label: 'Use fitting room (E)',
      action: (g) => g.ui.openTryOn(),
    })
    // point where staff wait / deliver sizes (at the corridor mouth)
    this.trialFront = { x: xRight - 1.2, z: zTop - 0.5 }
  }

  // -------------------------------------------------------------- checkout
  buildCheckout() {
    const cx = 15, cz = 10
    const g = new THREE.Group()
    // long wood counter with a stone top, facing -x (toward the aisle)
    g.add(mesh(new THREE.BoxGeometry(1.1, 1.05, 5.0), std('#3f2a1e', { roughness: 0.5 }), 0, 0.52, 0))
    g.add(mesh(new THREE.BoxGeometry(1.25, 0.1, 5.2), std('#d9dde3', { roughness: 0.4, metalness: 0.1 }), 0, 1.08, 0)) // stone top
    g.add(mesh(new THREE.BoxGeometry(1.05, 0.9, 5.0), std('#2a1d15'), 0.05, 0.5, 0))
    // dual POS monitors
    for (const mz of [-1.2, 1.2]) {
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.34, 0.5), std('#0b0d11'), -0.2, 1.32, mz))
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), emis('#0e7490'))
      scr.position.set(-0.24, 1.34, mz)
      scr.rotation.y = -Math.PI / 2
      g.add(scr)
    }
    // card reader + receipt printer
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.12), std('#475569'), -0.4, 1.2, 0))
    // shopping-bag rack behind
    for (let i = 0; i < 4; i++) g.add(this.miniBag(0.55, 0.5, -1.6 + i * 0.5))
    // gift-wrap station
    g.add(mesh(new THREE.BoxGeometry(0.7, 0.5, 0.9), std('#15181d'), 0.3, 0.85, 2.0))
    // hanging CHECKOUT sign
    const sign = this.textPlane('CHECKOUT', { w: 2.4, h: 0.5, bg: '#0b0d11', fg: '#fbbf24' })
    sign.position.set(0, 3.0, 0)
    sign.rotation.y = -Math.PI / 2
    g.add(sign)

    g.position.set(cx, 0, cz)
    this.scene.add(g)
    this.colliderFromObject(g, 1.1)

    // queue barriers (stanchions + belt) leading up to the counter
    for (let i = 0; i < 3; i++) this.stanchion(cx - 2.4, cz + 3 - i * 2)
    this.counterFront = { x: cx - 2.2, z: cz }
    this.addInteractable({
      pos: () => ({ x: cx - 2.2, z: cz }),
      radius: 2.3,
      when: (g) => !g.session.atLeast('paid'),
      label: 'Checkout counter (E)',
      action: (g) => {
        const c = this.staff?.cashier
        if (c) g.talkTo(c)
        else g.openCheckout(true)
      },
    })
  }

  stanchion(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 16), std('#0b0d11', { metalness: 0.5 }), 0, 0.025, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 10), std('#3a3f4c', { metalness: 0.6, roughness: 0.3 }), 0, 0.5, 0))
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), std('#c0c4cc', { metalness: 0.7 }), 0, 1.0, 0))
    g.position.set(x, 0, z)
    this.scene.add(g)
  }

  miniBag(x, y, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.14), std('#0b0d11'), 0, 0, 0))
    g.add(mesh(new THREE.BoxGeometry(0.225, 0.06, 0.145), std('#e11d48'), 0, 0.06, 0))
    g.position.set(x, y, z)
    return g
  }

  // -------------------------------------------------------------- stock room
  buildStockRoom() {
    const x = 19.5, z = -this.D / 2 + 0.32
    // staff-only door on the back wall (right of FORMAL)
    this.scene.add(mesh(new THREE.BoxGeometry(2.6, 3.2, 0.2), std('#15181d'), x, 1.6, z))
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.8), emis('#0b0d11'))
    door.position.set(x, 1.5, z + 0.12)
    this.scene.add(door)
    const sign = this.textPlane('STOCKROOM · STAFF ONLY', { w: 2.6, h: 0.34, bg: '#f59e0b', fg: '#0b0d11' })
    sign.position.set(x, 3.15, z + 0.12)
    this.scene.add(sign)
    // delivery boxes + restock cart staged in front of the door
    for (let i = 0; i < 4; i++) {
      const b = mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), std('#b08968', { roughness: 0.95 }), x - 2.4 + (i % 2) * 0.9, 0.28 + Math.floor(i / 2) * 0.57, z + 1.3)
      this.scene.add(b)
    }
    this.addCollider(x - 3, x - 1.6, z + 0.9, z + 1.7, 1.2)
    // restock trolley
    const t = new THREE.Group()
    t.add(mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), std('#3a3f4c', { metalness: 0.5 }), 0, 0.5, 0))
    t.add(mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), std('#3a3f4c'), 0, 0.9, 0))
    for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) t.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), std('#15181d'), lx, 0.25, lz))
    t.position.set(x + 2.2, 0, z + 1.4)
    this.scene.add(t)
    this.warehousePoint = { x, z: z + 1.5 }
  }

  // ------------------------------------------------------------- signage/props
  buildSignage() {
    // directional hanging sign over the central aisle
    const dir = this.textPlane('◄ FITTING   ·   CHECKOUT ►', { w: 5, h: 0.4, bg: '#0b0d11', fg: '#e2e8f0' })
    dir.position.set(0, this.H - 0.5, 0.5)
    this.scene.add(dir)
    const dir2 = dir.clone(); dir2.rotation.y = Math.PI; this.scene.add(dir2)
    // welcome digital promo screen on a freestanding pillar just inside the door
    const pillar = mesh(new THREE.BoxGeometry(0.4, 3.2, 0.4), std('#15181d'), -6, 1.6, 12.5)
    this.scene.add(pillar)
    const promo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), new THREE.MeshBasicMaterial({ map: this.promoTexture() }))
    promo.position.set(-6, 2.4, 12.72)
    promo.rotation.y = Math.PI
    this.scene.add(promo)
    this.addCollider(-6.25, -5.75, 12.25, 12.75, 3.2)
    // a couple of posters on the walls
    for (const [x, z, ry] of [[-this.W / 2 + 0.25, -8, Math.PI / 2], [this.W / 2 - 0.25, 12, -Math.PI / 2]]) {
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), new THREE.MeshBasicMaterial({ map: this.posterTexture() }))
      poster.position.set(x, 2.6, z)
      poster.rotation.y = ry
      this.scene.add(poster)
    }
    // small props: fire extinguisher + a plant by the entrance corners
    this.planter(this.W / 2 - 2, this.D / 2 - 2)
    this.planter(-this.W / 2 + 2, this.D / 2 - 2)
    const ext = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 12), std('#dc2626'), this.W / 2 - 0.6, 0.6, -14)
    this.scene.add(ext)
  }

  // --------------------------------------------------------------- staff
  buildStaffMembers() {
    const D = this.D
    const ctx = {
      greeter: { x: 5, z: D / 2 - 4, heading: 0 }, // just inside the door, offset right
      associate: { x: -3, z: 5, heading: 0 }, // floor, by the presentation table
      inventory: { x: 17, z: -D / 2 + 2.6, heading: Math.PI }, // by the stockroom
      trial: { x: -11.5, z: -6.5, heading: Math.PI }, // at the fitting-room corridor mouth
      cashier: { x: 16.6, z: 10, heading: -Math.PI / 2 }, // behind the counter
    }
    this.staff = buildStaff(ctx)
    for (const e of this.staff.all) this.addEmployee(e)

    // ---- autonomous routines (the store runs whether or not the player is here) ----
    const S = this.staff
    const wp = this.warehousePoint
    S.greeter.setRoutine({ roam: false })
    S.cashier.setRoutine({ roam: false })
    S.associate.setRoutine({
      roam: true,
      // only wander when not actively helping the customer
      gate: (g) => !g.session.category || g.session.atLeast('paid'),
      stations: [
        { x: -7.5, z: 0.4, heading: Math.PI, pose: 'wipe' },
        { x: 7.5, z: 0.4, heading: Math.PI, pose: 'restock' },
        { x: 0, z: 4.4, heading: Math.PI, pose: 'tablet' },
        { x: 0, z: 10, heading: Math.PI, pose: 'point' },
      ],
    })
    S.inventory.setRoutine({
      roam: true,
      stations: [
        { x: wp.x, z: wp.z, heading: 0, carry: '#c2410c', pose: 'idle' },
        { x: 13.5, z: -13.5, heading: Math.PI, pose: 'restock', drop: true },
        { x: 5, z: -13.5, heading: Math.PI, pose: 'restock', drop: true },
      ],
    })
    S.trial.setRoutine({
      roam: true,
      gate: (g) => !g.session.sizeFetched && !g.session.triedOn,
      stations: [
        { x: -11.5, z: -6.5, heading: Math.PI, pose: 'tablet' },
        { x: -14.5, z: -11, heading: Math.PI / 2, pose: 'wipe' },
      ],
    })

    this.pts = {
      benchStand: { x: 0, z: 4.4 }, // where Rahul stands to present (front of the table)
      benchLead: { x: 0.6, z: 2.4 },
      trialFront: this.trialFront,
      counterFront: this.counterFront,
      warehouse: this.warehousePoint,
      associateHome: ctx.associate,
    }
  }

  // ------------------------------------------------------- animated props
  buildAnimatedProps() {
    // two slow ceiling fans over the main floor
    for (const [x, z] of [[-8, 1], [8, 1]]) this.ceilingFan(x, z)
    // security camera in a front corner, sweeping the floor
    const cam = new THREE.Group()
    cam.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 0.34), std('#20242c'), 0, 0, 0.08))
    cam.add(mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 10), std('#0b0d11'), 0, 0, 0.28))
    const arm = new THREE.Group()
    arm.add(cam)
    arm.position.set(this.W / 2 - 0.5, this.H - 0.7, this.D / 2 - 3)
    this.scene.add(arm)
    this.anim.cam = arm

    // digital "now serving" queue counter above the checkout
    const q = this.dynScreen(1.6, 0.6)
    q.mesh.position.set(this.W / 2 - 0.24, 3.2, 8)
    q.mesh.rotation.y = -Math.PI / 2
    this.scene.add(q.mesh)
    this.anim.queue = q
    // live sales dashboard on the back wall by the stockroom
    const d = this.dynScreen(1.8, 1.0)
    d.mesh.position.set(16.5, 3.2, -this.D / 2 + 0.28)
    this.scene.add(d.mesh)
    this.anim.dash = d
    this._tickScreens()
  }

  ceilingFan(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 12), std('#0b0d11'), 0, 0, 0))
    const blades = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group()
      const b = mesh(new THREE.BoxGeometry(1.5, 0.03, 0.18), std('#20242c'), 0.78, 0, 0)
      holder.add(b)
      holder.rotation.y = (i * Math.PI) / 2
      blades.add(holder)
    }
    blades.position.y = -0.14
    g.add(blades)
    g.position.set(x, this.H - 0.35, z)
    this.scene.add(g)
    this.anim.fans.push(blades)
  }

  dynScreen(w, h) {
    const c = document.createElement('canvas')
    c.width = Math.round(w * 256)
    c.height = Math.round(h * 256)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const mesh2 = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }))
    return { mesh: mesh2, canvas: c, ctx: c.getContext('2d'), tex }
  }

  _tickScreens() {
    const now = Date.now()
    const q = this.anim.queue
    if (q) {
      const ctx = q.canvas.getContext('2d'), cw = q.canvas.width, ch = q.canvas.height
      ctx.fillStyle = '#06131c'; ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'
      ctx.font = `bold ${Math.round(ch * 0.28)}px ui-sans-serif, system-ui`
      ctx.fillText('NOW SERVING', cw / 2, ch * 0.4)
      ctx.fillStyle = '#fbbf24'
      ctx.font = `bold ${Math.round(ch * 0.5)}px ui-monospace, monospace`
      ctx.fillText('A' + String(7 + (Math.floor(now / 6000) % 40)).padStart(2, '0'), cw / 2, ch * 0.86)
      q.tex.needsUpdate = true
    }
    const d = this.anim.dash
    if (d) {
      const ctx = d.canvas.getContext('2d'), cw = d.canvas.width, ch = d.canvas.height
      ctx.fillStyle = '#0b0d11'; ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#e11d48'; ctx.fillRect(0, 0, cw, ch * 0.22)
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
      ctx.font = `bold ${Math.round(ch * 0.14)}px ui-sans-serif, system-ui`
      ctx.fillText("TODAY'S SALES", 20, ch * 0.16)
      const pairs = 38 + (Math.floor(now / 8000) % 9)
      ctx.fillStyle = '#22c55e'
      ctx.font = `bold ${Math.round(ch * 0.26)}px ui-monospace, monospace`
      ctx.fillText('₹' + (pairs * 3290).toLocaleString('en-IN'), 20, ch * 0.52)
      ctx.fillStyle = '#94a3b8'
      ctx.font = `${Math.round(ch * 0.13)}px ui-sans-serif, system-ui`
      ctx.fillText(pairs + ' pairs sold  ·  target 92%', 20, ch * 0.74)
      ctx.fillText('footfall ' + (210 + (Math.floor(now / 5000) % 30)), 20, ch * 0.9)
      d.tex.needsUpdate = true
    }
  }

  // ------------------------------------------------------- ambient customers
  buildCustomers() {
    const area = { minX: -17, maxX: 17, minZ: -13, maxZ: 12 }
    const shoppers = [
      ['Ananya', '#8b5cf6'], ['Dev', '#ef4444'], ['Sara', '#06b6d4'], ['Karan', '#22c55e'],
      ['Meher', '#f59e0b'], ['Rohan', '#2563eb'], ['Isha', '#ec4899'], ['Vivaan', '#0ea5e9'],
    ]
    shoppers.forEach(([name, shirt], i) => {
      const npc = new NPC({ name, pos: { x: (i - 3.5) * 4, z: 10 - (i % 3) * 4 }, area, palette: { shirt }, pace: 1.3 + Math.random() * 0.6 })
      if (i % 3 === 0 && npc.avatar.giveBag) npc.avatar.giveBag({ tint: '#0b0d11' }) // some carry a bag
      this.npcs.push(npc)
      this.scene.add(npc.group)
    })
  }

  // Rahul lays out up to three pairs on the presentation table.
  presentOnTable(products) {
    if (this.presentation) for (const m of this.presentation) this.presentBench.remove(m)
    this.presentation = []
    products.slice(0, 3).forEach((p, i) => {
      const model = normalizeToSize(buildPair(p.spec || { type: 'casual', upper: p.tint, sole: '#f1f5f9', accent: '#e11d48' }), 0.55)
      model.position.set(this.presentSlots[i] ?? 0, 0.82, 0)
      model.rotation.y = 0.3
      this.registerClickable(model, p)
      this.presentBench.add(model)
      this.presentation.push(model)
    })
  }

  // -------------------------------------------------------------- lifecycle
  onEnter(tag) {
    if (tag !== 'entry') return
    this.game.session.reset()
    this.resetStaff()
    this.game.audio?.chime?.() // welcome chime
    if (this.game.ui?.setStage) this.game.ui.setStage()
  }

  resetStaff() {
    if (this.staff) {
      for (const e of this.staff.all) {
        e.clearGoal()
        e.paused = false
        e.chat = []
        if (e.dropBox) e.dropBox()
        e.group.position.set(e.home.x, 0, e.home.z)
        e.heading = e.home.heading
        e.avatar.visual.rotation.y = e.home.heading
      }
    }
    if (this.presentation) {
      for (const m of this.presentation) this.presentBench.remove(m)
      this.presentation = null
    }
  }

  update(dt) {
    super.update(dt) // updates ambient customers (crowd LOD) + employees
    const clk = this.game.clock.elapsedTime
    for (const m of this.spins) m.rotation.y += dt * 0.5
    const s = 0.9 + Math.sin(clk * 1.5) * 0.1
    for (const l of this.ledStrips) l.material.color.setRGB(1.0 * s, 0.965 * s, 0.92 * s)
    // ceiling fans + security camera sweep
    for (const f of this.anim.fans) f.rotation.y += dt * 3.0
    if (this.anim.cam) this.anim.cam.rotation.y = Math.sin(clk * 0.4) * 0.7
    // automatic sliding doors — open near the player or an approaching customer
    const pp = this.game.player.pos
    const dz = this.D / 2
    const nearDoor = Math.hypot(pp.x, pp.z - dz) < 4.5 || this.npcs.some((n) => Math.abs(n.group.position.x) < 3.5 && Math.abs(n.group.position.z - dz) < 3.5)
    for (const d of this.doors) {
      const tx = nearDoor ? d.openX : d.closedX
      d.leaf.position.x += (tx - d.leaf.position.x) * Math.min(1, dt * 6)
    }
    // dynamic screens tick
    this._screenT = (this._screenT || 0) + dt
    if (this._screenT > 3) {
      this._screenT = 0
      this._tickScreens()
    }
    // ambient PA / walkie / murmur while the player is in the store
    if (this.game.audio && this.game.audio.ambientTick) this.game.audio.ambientTick(dt)
  }

  spawn() {
    return { x: 0, z: this.D / 2 - 3, heading: Math.PI, camYaw: 0 }
  }

  // ---------------------------------------------------------------- textures
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  textPlane(text, { w, h, bg, fg, x, y, z, flat = false }) {
    const tex = makeCanvasTexture(512, Math.round((512 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = bg
      this.rr(ctx, 0, 0, cw, ch, flat ? 0 : 14)
      ctx.fill()
      ctx.fillStyle = fg
      ctx.font = `bold ${Math.round(ch * 0.46)}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, cw / 2, ch / 2 + 2)
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
    if (x != null) m.position.set(x, y, z)
    if (flat) m.rotation.x = -Math.PI / 2
    return m
  }

  priceTag(p) {
    const tex = makeCanvasTexture(256, 128, (ctx, cw, ch) => {
      ctx.fillStyle = 'rgba(10,12,16,0.94)'
      this.rr(ctx, 6, 6, cw - 12, ch - 12, 14)
      ctx.fill()
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 24px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(p.name.slice(0, 16), cw / 2, 38)
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 38px ui-sans-serif, system-ui'
      ctx.fillText('₹' + p.price.toLocaleString('en-IN'), cw / 2, 86)
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  }

  // richer product plaque for center-table displays (name/brand/price/rating/QR)
  specPlaque(p) {
    const tex = makeCanvasTexture(320, 200, (ctx, cw, ch) => {
      ctx.fillStyle = '#f8fafc'
      this.rr(ctx, 4, 4, cw - 8, ch - 8, 12)
      ctx.fill()
      ctx.fillStyle = '#0b0d11'
      ctx.textAlign = 'left'
      ctx.font = 'bold 26px ui-sans-serif, system-ui'
      ctx.fillText((p.name || '').slice(0, 18), 16, 40)
      ctx.fillStyle = '#64748b'
      ctx.font = '18px ui-sans-serif, system-ui'
      ctx.fillText((p.brand || '') + ' · ' + (p.usage || '').slice(0, 20), 16, 66)
      ctx.fillStyle = '#0b0d11'
      ctx.font = 'bold 34px ui-sans-serif, system-ui'
      ctx.fillText('₹' + (p.price || 0).toLocaleString('en-IN'), 16, 110)
      ctx.fillStyle = '#f59e0b'
      ctx.font = '22px ui-sans-serif, system-ui'
      ctx.fillText('★ ' + (p.rating || 4.5).toFixed(1) + '  ·  ' + (p.comfort || 4) + '/5 comfort', 16, 142)
      // little QR block
      ctx.fillStyle = '#0b0d11'
      const q = 8, cell = 7, ox = cw - 78, oy = ch - 78
      for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) if ((i * 7 + j * 13) % 3 === 0) ctx.fillRect(ox + i * cell, oy + j * cell, cell, cell)
      ctx.fillStyle = '#94a3b8'
      ctx.font = '14px ui-sans-serif, system-ui'
      ctx.fillText('In stock', 16, 172)
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  }

  campusTag(p) {
    const tex = makeCanvasTexture(360, 120, (ctx, cw, ch) => {
      ctx.fillStyle = 'rgba(10,12,16,0.95)'
      this.rr(ctx, 4, 4, cw - 8, ch - 8, 14)
      ctx.fill()
      ctx.textAlign = 'center'
      ctx.fillStyle = '#e2e8f0'
      ctx.font = 'bold 22px ui-sans-serif, system-ui'
      ctx.fillText(p.title.length > 26 ? p.title.slice(0, 25) + '…' : p.title, cw / 2, 34)
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 38px ui-sans-serif, system-ui'
      ctx.fillText(formatINR(p.price), cw / 2 - (p.discountPct ? 46 : 0), 84)
      if (p.discountPct) {
        ctx.fillStyle = '#f87171'
        ctx.font = 'bold 20px ui-sans-serif, system-ui'
        ctx.fillText('-' + p.discountPct + '%', cw / 2 + 74, 84)
      }
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true }))
  }

  woodTexture() {
    const tex = makeCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#b98a5e'
      ctx.fillRect(0, 0, w, h)
      const planks = 7
      const pw = w / planks
      for (let i = 0; i < planks; i++) {
        const base = 150 + ((i * 29) % 34)
        ctx.fillStyle = `rgb(${base + 22},${base - 14},${base - 52})`
        ctx.fillRect(i * pw, 0, pw - 2, h)
        ctx.strokeStyle = 'rgba(70,45,22,0.22)'
        ctx.lineWidth = 1
        for (let g = 0; g < 5; g++) {
          ctx.beginPath()
          const gx = i * pw + 8 + g * (pw / 5)
          ctx.moveTo(gx, 0)
          ctx.bezierCurveTo(gx + 5, h / 3, gx - 5, (2 * h) / 3, gx + 3, h)
          ctx.stroke()
        }
      }
    })
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(6, 5)
    return tex
  }

  mirrorSheen() {
    return makeCanvasTexture(128, 256, (ctx, cw, ch) => {
      const gr = ctx.createLinearGradient(0, 0, cw, ch)
      gr.addColorStop(0, '#eaf3fb'); gr.addColorStop(0.5, '#c3d7e6'); gr.addColorStop(1, '#dbe8f2')
      ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch)
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 8
      ctx.beginPath(); ctx.moveTo(cw * 0.25, 0); ctx.lineTo(cw * 0.6, ch); ctx.stroke()
    })
  }

  promoTexture() {
    return makeCanvasTexture(640, 440, (ctx, w, h) => {
      ctx.fillStyle = '#0b0d11'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#e11d48'; ctx.fillRect(0, 0, w, 70)
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'
      ctx.font = 'bold 40px ui-sans-serif, system-ui'
      ctx.fillText('POUNCE FOOTWEAR', 30, 50)
      const lines = ["Today's Promotions", 'New Arrivals · Live Drops', 'Limited Edition', 'Running Collection', 'Student Discount 15%', 'Members: extra 10% off']
      ctx.font = '30px ui-sans-serif, system-ui'
      lines.forEach((l, i) => { ctx.fillStyle = i % 2 ? '#fbbf24' : '#e2e8f0'; ctx.fillText('•  ' + l, 34, 130 + i * 52) })
    })
  }

  scannerTexture() {
    return makeCanvasTexture(320, 440, (ctx, w, h) => {
      ctx.fillStyle = '#06131c'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#38bdf8'; ctx.textAlign = 'center'
      ctx.font = 'bold 34px ui-sans-serif, system-ui'
      ctx.fillText('FOOT SCANNER', w / 2, 60)
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3
      ctx.strokeRect(60, 110, w - 120, 220)
      ctx.font = '22px ui-sans-serif, system-ui'; ctx.fillStyle = '#7dd3fc'
      ctx.fillText('Stand on the pad', w / 2, 380)
      ctx.fillText('to find your size', w / 2, 410)
    })
  }

  posterTexture() {
    return makeCanvasTexture(360, 480, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, '#111318'); g.addColorStop(1, '#3a2018')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'
      ctx.font = 'bold 54px ui-sans-serif, system-ui'
      ctx.fillText('RUN', w / 2, h / 2 - 20)
      ctx.fillText('YOUR', w / 2, h / 2 + 40)
      ctx.fillText('WAY', w / 2, h / 2 + 100)
      ctx.fillStyle = '#fbbf24'; ctx.font = '26px ui-sans-serif, system-ui'
      ctx.fillText('POUNCE · SS26', w / 2, h - 40)
    })
  }
}

// helper: midpoint x for the corridor light
function xR2(a, b) {
  return (a + b) / 2
}
