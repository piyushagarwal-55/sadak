import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BaseWorld } from '../BaseWorld.js'
import { mesh, arWall, plant } from '../builders.js'
import { MATERIAL } from '../kit/materials.js'
import { roundedBox } from '../kit/forms.js'
import { vitrine, cashierMonolith } from '../kit/retail.js'
import { NPC } from '../NPC.js'
import { CAFE_PRODUCTS } from '../../data/products.js'
import { makeCanvasTexture, normalizeToSize } from '../../core/util.js'

// "Bloom Café & Grocery" — a bright, cosy café + mini-grocery.
// Authored for image-based lighting (declares envKind) so the terrazzo floor,
// walnut counter, brass trim and glass pastry case read as real materials — the
// same kit and techniques as the SOLE flagship, kept in Bloom's own warm, sunlit
// identity.
//
// Room is 24 x 16 (x in [-12,12], z in [-8,8]) with a door gap centred on the
// +Z (south) wall — unchanged so the plaza door still lines up.
const T = 0.3
const B = {
  wall: '#EFE7D8',
  ceil: '#F6F1E6',
  wood: '#6B4A2E',
  woodDark: '#4A3320',
  cream: '#FBF6EC',
  green: '#3F6212',
  sun: '#FFE7B8',
}

export class CafeShop extends BaseWorld {
  constructor(game) {
    super(game)
    this.key = 'cafe'
    this.title = 'Bloom Café & Grocery'
    this.camDist = 5.2
    this.envKind = 'interior'

    this.W = 24
    this.D = 16
    this.H = 4.6

    this.scene.background = new THREE.Color('#eef4e6')
    this.scene.fog = new THREE.Fog('#eef4e6', 24, 56)

    this.pendants = []

    this.buildShell()
    this.buildLighting()
    this.buildFixtures()
    this.populate()

    this.addInteractable({
      pos: () => ({ x: 0, z: this.D / 2 - 1.4 }),
      radius: 1.4,
      label: 'Leave shop (E)',
      action: (g) => g.switchWorld('outdoor', 'cafe'),
    })

    this.featuredProduct = CAFE_PRODUCTS[3]

    this.minimap = {
      ground: '#e7edd9',
      areas: [{ x: 0, z: 0, w: this.W, d: this.D, color: '#dfe6cf' }],
      roads: [],
      buildings: [],
      pois: [
        { x: 8.5, z: 4.5, color: '#6EE7B7', icon: 'P', label: 'Counter' },
        { x: -5, z: 4, color: '#F59E0B', icon: '☕', label: 'Seating' },
      ],
    }
  }

