import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BaseWorld } from '../BaseWorld.js'
import { mesh, arWall } from '../builders.js'
import { MATERIAL } from '../kit/materials.js'
import { roundedBox } from '../kit/forms.js'
import { plinth, vitrine, featureWall, cashierMonolith } from '../kit/retail.js'
import { NPC } from '../NPC.js'
import { ELECTRONICS_PRODUCTS } from '../../data/products.js'
import { makeCanvasTexture, normalizeToSize } from '../../core/util.js'

// "Volt Electronics" — a premium, neon-lit tech showroom.
// Authored for image-based lighting (declares envKind) so the glass display
// cases, chrome fixtures and polished dark floor read as real materials rather
// than flat plastic. Same kit / techniques as the SOLE flagship, kept in Volt's
// own cool cyan/magenta identity.
//
// Room is 26 x 18 (x in [-13,13], z in [-9,9]) with a door gap centred on the
// +Z (south) wall — unchanged so the plaza door still lines up.
const T = 0.3
// Volt's cool palette (kept separate from the warm SOLE tokens on purpose).
const V = {
  shell: '#070B16',
  wall: '#141C2E',
  floor: '#0D1424',
  panel: '#1B2536',
  steel: '#243247',
  cyan: '#22D3EE',
  magenta: '#E879F9',
  ice: '#CBE7FF',
}

export class ElectronicsShop extends BaseWorld {
  constructor(game) {
    super(game)
    this.key = 'electronics'
    this.title = 'Volt Electronics'
    this.camDist = 5.4
    this.envKind = 'interior'

    this.W = 26
    this.D = 18
    this.H = 4.8

    this.scene.background = new THREE.Color(V.shell)
    this.scene.fog = new THREE.Fog(V.shell, 22, 54)

    this.buildShell()
    this.buildLighting()
    this.buildFixtures()
    this.populate()

    this.addInteractable({
      pos: () => ({ x: 0, z: this.D / 2 - 1.4 }),
      radius: 1.4,
      label: 'Leave shop (E)',
      action: (g) => g.switchWorld('outdoor', 'electronics'),
    })

    this.featuredProduct = ELECTRONICS_PRODUCTS[0]

    this.minimap = {
      ground: '#070B16',
      areas: [{ x: 0, z: 0, w: this.W, d: this.D, color: '#111A2E' }],
      roads: [],
      buildings: [],
      pois: [
        { x: 0, z: -8, color: V.cyan, icon: 'AR', label: 'AR Wall' },
        { x: 8.5, z: 6, color: '#6EE7B7', icon: 'P', label: 'Checkout' },
      ],
    }
  }

