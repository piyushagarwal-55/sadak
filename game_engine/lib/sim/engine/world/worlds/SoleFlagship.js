import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { BaseWorld } from '../BaseWorld.js'
import { MATERIAL } from '../kit/materials.js'
import { roundedBox } from '../kit/forms.js'
import { shoeWall, plinth, vitrine, benchSeat, stool, featureWall, cashierMonolith } from '../kit/retail.js'
import { NPC } from '../NPC.js'
import { PALETTE } from '../../core/design.js'
import { makeCanvasTexture } from '../../core/util.js'
import { SNEAKER_PRODUCTS } from '../../data/products.js'
import { makePerson } from '../../data/people.js'

const S = PALETTE.sole

// "SOLE" — the flagship sneaker store. This is the first world authored FOR
// image-based lighting: it declares envKind, and its brass, glass and polished
// terrazzo depend on scene.environment to read as real materials.
//
// Room is 30 x 22 with a 5.2 m ceiling. See PRD §3.
export class SoleFlagship extends BaseWorld {
  constructor(game) {
    super(game)
    this.key = 'sole'
    this.title = 'SOLE · Flagship'
    this.camDist = 5.2
    this.envKind = 'interior'

    const W = 30
    const D = 22
    const H = 5.2

    this.scene.background = new THREE.Color(S.shell)
    this.scene.fog = new THREE.Fog(S.shell, 34, 70)

    this.buildShell(W, D, H)
    this.buildLighting(W, D, H)
    this.buildFixtures(W, D)
    this.populate()

    this.addInteractable({
      pos: () => ({ x: 0, z: D / 2 - 1.4 }),
      radius: 1.4,
      label: 'Leave SOLE (E)',
      action: (g) => g.switchWorld('outdoor', 'sole'),
    })

    this.featuredProduct = SNEAKER_PRODUCTS[0]

    this.minimap = {
      ground: '#15120F',
      areas: [{ x: 0, z: 0, w: W, d: D, color: '#241E18' }],
      roads: [],
      buildings: [],
      pois: [
        { x: 0, z: -9, color: S.accent, icon: 'W', label: 'Shoe Wall' },
        { x: 10.5, z: 7.5, color: '#6EE7B7', icon: 'P', label: 'Checkout' },
      ],
    }
  }