  // ------------------------------------------------------------------ shell
  buildShell() {
    const W = this.W, D = this.D, H = this.H
    const scene = this.scene

    // ---- floor: warm terrazzo with a walnut inlaid path ----
    const floor = mesh(new THREE.PlaneGeometry(W, D), MATERIAL.terrazzo(6))
    floor.rotation.x = -Math.PI / 2
    floor.castShadow = false
    scene.add(floor)
    const inlay = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MATERIAL.walnut(1))
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.008, z)
      scene.add(m)
    }
    inlay(0, 2, 0.1, 10) // door toward the counter
    inlay(4, 3.5, 8, 0.1) // across to the counter

    // ---- ceiling: warm plaster with wood beams + warm glow panels ----
    const ceil = mesh(new THREE.PlaneGeometry(W, D), MATERIAL.paint(B.ceil, 0.95))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = H
    ceil.castShadow = false
    scene.add(ceil)
    const beamMat = MATERIAL.walnut(2)
    for (let gx = -9; gx <= 9; gx += 4.5)
      scene.add(mesh(new THREE.BoxGeometry(0.22, 0.26, D - 1), beamMat, gx, H - 0.15, 0))
    for (const [gx, gz] of [[-6, -2], [0, -2], [6, -2], [-6, 3], [6, 3]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), MATERIAL.ledStrip(B.sun))
      panel.rotation.x = Math.PI / 2
      panel.position.set(gx, H - 0.04, gz)
      scene.add(panel)
    }

    // ---- walls: warm plaster micro-cement, walnut wainscot base ----
    const wallMat = MATERIAL.microCement(B.wall, 4)
    const addWall = (w, h, d, x, y, z) => {
      const m = mesh(new THREE.BoxGeometry(w, h, d), wallMat, x, y, z)
      m.castShadow = false
      scene.add(m)
      // walnut skirting
      scene.add(mesh(new THREE.BoxGeometry(w + 0.02, 0.55, d + 0.02), MATERIAL.walnut(2), x, 0.275, z))
    }
    addWall(W, H, T, 0, H / 2, -D / 2)
    this.addCollider(-W / 2, W / 2, -D / 2 - T, -D / 2 + T, H)
    addWall(T, H, D, -W / 2, H / 2, 0)
    this.addCollider(-W / 2 - T, -W / 2 + T, -D / 2, D / 2, H)
    addWall(T, H, D, W / 2, H / 2, 0)
    this.addCollider(W / 2 - T, W / 2 + T, -D / 2, D / 2, H)

    this.buildStorefront()

    this.bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.5, maxZ: D / 2 - 0.5 }
  }

  // A sunny glass storefront with wood mullions, a striped café awning, an
  // illuminated brand sign and a warm exit portal.
  buildStorefront() {
    const W = this.W, D = this.D, H = this.H
    const z = D / 2
    const doorW = 3.2
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#DCEFE4', transmission: 0.92, thickness: 0.4, roughness: 0.06,
      ior: 1.45, metalness: 0, transparent: true, side: THREE.DoubleSide,
      emissive: '#EAF6EE', emissiveIntensity: 0.3, depthWrite: false,
    })
    const frame = MATERIAL.walnut(2)
    const seg = (W - doorW) / 2
    for (const sx of [-(doorW / 2 + seg / 2), doorW / 2 + seg / 2]) {
      const pane = mesh(new THREE.BoxGeometry(seg, H - 0.9, 0.08), glass, sx, (H - 0.9) / 2 + 0.45, z - 0.16)
      pane.castShadow = false
      this.scene.add(pane)
      this.addCollider(sx - seg / 2, sx + seg / 2, z - T, z + T, H)
      for (let mx = sx - seg / 2; mx <= sx + seg / 2 + 0.01; mx += seg / 3)
        this.scene.add(mesh(new THREE.BoxGeometry(0.08, H - 0.9, 0.12), frame, mx, (H - 0.9) / 2 + 0.45, z - 0.12))
      // sill + head rail
      this.scene.add(mesh(new THREE.BoxGeometry(seg, 0.4, 0.28), frame, sx, 0.2, z - 0.12))
      this.scene.add(mesh(new THREE.BoxGeometry(seg, 0.24, 0.22), frame, sx, H - 0.72, z - 0.12))
    }
    // header lintel
    this.scene.add(mesh(new THREE.BoxGeometry(W, 0.6, T), MATERIAL.microCement(B.wall, 2), 0, H - 0.3, z))
    // striped café awning across the front (canvas texture, faces inward)
    const awningTex = makeCanvasTexture(512, 128, (ctx, cw, ch) => {
      const stripe = cw / 10
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = i % 2 ? '#3F6212' : '#FBF6EC'
        ctx.fillRect(i * stripe, 0, stripe, ch)
      }
    })
    const awning = new THREE.Mesh(new THREE.BoxGeometry(W - 1.2, 0.5, 0.9), new THREE.MeshStandardMaterial({ map: awningTex, roughness: 0.85 }))
    awning.position.set(0, H - 0.95, z - 0.65)
    awning.rotation.x = 0.28
    this.scene.add(awning)

    // interior blocker so the follow-cam can't slip through the doorway
    this.addCollider(-doorW / 2, doorW / 2, z - 0.26, z - 0.06, H)

    // warm exit threshold + illuminated wordmark facing inward
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(doorW, H - 1.2), new THREE.MeshBasicMaterial({ color: '#F6C87A', transparent: true, opacity: 0.32, toneMapped: false }))
    portal.position.set(0, (H - 1.2) / 2, z - 0.34)
    portal.rotation.y = Math.PI
    this.scene.add(portal)
    const logo = this.sign('BLOOM CAFÉ & GROCERY', { w: 6.2, h: 0.6, bg: '#2C1B10', fg: '#FBE7C2', accent: '#84CC16' })
    logo.position.set(0, H - 1.0, z - 0.38)
    logo.rotation.y = Math.PI
    this.scene.add(logo)
    const wayout = this.sign('◄  EXIT  ►', { w: 2.2, h: 0.32, bg: '#14532D', fg: '#BBF7D0' })
    wayout.position.set(0, H - 1.7, z - 0.4)
    wayout.rotation.y = Math.PI
    this.scene.add(wayout)
  }

  // Illuminated canvas signboard (glows through bloom — toneMapped:false).
  sign(text, { w, h, bg = '#2C1B10', fg = '#FBE7C2', accent = null }) {
    const tex = makeCanvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cw, ch)
      if (accent) {
        ctx.strokeStyle = accent
        ctx.lineWidth = 8
        ctx.strokeRect(12, 12, cw - 24, ch - 24)
      }
      ctx.fillStyle = fg
      ctx.font = `bold ${Math.round(ch * 0.46)}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = `${Math.round(ch * 0.05)}px`
      ctx.fillText(text, cw / 2, ch / 2 + 2)
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
  }

  // ---------------------------------------------------------------- lighting
  buildLighting() {
    RectAreaLightUniformsLib.init()
    const scene = this.scene
    const H = this.H

    // bright, warm, even — café not cinematic. scene.environment adds soft fill.
    scene.add(new THREE.HemisphereLight('#FFF6E4', '#D8DCC4', 0.7))
    const sun = new THREE.DirectionalLight('#FFF3DC', 0.85) // daylight through the storefront
    sun.position.set(2, 8, 10)
    scene.add(sun)
    // soft area glow washing the back wall / menu
    const wash = new THREE.RectAreaLight('#FFEAC4', 3.5, 9, 2.2)
    wash.position.set(3, H - 0.7, -this.D / 2 + 0.6)
    wash.rotation.x = -Math.PI / 2.6
    scene.add(wash)
    // warm pendant fill over the seating + counter
    for (const [x, z, i] of [[-5, 3.5, 8], [8.5, 4.5, 10], [0, -2, 7]]) {
      const pt = new THREE.PointLight('#FFE2AE', i, 16, 2)
      pt.position.set(x, 3.2, z)
      scene.add(pt)
    }
  }

  // --------------------------------------------------------------- fixtures
  buildFixtures() {
    const W = this.W, D = this.D

    // small AR wall on the north wall
    arWall(this, { x: -3.5, z: -D / 2 + 0.2, rotY: 0, w: 3.6, h: 2.2, tagline: 'Preview treats on your table' })

    // chalkboard menu on the back wall behind the counter
    this.menuBoard(6.5, -D / 2 + 0.2)

    // ---- the café counter: walnut monolith with espresso + pastry case ----
    cashierMonolith(this, { x: W / 2 - 3.2, z: 4.5, rotY: -Math.PI / 2 })
    // espresso machine sitting on the counter
    const espresso = new THREE.Group()
    espresso.add(mesh(roundedBox(0.55, 0.42, 0.4, 0.04), MATERIAL.chrome(), 0, 0.21, 0))
    espresso.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.36), MATERIAL.paint('#1F2937', 0.5), 0, 0.49, 0))
    espresso.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 8), MATERIAL.brushedBrass(), -0.12, 0.34, 0.2))
    espresso.position.set(W / 2 - 3.4, 1.12, 3.4)
    this.scene.add(espresso)
    // pastry glass case on the counter (cupcake + bread)
    vitrine(this, { x: W / 2 - 3.3, z: 6, rotY: -Math.PI / 2, product: CAFE_PRODUCTS[3], label: 'BAKERY' })

    // counter stools facing the counter
    for (const sz of [3.2, 5.8]) this.stool(W / 2 - 4.9, sz)

    // ---- grocery: warm lit wall shelf on the west wall ----
    this.pantryShelf({
      x: -W / 2 + 0.3, z: -1, rotY: Math.PI / 2, w: 6,
      label: 'MARKET', products: [CAFE_PRODUCTS[2], CAFE_PRODUCTS[4], CAFE_PRODUCTS[5]],
    })

    // fruit display table (apples) near the front
    this.marketTable(-6.5, -5, CAFE_PRODUCTS[0])
    // bakery table mid-floor (sourdough)
    this.marketTable(3, -5, CAFE_PRODUCTS[1])

    // ---- café seating: three round tables with chairs + pendant lamps ----
    for (const [tx, tz] of [[-7, 3.5], [-3, 5.5], [-6.5, 6.5]]) {
      this.cafeTable(tx, tz)
      this.pendant(tx, tz)
    }

    // greenery
    plant(this, { x: -W / 2 + 1.1, z: D / 2 - 1.4 })
    plant(this, { x: W / 2 - 1.1, z: -D / 2 + 1.4 })
    plant(this, { x: W / 2 - 1.1, z: D / 2 - 1.4 })
  }

  // Warm lit market shelf: walnut carcass, brass rails with LED lips, produce.
  pantryShelf({ x, z, rotY = 0, w = 6, label = '', products = [] }) {
    const g = new THREE.Group()
    const H = this.H - 1.3
    const depth = 0.55
    const back = new THREE.Mesh(roundedBox(w + 0.2, H, 0.12, 0.03), MATERIAL.microCement(B.cream, 2))
    back.position.y = H / 2
    back.receiveShadow = true
    g.add(back)
    for (const sx of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.12, H, depth), MATERIAL.walnut(1), sx, H / 2, 0))
    // header sign
    const header = this.sign(label, { w: Math.min(w - 0.6, 4), h: 0.4, bg: '#2C1B10', fg: '#FBE7C2' })
    header.position.set(0, H - 0.3, 0.06)
    g.add(header)

    const tiers = [H - 1.0, H - 1.9, H - 2.7].filter((t) => t > 0.4)
    for (const ty of tiers) {
      g.add(mesh(new THREE.BoxGeometry(w, 0.06, depth), MATERIAL.walnut(1), 0, ty, 0))
      g.add(mesh(new THREE.BoxGeometry(w - 0.2, 0.02, 0.02), MATERIAL.ledStrip('#FFEBC4'), 0, ty + 0.05, depth / 2 - 0.05))
    }
    const perTier = Math.ceil(products.length / tiers.length)
    products.forEach((p, i) => {
      const ty = tiers[Math.floor(i / perTier)]
      const slot = i % perTier
      const usable = w - 1.2
      const px = perTier === 1 ? 0 : -usable / 2 + (slot * usable) / Math.max(1, perTier - 1)
      const model = normalizeToSize(p.build(), 0.5)
      model.position.set(px, ty + 0.06, 0.05)
      this.registerClickable(model, p)
      g.add(model)
    })

    g.position.set(x, 0, z)
    g.rotation.y = rotY
    this.scene.add(g)
    this.addCollider(
      x - Math.abs(Math.cos(rotY)) * w / 2 - 0.3,
      x + Math.abs(Math.cos(rotY)) * w / 2 + 0.3,
      z - Math.abs(Math.sin(rotY)) * w / 2 - 0.3,
      z + Math.abs(Math.sin(rotY)) * w / 2 + 0.3,
      H
    )
    return g
  }

  // A round bistro table with a walnut top, brass column and one product.
  marketTable(x, z, product) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), MATERIAL.walnut(1), 0, 0.92, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 12), MATERIAL.brushedBrass(), 0, 0.46, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 20), MATERIAL.brushedBrass(), 0, 0.03, 0))
    if (product) {
      const model = normalizeToSize(product.build(), 0.5)
      model.position.set(0, 0.96, 0)
      this.registerClickable(model, product)
      g.add(model)
    }
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.55, x + 0.55, z - 0.55, z + 0.55, 1.0)
    return g
  }

  // Small round café table with two bentwood chairs, all sittable-looking.
  cafeTable(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 24), MATERIAL.walnut(1), 0, 0.74, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.72, 12), MATERIAL.brushedBrass(), 0, 0.37, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.04, 20), MATERIAL.brushedBrass(), 0, 0.02, 0))
    // a little cup + saucer on top
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.07, 12), MATERIAL.paint(B.cream, 0.4), 0.12, 0.81, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16), MATERIAL.paint(B.cream, 0.4), 0.12, 0.78, 0))
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0.8)
    for (const side of [-1, 1]) this.chair(x + side * 1.15, z, side > 0 ? -Math.PI / 2 : Math.PI / 2)
    return g
  }

  // Bentwood-style café chair with rounded parts; registers its own collider.
  chair(x, z, rotY = 0) {
    const g = new THREE.Group()
    const wood = MATERIAL.walnut(1)
    g.add(mesh(roundedBox(0.42, 0.05, 0.42, 0.02), wood, 0, 0.47, 0)) // seat
    for (const [lx, lz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]])
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.47, 8), wood, lx, 0.235, lz))
    g.add(mesh(roundedBox(0.42, 0.34, 0.05, 0.02), wood, 0, 0.68, -0.18)) // back
    g.position.set(x, 0, z)
    g.rotation.y = rotY
    this.scene.add(g)
    this.colliderFromObject(g, 0.9)
    return g
  }

  // A stool at the counter (brass legs, cushioned seat).
  stool(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 18), MATERIAL.paint('#7C3B22', 0.7), 0, 0.68, 0))
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.66, 8), MATERIAL.brushedBrass(), Math.cos(a) * 0.16, 0.33, Math.sin(a) * 0.16)
      leg.rotation.set(Math.cos(a) * 0.1, 0, -Math.sin(a) * 0.1)
      g.add(leg)
    }
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.24, x + 0.24, z - 0.24, z + 0.24, 0.7)
    return g
  }

  // A brass pendant lamp with a glowing warm bulb, hung over a table.
  pendant(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 6), MATERIAL.paint('#1A130C', 0.6), 0, this.H - 0.7, 0))
    const shade = mesh(new THREE.ConeGeometry(0.28, 0.3, 20, 1, true), MATERIAL.brushedBrass(), 0, this.H - 1.45, 0)
    g.add(shade)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), MATERIAL.ledStrip('#FFDCA0'))
    bulb.position.set(0, this.H - 1.5, 0)
    g.add(bulb)
    g.position.set(x, 0, z)
    this.scene.add(g)
    return g
  }

  // A chalkboard menu framed in walnut on the back wall.
  menuBoard(x, z) {
    const g = new THREE.Group()
    g.add(mesh(roundedBox(2.6, 1.7, 0.08, 0.03), MATERIAL.walnut(1), 0, 0, 0))
    const tex = makeCanvasTexture(512, 340, (ctx, cw, ch) => {
      ctx.fillStyle = '#1C1B18'
      ctx.fillRect(0, 0, cw, ch)
      ctx.fillStyle = '#FBE7C2'
      ctx.font = 'bold 46px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('— MENU —', cw / 2, 56)
      ctx.font = '30px ui-sans-serif, system-ui'
      ctx.textAlign = 'left'
      ctx.fillStyle = '#EAD9B8'
      const rows = [['House Roast', '₹120'], ['Cappuccino', '₹150'], ['Berry Cupcake', '₹129'], ['Sourdough', '₹149'], ['Fresh Juice', '₹119']]
      rows.forEach((r, i) => {
        const y = 120 + i * 44
        ctx.fillText(r[0], 40, y)
        ctx.textAlign = 'right'
        ctx.fillText(r[1], cw - 40, y)
        ctx.textAlign = 'left'
      })
    })
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }))
    board.position.z = 0.05
    g.add(board)
    g.position.set(x, 2.4, z)
    this.scene.add(g)
    return g
  }

  // ---------------------------------------------------------------- people
  populate() {
    this.addNPC(new NPC({
      name: 'Sana',
      pos: { x: 9.4, z: 4.5 },
      heading: -Math.PI / 2,
      palette: { shirt: '#65a30d', hair: '#7c2d12' },
      lines: [
        'Hi! Welcome to Bloom Café & Grocery ☕',
        'Fresh sourdough just came out of the oven — it’s on the bakery table.',
        'Grab anything you like and I’ll ring you up right here at the counter.',
      ],
    }))
    this.addNPC(new NPC({
      name: 'Zoya',
      pos: { x: -2, z: 1 },
      area: { minX: -6, maxX: 4, minZ: -4, maxZ: 4 },
      palette: { shirt: '#f472b6' },
      lines: [
        'I come here every morning for the house roast.',
        'Try the berry cupcake — it’s heavenly.',
      ],
    }))
  }

  spawn() {
    return { x: 0, z: 4.6, heading: Math.PI, camYaw: 0 }
  }
}