  // ------------------------------------------------------------------ shell
  buildShell() {
    const W = this.W, D = this.D, H = this.H
    const scene = this.scene

    // ---- floor: polished dark micro-cement with cyan light runners inlaid ----
    const floor = mesh(new THREE.PlaneGeometry(W, D), MATERIAL.microCement(V.floor, 6))
    floor.rotation.x = -Math.PI / 2
    floor.castShadow = false
    scene.add(floor)
    for (const sx of [-9, -3, 3, 9]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, D - 3), MATERIAL.ledStrip(V.cyan))
      strip.rotation.x = -Math.PI / 2
      strip.position.set(sx, 0.01, -1)
      scene.add(strip)
    }

    // ---- ceiling: dark plenum with track rails + instanced track heads ----
    const ceil = mesh(new THREE.PlaneGeometry(W, D), MATERIAL.paint('#0A0F1C', 0.95))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = H
    ceil.castShadow = false
    scene.add(ceil)
    const rails = [-6, -1, 4]
    for (const rz of rails) {
      const rail = new THREE.Mesh(roundedBox(W - 2, 0.08, 0.1, 0.02), MATERIAL.paint(V.panel, 0.5))
      rail.position.set(0, H - 0.12, rz)
      scene.add(rail)
    }
    const headGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.15, 8)
    const heads = new THREE.InstancedMesh(headGeo, MATERIAL.paint('#0E1524', 0.4), rails.length * 7)
    const dm = new THREE.Object3D()
    let hi = 0
    for (const rz of rails) {
      for (let i = -3; i <= 3; i++) {
        dm.position.set(i * 3.4, H - 0.23, rz)
        dm.updateMatrix()
        heads.setMatrixAt(hi++, dm.matrix)
      }
    }
    heads.instanceMatrix.needsUpdate = true
    scene.add(heads)
    // a couple of glowing ceiling coves for ambient bounce
    for (const rz of [-6, 4]) {
      const cove = new THREE.Mesh(new THREE.PlaneGeometry(W - 3, 0.5), MATERIAL.ledStrip('#0E7490'))
      cove.rotation.x = Math.PI / 2
      cove.position.set(0, H - 0.05, rz)
      scene.add(cove)
    }

    // ---- walls: dark micro-cement box ----
    const wallMat = MATERIAL.microCement(V.wall, 4)
    const addWall = (w, h, d, x, y, z) => {
      const m = mesh(new THREE.BoxGeometry(w, h, d), wallMat, x, y, z)
      m.castShadow = false
      scene.add(m)
    }
    addWall(W, H, T, 0, H / 2, -D / 2)
    this.addCollider(-W / 2, W / 2, -D / 2 - T, -D / 2 + T, H)
    addWall(T, H, D, -W / 2, H / 2, 0)
    this.addCollider(-W / 2 - T, -W / 2 + T, -D / 2, D / 2, H)
    addWall(T, H, D, W / 2, H / 2, 0)
    this.addCollider(W / 2 - T, W / 2 + T, -D / 2, D / 2, H)

    this.buildStorefront()

    // feature wall behind the checkout, washed cyan
    featureWall(this, { x: W / 2 - 0.2, z: 6, rotY: -Math.PI / 2, width: 6, height: H - 0.4 })

    this.bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.5, maxZ: D / 2 - 0.5 }
  }

  // A glass storefront on the south wall with dark mullions, an illuminated
  // brand sign, a lit awning band and a glowing exit portal.
  buildStorefront() {
    const W = this.W, D = this.D, H = this.H
    const z = D / 2
    const doorW = 3.2
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#0E1A2A', transmission: 0.9, thickness: 0.4, roughness: 0.08,
      ior: 1.45, metalness: 0, transparent: true, side: THREE.DoubleSide,
      emissive: '#0B2233', emissiveIntensity: 0.25, depthWrite: false,
    })
    const mullion = MATERIAL.paint('#0A0F1A', 0.4)
    const seg = (W - doorW) / 2
    for (const sx of [-(doorW / 2 + seg / 2), doorW / 2 + seg / 2]) {
      const pane = mesh(new THREE.BoxGeometry(seg, H - 0.7, 0.08), glass, sx, (H - 0.7) / 2 + 0.35, z - 0.16)
      pane.castShadow = false
      this.scene.add(pane)
      this.addCollider(sx - seg / 2, sx + seg / 2, z - T, z + T, H)
      for (let mx = sx - seg / 2; mx <= sx + seg / 2 + 0.01; mx += seg / 3)
        this.scene.add(mesh(new THREE.BoxGeometry(0.07, H - 0.7, 0.12), mullion, mx, (H - 0.7) / 2 + 0.35, z - 0.12))
      this.scene.add(mesh(new THREE.BoxGeometry(seg, 0.3, 0.28), MATERIAL.paint(V.steel, 0.6), sx, 0.15, z - 0.12))
      this.scene.add(mesh(new THREE.BoxGeometry(seg, 0.22, 0.22), mullion, sx, H - 0.55, z - 0.12))
    }
    // header lintel + lit awning band spanning the front
    this.scene.add(mesh(new THREE.BoxGeometry(W, 0.6, T), MATERIAL.paint(V.panel, 0.7), 0, H - 0.3, z))
    const awning = new THREE.Mesh(new THREE.BoxGeometry(W - 1.5, 0.14, 0.7), MATERIAL.ledStrip('#0E7490'))
    awning.position.set(0, H - 0.75, z - 0.5)
    this.scene.add(awning)

    // interior blocker so the follow-cam can't slip through the doorway
    this.addCollider(-doorW / 2, doorW / 2, z - 0.26, z - 0.06, H)

    // glowing exit threshold + wordmark facing inward
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(doorW, H - 1.0), new THREE.MeshBasicMaterial({ color: '#0891B2', transparent: true, opacity: 0.34, toneMapped: false }))
    portal.position.set(0, (H - 1.0) / 2, z - 0.34)
    portal.rotation.y = Math.PI
    this.scene.add(portal)
    const logo = this.sign('VOLT ELECTRONICS', { w: 6.4, h: 0.62, bg: '#050A14', fg: V.cyan, accent: V.magenta })
    logo.position.set(0, H - 0.72, z - 0.38)
    logo.rotation.y = Math.PI
    this.scene.add(logo)
    const wayout = this.sign('◄  EXIT  ►', { w: 2.4, h: 0.34, bg: '#083344', fg: '#A5F3FC' })
    wayout.position.set(0, H - 1.5, z - 0.4)
    wayout.rotation.y = Math.PI
    this.scene.add(wayout)
  }

  // Illuminated canvas signboard (glows through bloom — toneMapped:false).
  sign(text, { w, h, bg = '#050A14', fg = '#22D3EE', accent = null }) {
    const tex = makeCanvasTexture(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cw, ch)
      if (accent) {
        ctx.strokeStyle = accent
        ctx.lineWidth = 8
        ctx.strokeRect(12, 12, cw - 24, ch - 24)
      }
      ctx.fillStyle = fg
      ctx.font = `bold ${Math.round(ch * 0.5)}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = `${Math.round(ch * 0.06)}px`
      ctx.fillText(text, cw / 2, ch / 2 + 2)
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }))
  }

  // ---------------------------------------------------------------- lighting
  buildLighting() {
    RectAreaLightUniformsLib.init()
    const scene = this.scene
    const H = this.H

    // ambient fill (kept low — scene.environment + neon do the work)
    scene.add(new THREE.HemisphereLight('#8FB8FF', '#0A0F1C', 0.35))

    // rect-area washes grazing the two device walls — the layer that reads as
    // "premium showroom" rather than a lit box.
    const westWash = new THREE.RectAreaLight('#BEE9FF', 5.5, 8, 1.3)
    westWash.position.set(-this.W / 2 + 0.8, H - 1.0, -1.5)
    westWash.rotation.y = Math.PI / 2
    westWash.rotation.x = -Math.PI / 8
    scene.add(westWash)
    const eastWash = new THREE.RectAreaLight('#F5D6FF', 4.5, 8, 1.3)
    eastWash.position.set(this.W / 2 - 0.8, H - 1.0, -1.5)
    eastWash.rotation.y = -Math.PI / 2
    eastWash.rotation.x = -Math.PI / 8
    scene.add(eastWash)

    // saturated accent point lights keep Volt's neon identity
    const cyan = new THREE.PointLight(V.cyan, 22, 22, 2)
    cyan.position.set(-6, 3.4, -2)
    scene.add(cyan)
    const magenta = new THREE.PointLight(V.magenta, 16, 22, 2)
    magenta.position.set(6, 3.4, 2)
    scene.add(magenta)
    const white = new THREE.PointLight('#DCEBFF', 14, 20, 2)
    white.position.set(0, 3.8, 4)
    scene.add(white)
  }

  // --------------------------------------------------------------- fixtures
  buildFixtures() {
    const W = this.W, D = this.D

    // big AR demo wall on the north wall
    arWall(this, { x: 0, z: -D / 2 + 0.2, rotY: 0, w: 6, h: 3, tagline: 'Demo any device life-size' })

    // west wall — lit device cabinet (phones / audio / watch)
    this.deviceWall({
      x: -W / 2 + 0.3, z: -1.5, rotY: Math.PI / 2, w: 7,
      label: 'MOBILE', accent: V.cyan,
      products: [ELECTRONICS_PRODUCTS[0], ELECTRONICS_PRODUCTS[1], ELECTRONICS_PRODUCTS[5], ELECTRONICS_PRODUCTS[3]],
    })
    // east wall — lit device cabinet (laptop / audio)
    this.deviceWall({
      x: W / 2 - 0.3, z: -3, rotY: -Math.PI / 2, w: 6,
      label: 'COMPUTE', accent: V.magenta,
      products: [ELECTRONICS_PRODUCTS[2], ELECTRONICS_PRODUCTS[3]],
    })

    // premium phones in glass vitrines flanking the aisle
    vitrine(this, { x: -4.5, z: -6, rotY: 0, product: ELECTRONICS_PRODUCTS[0], label: 'FLAGSHIP' })
    vitrine(this, { x: 4.5, z: -6, rotY: 0, product: ELECTRONICS_PRODUCTS[1], label: 'NOVA AIR' })

    // spotlit hero drone on a plinth in the centre (spins in update)
    const g = plinth(this, { x: 2, z: -1.5, h: 0.55, product: ELECTRONICS_PRODUCTS[4], shadow: true })
    this.droneModel = g.userData.hero

    // watch on a smaller plinth
    plinth(this, { x: -2, z: -1.5, h: 0.5, r: 0.45, product: ELECTRONICS_PRODUCTS[5], shadow: false })

    // premium checkout monolith
    cashierMonolith(this, { x: W / 2 - 3.2, z: 6, rotY: -Math.PI / 2 })
  }

  // An illuminated wall cabinet: micro-cement back, chrome shelves with LED
  // lips, products laid on the tiers and clickable. Same recipe as the SOLE
  // shoe wall, generalised for gadgets.
  deviceWall({ x, z, rotY = 0, w = 6, label = '', accent = '#22D3EE', products = [] }) {
    const g = new THREE.Group()
    const H = this.H - 0.9
    const depth = 0.55
    const back = new THREE.Mesh(roundedBox(w + 0.2, H, 0.12, 0.03), MATERIAL.microCement(V.panel, 2))
    back.position.y = H / 2
    back.receiveShadow = true
    g.add(back)
    // side pillars
    for (const sx of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.12, H, depth), MATERIAL.chrome(), sx, H / 2, 0))
    // backlit brand header
    const brand = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 0.7), MATERIAL.ledStrip('#0E7490'))
    brand.position.set(0, H - 0.5, 0.02)
    g.add(brand)
    const header = this.sign(label, { w: Math.min(w - 0.6, 4), h: 0.4, bg: '#050A14', fg: accent })
    header.position.set(0, H - 0.5, 0.05)
    g.add(header)

    const tiers = [H - 1.5, H - 2.4, H - 3.3].filter((t) => t > 0.4)
    for (const ty of tiers) {
      g.add(mesh(new THREE.BoxGeometry(w, 0.05, depth), MATERIAL.chrome(), 0, ty, 0))
      const led = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.02, 0.02), MATERIAL.ledStrip(accent))
      led.position.set(0, ty + 0.04, depth / 2 - 0.05)
      g.add(led)
    }
    // lay products across the tiers
    const perTier = Math.ceil(products.length / tiers.length)
    products.forEach((p, i) => {
      const ty = tiers[Math.floor(i / perTier)]
      const slot = i % perTier
      const usable = w - 1.2
      const px = perTier === 1 ? 0 : -usable / 2 + (slot * usable) / (perTier - 1)
      const model = normalizeToSize(p.build(), 0.5)
      model.position.set(px, ty + 0.06, 0.05)
      model.rotation.y = 0.3
      model.traverse((o) => (o.castShadow = false))
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

  // ---------------------------------------------------------------- people
  populate() {
    this.addNPC(new NPC({
      name: 'Dev',
      pos: { x: 0, z: 1 },
      heading: 0,
      palette: { shirt: '#0ea5e9', pants: '#0f172a' },
      lines: [
        'Welcome to Volt! ⚡',
        'Click any device on the walls or in the glass cases for specs and an AR preview.',
        'That’s the SkyHawk drone spinning on the centre plinth — click it!',
        'Pay at the counter whenever you’re ready.',
      ],
    }))
    this.addNPC(new NPC({
      name: 'Arjun',
      pos: { x: 5, z: 2 },
      area: { minX: -7, maxX: 7, minZ: -4, maxZ: 4 },
      palette: { shirt: '#a3e635' },
      lines: [
        'These Pulse Buds are amazing — the noise cancelling is unreal.',
        'The AR wall makes the laptop look life-size on your desk!',
      ],
    }))
  }

  spawn() {
    return { x: 0, z: 5.4, heading: Math.PI, camYaw: 0 }
  }

  update(dt) {
    super.update(dt)
    if (this.droneModel) this.droneModel.rotation.y += dt * 0.8
  }
}