  buildShell(W, D, H) {
    const scene = this.scene

    // ---- floor: terrazzo with a brass inlay tracing the customer path ----
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATERIAL.terrazzo(7))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const inlay = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MATERIAL.brushedBrass())
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.008, z)
      scene.add(m)
    }
    inlay(0, 4, 0.07, 14) // door to centre
    inlay(-5, -3, 10, 0.07) // across to the wall
    inlay(6.5, 2, 0.07, 10)

    // ---- ceiling: dark plenum with track rails ----
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), MATERIAL.paint('#15130F', 0.95))
    ceil.rotation.x = Math.PI / 2
    ceil.position.y = H
    scene.add(ceil)
    const rails = [-7, -2, 3, 8]
    for (const rz of rails) {
      const rail = new THREE.Mesh(roundedBox(W - 2, 0.08, 0.1, 0.02), MATERIAL.paint('#2A2724', 0.5))
      rail.position.set(0, H - 0.12, rz)
      scene.add(rail)
    }
    // track heads instanced — 36 individual meshes was 36 draw calls for props
    // nobody looks at
    const headGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.16, 8)
    const heads = new THREE.InstancedMesh(headGeo, MATERIAL.paint('#1B1917', 0.4), rails.length * 9)
    const dm = new THREE.Object3D()
    let hi = 0
    for (const rz of rails) {
      for (let i = -4; i <= 4; i++) {
        dm.position.set(i * 3, H - 0.24, rz)
        dm.updateMatrix()
        heads.setMatrixAt(hi++, dm.matrix)
      }
    }
    heads.instanceMatrix.needsUpdate = true
    scene.add(heads)

    // ---- walls ----
    // Dark shell, light niches. A premium sneaker room is a dark box with lit
    // product — light walls under a wall-wash rig just read as a blown-out
    // showroom, which is exactly what the first pass looked like.
    const wallMat = MATERIAL.microCement('#2A2521', 4)
    const T = 0.3
    const addWall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
      m.position.set(x, y, z)
      m.receiveShadow = true
      scene.add(m)
    }
    addWall(W, H, T, 0, H / 2, -D / 2)
    this.addCollider(-W / 2, W / 2, -D / 2 - T, -D / 2 + T, H)
    addWall(T, H, D, -W / 2, H / 2, 0)
    this.addCollider(-W / 2 - T, -W / 2 + T, -D / 2, D / 2, H)
    addWall(T, H, D, W / 2, H / 2, 0)
    this.addCollider(W / 2 - T, W / 2 + T, -D / 2, D / 2, H)

    // south wall with a door gap
    const doorW = 3.4
    const seg = (W - doorW) / 2
    for (const sx of [-(doorW / 2 + seg / 2), doorW / 2 + seg / 2]) {
      addWall(seg, H, T, sx, H / 2, D / 2)
      this.addCollider(sx - seg / 2, sx + seg / 2, D / 2 - T, D / 2 + T, H)
    }
    addWall(doorW, H - 3.2, T, 0, 3.2 + (H - 3.2) / 2, D / 2)
    this.addCollider(-doorW / 2, doorW / 2, D / 2 - T, D / 2 + T, H)

    // glowing threshold so the exit reads as a way out
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(doorW, 3.2), new THREE.MeshBasicMaterial({ color: '#F0D6B8', toneMapped: false }))
    glow.position.set(0, 1.6, D / 2 - 0.16)
    glow.rotation.y = Math.PI
    scene.add(glow)

    // fluted feature wall behind the till
    featureWall(this, { x: W / 2 - 0.2, z: 6, rotY: -Math.PI / 2, width: 8, height: H - 0.4 })

    // brand wordmark on the rear wall
    const mark = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.2),
      new THREE.MeshBasicMaterial({
        map: makeCanvasTexture(1024, 205, (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h)
          ctx.fillStyle = S.accent
          ctx.font = 'bold 150px ui-sans-serif, system-ui'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.letterSpacing = '38px'
          ctx.fillText('SOLE', w / 2, h / 2)
        }),
        transparent: true,
        toneMapped: false,
      })
    )
    mark.position.set(-9, 4.1, -D / 2 + 0.2)
    scene.add(mark)

    this.bounds = { minX: -W / 2 + 0.5, maxX: W / 2 - 0.5, minZ: -D / 2 + 0.5, maxZ: D / 2 - 0.5 }
  }

  buildLighting(W, D, H) {
    RectAreaLightUniformsLib.init()
    const scene = this.scene

    // Intensities are in three's physical units (candela / nits), which run far
    // higher than the legacy 0–1 values used elsewhere in this repo. Tuned
    // against ACES tone mapping at exposure 1.05.

    // layer 1 — ambient fill
    // No AmbientLight: scene.environment already supplies uniform fill, and
    // stacking both is what blew the room out to white.
    scene.add(new THREE.HemisphereLight('#FFE9CE', '#1A130C', 0.22))

    // layer 2 — RectAreaLights grazing the shoe wall. This is the layer that
    // actually sells "high-end retail"; a point light cannot do a wall wash.
    for (const x of [-8, 0, 8]) {
      const wash = new THREE.RectAreaLight('#FFEBCB', 6.5, 8, 1.2)
      wash.position.set(x, H - 0.7, -D / 2 + 2.2)
      wash.rotation.x = -Math.PI / 2.4
      scene.add(wash)
    }
    const sideWash = new THREE.RectAreaLight('#FFE8C4', 8, 1.2, 9)
    sideWash.position.set(-W / 2 + 0.8, H - 1.0, 2)
    sideWash.rotation.y = Math.PI / 2
    sideWash.rotation.x = -Math.PI / 8
    scene.add(sideWash)

    // layer 3 — accent spots live on the plinths (see buildFixtures); only
    // those cast shadows, capped at 3 for the frame budget.
    for (const [fx, fz] of [[0, 6], [-8, 2], [8, 2], [0, -4]]) {
      const fill = new THREE.PointLight('#FFD9A8', 13, 24, 2)
      fill.position.set(fx, 4.2, fz)
      scene.add(fill)
    }
  }

  buildFixtures(W, D) {
    // the signature wall — 8 bays x 5 rows, instanced
    shoeWall(this, {
      x: 0, z: -D / 2 + 0.45, rotY: 0,
      bays: 8, rows: 5,
      products: [...SNEAKER_PRODUCTS, ...SNEAKER_PRODUCTS, ...SNEAKER_PRODUCTS, ...SNEAKER_PRODUCTS],
    })

    // hero plinths down the centre — three shadow-casting spots, the cap
    // only the centre hero casts a shadow — each shadow-casting light is a full
    // extra scene pass, and the PRD caps interiors at 3
    plinth(this, { x: -4.5, z: -1, product: SNEAKER_PRODUCTS[0], shadow: false })
    plinth(this, { x: 0, z: 1.5, h: 0.55, product: SNEAKER_PRODUCTS[7], shadow: true })
    plinth(this, { x: 4.5, z: -1, product: SNEAKER_PRODUCTS[4], shadow: false })

    // archive vitrines against the west wall
    vitrine(this, { x: -W / 2 + 1.2, z: -4, rotY: Math.PI / 2, product: SNEAKER_PRODUCTS[5], label: 'ARCHIVE' })
    vitrine(this, { x: -W / 2 + 1.2, z: -0.5, rotY: Math.PI / 2, product: SNEAKER_PRODUCTS[9], label: 'GRAIL' })

    // seating island facing the wall — where you actually try shoes on
    benchSeat(this, { x: -2, z: 4.5, rotY: Math.PI })
    benchSeat(this, { x: 3, z: 4.5, rotY: Math.PI })
    for (const [x, z] of [[-6.5, 3.5], [6.5, 3.5], [-6.5, 6], [6.5, 6]]) stool(this, { x, z })

    cashierMonolith(this, { x: W / 2 - 3.2, z: 7.5, rotY: -Math.PI / 2 })

    // try-on prompt at the bench — reuses the existing trial-room panel
    this.addInteractable({
      pos: () => ({ x: 0.5, z: 4.5 }),
      radius: 2.2,
      label: 'Try on sneakers (E)',
      action: (g) => g.ui.openTryOn(),
    })
  }

  populate() {
    const rng = () => Math.random()
    const staff = makePerson('woman', rng)
    staff.name = 'Nikita'
    staff.top = '#1C1A19'
    staff.bottom = '#2A2724'
    this.addNPC(new NPC({
      person: staff, pos: { x: 2.5, z: 8 }, heading: Math.PI,
      lines: [
        'Welcome to SOLE. Everything on the wall is in your size unless it says otherwise.',
        'The Vector 01 on the centre plinth is our flagship — full-grain upper, brass eyelets.',
        'Sit on the bench and press E to try a pair on. Mirrors are along the west wall.',
        'Solar Flare is the current drop. It goes fast, so don’t think about it too long.',
      ],
    }))

    const shopper = makePerson('boy', rng)
    this.addNPC(new NPC({
      person: shopper, pos: { x: -3, z: 2 },
      area: { minX: -8, maxX: 8, minZ: -3, maxZ: 7 },
      lines: ['I’ve been waiting three weeks for this drop.', 'Do these come in the volt colourway?'],
    }))

    const dad = makePerson('uncle', rng)
    this.addNPC(new NPC({
      person: dad, pos: { x: 5, z: 5 },
      area: { minX: -6, maxX: 9, minZ: 0, maxZ: 8 },
      lines: ['Sixteen thousand rupees. For shoes.', 'In my day a good pair lasted ten years, beta.'],
    }))
  }

  spawn() {
    // Deep enough that the follow-camera sits inside the room. Spawning by the
    // door put the camera behind the south wall, and the occlusion pass then
    // yanked it to minimum distance — you ended up nose-to-nose with your own
    // name tag.
    return { x: 0, z: 4.5, heading: Math.PI, camYaw: 0 }
  }
}
