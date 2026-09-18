import * as THREE from 'three'
import { textSprite, lerp } from '../core/util.js'
import { makeHat } from '../data/products.js'
import { ARCHETYPES, makePerson } from '../data/people.js'

const DEFAULTS = { skin: '#eac393', shirt: '#3b82f6', pants: '#243244', shoes: '#e2e8f0', hair: '#3c2a21' }

// Shared geometry — every avatar in the world reuses these. Only the transforms
// and materials differ per character, so a crowd of 30 stays cheap.
const G = {}
const geo = (key, make) => (G[key] ??= make())

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.82, ...o })

// Low-poly humanoid assembled from primitives, driven by an archetype so the
// crowd contains children, adults and elders with genuinely different
// silhouettes rather than one body in different colours. See data/people.js.
export class Avatar {
  constructor(opts = {}) {
    const { name = 'Shopper', person = null, kind = null, rng = Math.random, ...palette } = opts

    // Three ways to build: an explicit person record, a random person of a given
    // archetype, or the legacy palette form used by the player and v0.1 NPCs.
    this.person = person ?? (kind ? makePerson(kind, rng) : null)
    const A = this.person?.archetype ?? ARCHETYPES.man
    this.arch = A
    const cfg = this.person
      ? {
          skin: this.person.skin,
          shirt: this.person.outfit === 'saree' ? this.person.saree : this.person.top,
          pants: this.person.bottom,
          shoes: '#2A2A2E',
          hair: this.person.hairColor,
        }
      : { ...DEFAULTS, ...palette }

    this.name = this.person?.name ?? name
    this.defaults = { shirt: cfg.shirt, shoes: cfg.shoes }
    this.walkPhase = 0
    this.walkAmt = 0
    this.pace = A.pace
    this.bounce = A.bounce

    this.m = {
      skin: mat(cfg.skin),
      shirt: mat(cfg.shirt),
      pants: mat(cfg.pants),
      shoes: mat(cfg.shoes, { roughness: 0.6 }),
      hair: mat(cfg.hair, { roughness: 0.95 }),
    }

    this.group = new THREE.Group()
    this.visual = new THREE.Group()
    this.group.add(this.visual)

    // upper body pivots at the waist so elders can stoop
    this.upper = new THREE.Group()
    this.upper.position.y = 0.86
    this.upper.rotation.x = A.stoop

    const sh = A.shoulders
    const hip = A.hips
    const lt = A.limbThick
    const belly = A.belly
    const isSkirt = this.person?.outfit === 'skirt' || this.person?.outfit === 'dress'
    const isSaree = this.person?.outfit === 'saree'

    // Only the big masses cast shadows. Every avatar part casting doubled the
    // shadow pass for ~15 meshes each; at 22 NPCs that alone was ~300 extra
    // draws per frame, and nobody can see a hand's shadow anyway.
    const M = (g, m, shadow = true) => {
      const o = new THREE.Mesh(g, m)
      o.castShadow = shadow
      return o
    }

    // ---- legs (pivot at hip, geometry hangs down so rotation.x swings them) ----
    const legGeo = geo('leg', () => {
      const g = new THREE.BoxGeometry(0.2, 0.72, 0.2)
      g.translate(0, -0.36, 0)
      return g
    })
    const shoeGeo = geo('shoe', () => {
      const g = new THREE.BoxGeometry(0.23, 0.13, 0.34)
      g.translate(0, -0.78, 0.05)
      return g
    })
    this.legL = new THREE.Group()
    this.legL.add(M(legGeo, this.m.pants), M(shoeGeo, this.m.shoes, false))
    this.legL.scale.set(lt, 1, lt)
    this.legL.position.set(-0.15 * hip, 0.86, 0)
    this.legR = new THREE.Group()
    this.legR.add(M(legGeo, this.m.pants), M(shoeGeo, this.m.shoes, false))
    this.legR.scale.set(lt, 1, lt)
    this.legR.position.set(0.15 * hip, 0.86, 0)

    // ---- torso ----
    const torso = M(geo('torso', () => new THREE.BoxGeometry(0.56, 0.74, 0.32)), this.m.shirt)
    torso.scale.set(sh, 1, belly)
    torso.position.y = 0.37
    this.upper.add(torso)

    // a skirt / dress / saree drape reads instantly as a different silhouette
    if (isSkirt || isSaree) {
      const skirt = M(
        geo('skirt', () => new THREE.CylinderGeometry(0.26, 0.42, 0.5, 14, 1, true)),
        new THREE.MeshStandardMaterial({ color: this.m.shirt.color, roughness: 0.85, side: THREE.DoubleSide })
      )
      skirt.position.y = isSaree ? -0.18 : 0.0
      skirt.scale.set(hip, isSaree ? 1.5 : 1, hip)
      this.upper.add(skirt)
      // saree pallu over one shoulder
      if (isSaree) {
        const pallu = M(geo('pallu', () => new THREE.BoxGeometry(0.16, 0.62, 0.05)), this.m.shirt)
        pallu.position.set(-0.2 * sh, 0.34, 0.17 * belly)
        pallu.rotation.z = 0.12
        this.upper.add(pallu)
      }
    }

    // ---- arms ----
    const armGeo = geo('arm', () => {
      const g = new THREE.BoxGeometry(0.15, 0.58, 0.15)
      g.translate(0, -0.29, 0)
      return g
    })
    const handGeo = geo('hand', () => {
      const g = new THREE.SphereGeometry(0.08, 10, 8)
      g.translate(0, -0.61, 0)
      return g
    })
    this.armL = new THREE.Group()
    this.armL.add(M(armGeo, this.m.shirt, false), M(handGeo, this.m.skin, false))
    this.armL.scale.setScalar(lt)
    this.armL.position.set(-0.37 * sh, 0.7, 0)
    this.armR = new THREE.Group()
    this.armR.add(M(armGeo, this.m.shirt, false), M(handGeo, this.m.skin, false))
    this.armR.scale.setScalar(lt)
    this.armR.position.set(0.37 * sh, 0.7, 0)
    this.upper.add(this.armL, this.armR)

    // ---- head ----
    this.head = new THREE.Group()
    this.head.position.y = 1.06
    this.head.scale.setScalar(A.headScale)
    const skull = M(geo('head', () => new THREE.SphereGeometry(0.26, 18, 14)), this.m.skin)
    this.head.add(skull)
    const eyeGeo = geo('eye', () => new THREE.SphereGeometry(0.033, 8, 6))
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111827 })
    for (const ex of [-0.088, 0.088]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat)
      e.position.set(ex, 0.03, 0.235)
      this.head.add(e)
    }
    this.buildHair()
    this.buildFacialHair()
    if (this.person?.accessories?.includes('glasses')) this.buildGlasses()

    this.hatAnchor = new THREE.Group()
    this.hatAnchor.position.y = 0.2
    this.head.add(this.hatAnchor)
    this.upper.add(this.head)

    this.visual.add(this.legL, this.legR, this.upper)

    if (this.person?.accessories?.includes('cane')) this.buildCane()
    if (this.person?.accessories?.includes('bag')) this.buildBag()

    this.visual.scale.setScalar(A.height)

    this.nameTag = textSprite(this.name)
    this.nameTag.position.y = 2.62 * A.height + 0.12
    this.group.add(this.nameTag)
  }

  buildHair() {
    const style = this.person?.hairStyle ?? 'short'
    const h = this.m.hair
    const M = (g, m = h) => new THREE.Mesh(g, m) // hair casts no shadow
    const cap = (phi = 0.52, r = 0.275) =>
      M(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * phi))

    switch (style) {
      case 'bald':
        break
      case 'balding':
      case 'balding-grey': {
        // a horseshoe ring rather than a cap — instantly reads as older
        const ring = M(new THREE.TorusGeometry(0.23, 0.045, 8, 20))
        ring.rotation.x = Math.PI / 2
        ring.position.y = 0.02
        this.head.add(ring)
        break
      }
      case 'bun':
      case 'bun-grey': {
        const c = cap(0.55)
        c.position.y = 0.015
        const bun = M(new THREE.SphereGeometry(0.115, 12, 10))
        bun.position.set(0, 0.1, -0.24)
        this.head.add(c, bun)
        break
      }
      case 'ponytail': {
        const c = cap(0.55)
        c.position.y = 0.015
        const tail = M(new THREE.CapsuleGeometry(0.06, 0.3, 4, 8))
        tail.position.set(0, -0.04, -0.27)
        tail.rotation.x = -0.5
        this.head.add(c, tail)
        break
      }
      case 'braid': {
        const c = cap(0.55)
        c.position.y = 0.015
        const braid = M(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8))
        braid.position.set(0, -0.14, -0.24)
        braid.rotation.x = -0.15
        this.head.add(c, braid)
        break
      }
      case 'long': {
        const c = cap(0.58)
        c.position.y = 0.01
        const fall = M(new THREE.CylinderGeometry(0.235, 0.2, 0.42, 14, 1, true))
        fall.position.set(0, -0.16, -0.05)
        this.head.add(c, fall)
        break
      }
      case 'bob': {
        const c = cap(0.6)
        const fall = M(new THREE.CylinderGeometry(0.245, 0.235, 0.22, 14, 1, true))
        fall.position.set(0, -0.06, -0.02)
        this.head.add(c, fall)
        break
      }
      case 'mop': {
        const c = cap(0.68, 0.29)
        c.position.y = -0.01
        this.head.add(c)
        break
      }
      case 'spike': {
        const c = cap(0.5)
        this.head.add(c)
        for (let i = 0; i < 5; i++) {
          const s = M(new THREE.ConeGeometry(0.045, 0.14, 6))
          s.position.set(-0.12 + i * 0.06, 0.24, -0.02 + (i % 2) * 0.05)
          s.rotation.z = (i - 2) * 0.12
          this.head.add(s)
        }
        break
      }
      case 'fade': {
        const c = cap(0.42, 0.268)
        c.position.y = 0.03
        this.head.add(c)
        break
      }
      default: {
        const c = cap(0.52)
        c.position.y = 0.01
        this.head.add(c)
      }
    }
  }

  buildFacialHair() {
    const f = this.person?.facial ?? 'none'
    if (f === 'none') return
    const grey = f.endsWith('-grey')
    const col = grey ? '#D6D3CE' : this.m.hair.color.getHexString()
    const m = new THREE.MeshStandardMaterial({ color: grey ? col : `#${col}`, roughness: 0.95 })

    if (f.startsWith('moustache')) {
      const mo = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.05), m)
      mo.position.set(0, -0.07, 0.235)
      this.head.add(mo)
    } else if (f.startsWith('beard')) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), m)
      b.position.set(0, -0.06, 0.045)
      b.scale.set(1.05, 1.35, 1.05)
      this.head.add(b)
    } else if (f.startsWith('stubble')) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.263, 14, 10, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), m)
      b.position.set(0, -0.01, 0.01)
      b.material = new THREE.MeshStandardMaterial({ color: '#4A4038', roughness: 1, transparent: true, opacity: 0.5 })
      this.head.add(b)
    }
  }

  buildGlasses() {
    const frame = new THREE.MeshStandardMaterial({ color: '#2B2B2B', roughness: 0.4, metalness: 0.3 })
    for (const ex of [-0.088, 0.088]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 14), frame)
      lens.position.set(ex, 0.03, 0.235)
      this.head.add(lens)
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), frame)
    bridge.position.set(0, 0.03, 0.24)
    this.head.add(bridge)
  }

  buildCane() {
    const g = new THREE.Group()
    const woodM = new THREE.MeshStandardMaterial({ color: '#6B4A2F', roughness: 0.7 })
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.92, 8), woodM)
    shaft.position.y = 0.46
    shaft.castShadow = false
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.021, 6, 12, Math.PI), woodM)
    grip.position.y = 0.93
    grip.rotation.set(Math.PI / 2, 0, 0)
    g.add(shaft, grip)
    g.position.set(0.34, 0, 0.1)
    this.cane = g
    this.visual.add(g)
  }

  buildBag() {
    const bagM = new THREE.MeshStandardMaterial({ color: '#7A4F33', roughness: 0.8 })
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.1), bagM)
    b.position.set(0.3, 0.34, 0.02)
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 14, Math.PI), bagM)
    strap.position.set(0.28, 0.56, 0.02)
    strap.rotation.z = 0.3
    this.upper.add(b, strap)
  }

  // Seat the character: hips drop to the bench, thighs swing forward. With
  // single-segment legs a full 90 deg reads as "legs straight out", so it stops
  // a little short of that and the arms come to rest.
  setSitting(on, seatHeight = 0.44) {
    this.sitting = on
    const h = this.arch.height
    if (on) {
      // Solve the hip angle so the foot lands on the ground rather than
      // dangling in midair. Legs are a single segment, so instead of a
      // thigh-then-shin pose the whole leg angles down-forward by however much
      // it takes to reach y=0. Short legs (children) can't reach and simply
      // hang, which is what actually happens on an adult-height bench.
      const legLen = 0.72 * h
      const theta = Math.acos(Math.min(1, seatHeight / Math.max(legLen, 0.001)))
      this.legL.rotation.x = -theta
      this.legR.rotation.x = -theta
      this.armL.rotation.x = -0.35
      this.armR.rotation.x = -0.35
      this.visual.position.y = seatHeight - h * 0.86
    } else {
      this.legL.rotation.x = 0
      this.legR.rotation.x = 0
      this.armL.rotation.x = 0
      this.armR.rotation.x = 0
      this.visual.position.y = 0
    }
  }

  update(dt, moving, running = false) {
    if (this.sitting) {
      // seated idle: just breathe, never run the walk cycle
      this.breath = (this.breath ?? Math.random() * 6) + dt * 1.5
      this.upper.position.y = 0.86 + Math.sin(this.breath) * 0.007
      return
    }
    const target = moving ? (running ? 1.35 : 1) : 0
    this.walkAmt = lerp(this.walkAmt, target, 1 - Math.pow(0.001, dt))
    if (moving) this.walkPhase += dt * (running ? 11 : 8) * this.pace
    const s = Math.sin(this.walkPhase) * 0.55 * this.walkAmt
    this.legL.rotation.x = s
    this.legR.rotation.x = -s
    // elders keep one arm on the cane, so only the free arm swings
    this.armL.rotation.x = -s * 0.8
    this.armR.rotation.x = this.cane ? -0.35 : s * 0.8
    if (this.cane) this.cane.rotation.x = s * 0.25
    this.visual.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.05 * this.walkAmt * this.bounce
    // idle breathing keeps standing characters from looking frozen
    if (this.walkAmt < 0.2) {
      this.breath = (this.breath ?? Math.random() * 6) + dt * 1.6
      this.upper.position.y = 0.86 + Math.sin(this.breath) * 0.006
    }
  }

  // wearable: {shirt:'#hex'} | {shoes:'#hex'} | {hat:{style,color}}
  applyOutfit(wearable) {
    if (wearable.shirt) this.m.shirt.color.set(wearable.shirt)
    if (wearable.shoes) this.m.shoes.color.set(wearable.shoes)
    if (wearable.hat) {
      this.hatAnchor.clear()
      const hat = makeHat(wearable.hat.style, wearable.hat.color)
      hat.scale.setScalar(1.35)
      this.hatAnchor.add(hat)
    }
  }

  resetOutfit() {
    this.m.shirt.color.set(this.defaults.shirt)
    this.m.shoes.color.set(this.defaults.shoes)
    this.hatAnchor.clear()
  }

  get hasBag() {
    return !!this.bag
  }

  // A branded shopping bag that hangs from the right hand and swings with the
  // arm as you walk (it's parented to the arm pivot).
  giveBag(product) {
    this.dropBag()
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o })
    const mk = (geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, y, z)
      m.castShadow = true
      return m
    }
    const bag = new THREE.Group()
    const bodyMat = std('#0b0d11', { roughness: 0.6 })
    bag.add(mk(new THREE.BoxGeometry(0.28, 0.34, 0.17), bodyMat, 0, 0, 0))
    // accent band + logo
    bag.add(mk(new THREE.BoxGeometry(0.285, 0.07, 0.175), std('#f43f5e'), 0, 0.02, 0))
    const logo = mk(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: '#f8fafc' }), 0, 0.02, 0.088)
    bag.add(logo)
    // a shoe box lid peeking out the top
    if (product) bag.add(mk(new THREE.BoxGeometry(0.24, 0.08, 0.14), std(product.tint || '#c2410c'), 0, 0.2, 0))
    // rope handles
    for (const sx of [-0.08, 0.08]) {
      const h = mk(new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI), std('#f8fafc'), sx, 0.19, 0)
      bag.add(h)
    }
    // hang it from the hand
    bag.position.set(0, -0.7, 0.06)
    this.armR.add(bag)
    this.bag = bag
  }

  dropBag() {
    if (this.bag) {
      this.armR.remove(this.bag)
      this.bag = null
    }
  }
}
