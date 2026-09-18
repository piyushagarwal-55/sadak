import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BaseWorld } from '../engine/world/BaseWorld.js'
import { SURFACE } from '../engine/world/LegacyZones.js'
import { Sky } from '../engine/world/kit/sky.js'
import { streetLamp, bollard, bin } from '../engine/world/kit/street.js'
import { planter } from '../engine/world/kit/nature.js'
import { buildBuildingParts } from '@/lib/game/buildings'
import { createMaterialLibrary } from '@/lib/game/materials'
import { mulberry32, facadeTexture } from '@/lib/game/props'
import { makeCharminar } from '@/lib/game/assets/cities'
import { makeBazaarGate } from '@/lib/game/assets/delhi'
import { STALLS, handcart, cratePile, sackPile, gasCylinder, plasticChair } from '../kit/stalls'
import { Cow } from '../systems/crowd'
import { MarketLife } from '../systems/market-life'
import { signBoard, shopNamesFor, BOARD_PALETTE } from '../kit/signage'
import { GeoBucket } from '../kit/merge'
import { makeMarker, updateMarker, setMarkerState, MARKER_COLOURS } from '../kit/marker'

/**
 * THE BAZAAR QUARTER.
 *
 * Not a lane — a quarter. A main gali running north to the gate, two cross
 * galis, four blocks of old shophouses between them, stalls down every edge,
 * and a city standing around the whole thing.
 *
 * WHAT THE FIRST VERSION GOT WRONG
 *
 * It was one 50 m corridor of terraces with lit glass in every bay. That is the
 * vocabulary of a shopping centre: a bazaar's ground floor is an open recess
 * with goods spilling out of it under a painted board, and the colour comes
 * from produce and cloth, not from backlit vitrines. It was also too small and
 * it floated — nothing beyond the lane, so the eye fell off the edge of the
 * world. A premium complex is a real venue, but it is a DIFFERENT venue, and it
 * already exists in the ShopVerse worlds.
 *
 * HOW IT IS PUT TOGETHER
 *
 *        ┌──── city ring ────────────────────────────┐
 *        │           gate + Charminar                │
 *        │        ┌───┐   main   ┌───┐               │
 *        │        │ B │   gali   │ B │               │
 *        │   ═════╧═══╧══════════╧═══╧═════  cross B │
 *        │        ┌───┐          ┌───┐               │
 *        │        │ A │          │ A │               │
 *        │   ═════╧═══╧══════════╧═══╧═════  cross A │
 *        │              you enter here               │
 *        └───────────────────────────────────────────┘
 *
 * Every block is merged into one geometry per material, so four blocks of
 * twelve shopfronts cost about sixteen draw calls rather than two hundred —
 * which matters, because the demo laptop has an Intel UHD and no discrete GPU.
 *
 * Stall SLOTS are declared here and filled by the compiler later; until then
 * they take a sensible default mix. That split is the whole architecture: the
 * place is authored, the contents are chosen.
 */

/* --- the plan, in metres ------------------------------------------- */

const LANE_HW = 5              // main gali half-width
const CROSS_HW = 4             // cross gali half-width
const LANE_Z0 = -30            // where the player walks in
const LANE_Z1 = 34             // the gate end
const CROSS_A_Z = -8
const CROSS_B_Z = 16
const QUARTER_HX = 32          // how far the galis run east-west
const BLOCK_D = 9              // depth of a shophouse block
const BAY_W = 5
const GATE_Z = LANE_Z1 + 3

const GROUND_TINT = { mud: 0xb09a72, kota: 0x8e8578, asphalt: 0x55585f }

/** A default mix so the quarter is worth walking before the compiler exists. */
/**
 * What is being sold, in the order it is laid out.
 *
 * A real mandi is not evenly mixed: it is mostly vegetables and fruit, with one
 * of everything else scattered through. The order matters as much as the
 * proportions — the list is walked down the lane, so two of the same pitch next
 * to each other is what makes a street look copy-pasted, and the ground sheets
 * are spaced out because their whole job is to break the run of trestles.
 */
/**
 * What the bays sell, cycled down the street.
 *
 * Every neighbour is a different trade, because the thing that made the first
 * lane read as one shop copy-pasted fifty times was not the architecture — the
 * architecture already varied — but that every bay had the same goods in it.
 */
const TRADES = ['kirana', 'cloth', 'hardware', 'electrical', 'kirana', 'sweets', 'cloth', 'hardware']

/**
 * Goods palettes.
 *
 * Muted, with the saturation saved for labels. Real packaging is mostly beige
 * card and dull tin; a shelf of primary colours is the tell that nobody looked
 * at a photograph.
 */
const KIRANA = [0xc8b08a, 0xa8a49a, 0xd9c48f, 0x8c7b5e, 0xbf6a3a, 0x6f7f5a, 0xcfc2a8]
const GRAIN = [0xe8dcb8, 0xd9b35c, 0xc2793a, 0xa8b070]
const CLOTH_TONES = [0xb83a5e, 0x2f6fb5, 0xd9a521, 0x2f7f5a, 0x6a3f9e, 0xe0603a, 0xefe6d8, 0x1f4f8f]
const PLASTIC = [0xd94f3d, 0x2f9edf, 0x3fae5a, 0xe8a81f, 0xb84fa8]
const SWEET = [0xe8b84a, 0xd9762f, 0xf0dfa8, 0xc25a3a, 0xe8d06a]
const CARTON = [0xbfa483, 0xa8927a, 0xcdb896, 0x8f7f6a]

const DEFAULT_STALLS = [
  'veg_stall', 'fruit_stall', 'flower_stall', 'spice_stall',
  'ground_sheet', 'cloth_stall', 'veg_stall', 'pot_stall',
  'fruit_stall', 'chai_tapri', 'coconut_stall', 'veg_stall',
  'bangle_stall', 'ground_sheet', 'fish_stall', 'fruit_stall',
  'plastic_stall', 'veg_stall', 'flower_stall', 'cloth_stall',
  'spice_stall', 'ground_sheet', 'veg_stall', 'bangle_stall',
]

export class Bazaar extends BaseWorld {
  /**
   * @param {object} game the SimHost
   * @param {{
   *   title?: string, theme: object, seed?: number,
   *   shape?: {overhead?: 'sky'|'tarp'|'tin', ground?: 'mud'|'kota'|'asphalt', density?: 'sparse'|'busy'|'packed'},
   *   stalls?: string[], hero?: 'charminar'|'none',
   * }} spec
   */
  constructor(game, spec) {
    super(game)
    this.key = 'bazaar'
    this.spec = spec
    this.title = spec.title ?? 'Bazaar'
    this.theme = spec.theme
    this.shape = { overhead: 'tarp', ground: 'kota', density: 'busy', ...(spec.shape ?? {}) }
    this.hero = spec.hero ?? 'charminar'
    this.language = spec.language ?? 'hi-IN'
    // Boards are handed out in order so no two neighbours share a name, and
    // the compiler can override any of them per scenario.
    this.names = spec.shopNames ?? shopNamesFor(this.language).names
    this.script = shopNamesFor(this.language).script
    this.nameIndex = 0

    // The galis are 8-10 m across, so the ShopVerse default of 6.5 put the
    // camera through a shopfront every time the player hugged one side.
    this.camDist = 5.4
    this.bounds = { minX: -QUARTER_HX - 3, maxX: QUARTER_HX + 3, minZ: LANE_Z0 - 8, maxZ: GATE_Z + 3 }
    this.envKind = 'none'

    this.rand = mulberry32(spec.seed ?? 20260918)
    this.mats = createMaterialLibrary(game.renderer)
    /** Filled by `buildBlocks`; the compiler writes into these later. */
    this.stallSlots = []
    /**
     * Everything in the quarter that never moves ends up here and is flushed to
     * one mesh per material at the end. Measured before this existed: fifty
     * shopfronts at twelve meshes each were spending six hundred draw calls —
     * the whole budget of an Intel UHD, on scenery, before a single shopper.
     */
    this.statics = new GeoBucket()
    /**
     * The same, for things that must not cast: the tarps overhead are cloth
     * that filters light, and putting them in the shadow pass blacks out the
     * whole gali. Shadow casting is a per-mesh flag, so they need their own
     * bucket rather than their own material.
     */
    this.staticsNoShadow = new GeoBucket()
    this._matCache = new Map()

    // Timed because the loading bar is the first thing anyone sees, and the
    // only way to know which stage is worth optimising is to have measured it.
    const t0 = performance.now()
    this.buildSky()
    this.buildGround()
    this.defineZones()
    this.buildBlocks()
    this.buildStalls()
    this.buildCanopies()
    this.buildGate()
    this.buildCityRing()
    this.buildStreetFurniture()
    this.buildFestoon()
    const t1 = performance.now()

    // One flush for the entire quarter's static dressing.
    const merged =
      this.statics.flush(this.scene) +
      this.staticsNoShadow.flush(this.scene, { castShadow: false })
    const t2 = performance.now()

    this.buildLife()
    const t3 = performance.now()
    console.info(
      `[bazaar] ${merged} static draw calls · ` +
        `dressing ${(t1 - t0) | 0}ms · merge ${(t2 - t1) | 0}ms · life ${(t3 - t2) | 0}ms`
    )
  }

  /**
   * Materials are bucketed by identity, so two shopfronts asking for the same
   * brown must get the same object back or nothing merges.
   */
  mat(key, make) {
    let m = this._matCache.get(key)
    if (!m) {
      m = make()
      this._matCache.set(key, m)
    }
    return m
  }

  /* ------------------------------------------------------------------ *
   * Sky and light
   * ------------------------------------------------------------------ */

  buildSky() {
    const t = this.theme
    this.skyDome = new Sky({
      top: t.sky[0], mid: t.sky[2], bottom: t.sky[4],
      sun: hex(t.sunColour),
      sunDir: [0.42, 0.26, -0.86],
      sunSize: 0.018,
      cloud: '#FFF0DC', cloudAlpha: 0.5, stars: 0,
      fog: hex(t.fog),
    }).addTo(this)

    this.scene.fog = new THREE.Fog(t.fog, 55, 240)

    // A covered market is lit almost entirely by bounce: the tarps take the sun
    // and what reaches the ground has come off the walls and the street. The
    // first pass had one hemisphere light and no ambient at all, so under the
    // canopies it went black. These are lifted well above the open-street
    // values the districts use, because this street has a roof.
    this.scene.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, (t.hemiIntensity ?? 0.95) * 1.9))
    this.scene.add(new THREE.AmbientLight(0xfff0dc, (t.ambient ?? 0.32) + 0.34))

    const sun = new THREE.DirectionalLight(t.sunColour, t.sunIntensity ?? 1.9)
    sun.position.copy(this.skyDome.keyLightPosition(70))
    sun.castShadow = true
    // One 2048 map over the quarter only. The city ring is unlit by the shadow
    // camera on purpose: nobody walks there and it doubles the frustum.
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 170
    sun.shadow.camera.left = -46
    sun.shadow.camera.right = 46
    sun.shadow.camera.top = 52
    sun.shadow.camera.bottom = -52
    sun.shadow.bias = -0.0006
    sun.target.position.set(0, 0, 2)
    this.scene.add(sun, sun.target)
    this.sun = sun
  }

  /* ------------------------------------------------------------------ *
   * Ground
   * ------------------------------------------------------------------ */

  buildGround() {
    const t = this.theme
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      this.mats.tint('dry_mud', t.ground, 60)
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const paving = this.mats.tint(
      this.shape.ground === 'asphalt' ? 'asphalt' : 'concrete',
      GROUND_TINT[this.shape.ground] ?? GROUND_TINT.kota,
      18
    )
    for (const [w, d, x, z] of [
      [LANE_HW * 2, LANE_Z1 - LANE_Z0 + 10, 0, (LANE_Z0 + LANE_Z1) / 2 - 3],
      [QUARTER_HX * 2, CROSS_HW * 2, 0, CROSS_A_Z],
      [QUARTER_HX * 2, CROSS_HW * 2, 0, CROSS_B_Z],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paving)
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.02, z)
      m.receiveShadow = true
      this.scene.add(m)
    }

    // The road the quarter opens onto, so the bazaar sits in a city rather than
    // beginning nowhere.
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 14),
      this.mats.tint('asphalt', t.tarmac, 26)
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(0, 0.015, LANE_Z0 - 11)
    road.receiveShadow = true
    this.scene.add(road)

    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 0.24),
      new THREE.MeshBasicMaterial({ color: t.lane ?? 0xf0e6b8 })
    )
    line.rotation.x = -Math.PI / 2
    line.position.set(0, 0.03, LANE_Z0 - 11)
    this.scene.add(line)
  }

  /**
   * Walkability. Colliders say "you hit a thing"; zones say "this ground is not
   * yours", and `nearestLegal` pushes anything placed badly back onto legal
   * ground — the safety net that makes generated placement survivable.
   */
  defineZones() {
    const Z = this.zones
    Z.add(SURFACE.PLAZA, -LANE_HW, LANE_HW, LANE_Z0 - 4, LANE_Z1)
    Z.add(SURFACE.PLAZA, -QUARTER_HX, QUARTER_HX, CROSS_A_Z - CROSS_HW, CROSS_A_Z + CROSS_HW)
    Z.add(SURFACE.PLAZA, -QUARTER_HX, QUARTER_HX, CROSS_B_Z - CROSS_HW, CROSS_B_Z + CROSS_HW)
    Z.add(SURFACE.ROAD, -100, 100, LANE_Z0 - 18, LANE_Z0 - 4)
    for (const b of this.blockRects()) {
      Z.add(SURFACE.BUILDING, b.x0, b.x1, b.z0, b.z1)
    }
  }

  /** The four shophouse blocks that make the galis into a grid. */
  blockRects() {
    const inner = LANE_HW
    const outer = QUARTER_HX
    const bands = [
      [CROSS_A_Z + CROSS_HW, CROSS_B_Z - CROSS_HW],
      [CROSS_B_Z + CROSS_HW, LANE_Z1],
    ]
    const rects = []
    for (const [z0, z1] of bands) {
      rects.push({ x0: -outer, x1: -inner, z0, z1, side: -1 })
      rects.push({ x0: inner, x1: outer, z0, z1, side: 1 })
    }
    // Two more below the first cross gali, so the entrance is enclosed too.
    rects.push({ x0: -outer, x1: -inner, z0: LANE_Z0, z1: CROSS_A_Z - CROSS_HW, side: -1 })
    rects.push({ x0: inner, x1: outer, z0: LANE_Z0, z1: CROSS_A_Z - CROSS_HW, side: 1 })
    return rects
  }

  /* ------------------------------------------------------------------ *
   * Shophouse blocks
   * ------------------------------------------------------------------ */

  /**
   * Old shophouses, two or three floors, merged per block.
   *
   * Merging matters more than it looks: four blocks of a dozen bays each is
   * ~50 buildings, and one mesh per building would be 200 draw calls before a
   * single stall. Merged by material it is four.
   */
  buildBlocks() {
    const style = this.theme.archStyle ?? 'mughal'
    const palette = this.theme.buildings ?? [0xe8dcc0]

    for (const rect of this.blockRects()) {
      const shell = []
      const metal = []
      const signage = []
      const glass = []

      const bag = { shell, metal, signage, glass, style, palette }
      // The main gali always. A cross gali on whichever side the block meets one.
      this.layEdge(rect, 'inner', bag)
      if (touchesCross(rect.z0)) this.layEdge(rect, 'south', bag)
      if (touchesCross(rect.z1)) this.layEdge(rect, 'north', bag)

      const add = (geos, mat) => {
        if (!geos.length) return
        const merged = BufferGeometryUtils.mergeGeometries(geos, false)
        if (!merged) return
        const m = new THREE.Mesh(merged, mat)
        m.castShadow = true
        m.receiveShadow = true
        this.scene.add(m)
      }
      add(shell, this.mats.tint('weathered_plaster', palette[0], 5))
      add(metal, this.mats.tint('rusted_metal', 0x7d848b, 3))
      add(signage, this.mats.tint('painted_wood', this.pickCanopy(), 3))
      add(glass, new THREE.MeshStandardMaterial({ color: 0x2e3846, roughness: 0.3, metalness: 0.1 }))

      this.addCollider(rect.x0, rect.x1, rect.z0, rect.z1, 11)
    }
  }

  /**
   * Lays a run of bays along one edge of a block and records a stall slot in
   * the gali in front of each.
   *
   * Every edge is described by where its frontage line is and which way is OUT,
   * so there is exactly one place that knows about orientation. The first
   * version computed a rotation and then fought it with a `lookAt`, and half
   * the shops ended up facing into their own block.
   */
  layEdge(rect, edge, bag) {
    const { shell, metal, signage, glass, style, palette } = bag

    // frontage line, outward direction, and the axis bays run along
    let line
    let out
    let axis
    if (edge === 'inner') {
      line = rect.side > 0 ? rect.x0 : rect.x1
      out = rect.side > 0 ? { x: -1, z: 0 } : { x: 1, z: 0 }
      axis = 'z'
    } else if (edge === 'south') {
      line = rect.z0
      out = { x: 0, z: -1 }
      axis = 'x'
    } else {
      line = rect.z1
      out = { x: 0, z: 1 }
      axis = 'x'
    }

    const from = axis === 'z' ? rect.z0 : rect.x0
    const to = axis === 'z' ? rect.z1 : rect.x1
    const count = Math.floor((to - from) / BAY_W)
    if (count < 1) return

    // +Z of a bay points out of the block.
    const rotY = out.x === 0 ? (out.z > 0 ? 0 : Math.PI) : out.x > 0 ? Math.PI / 2 : -Math.PI / 2

    for (let i = 0; i < count; i++) {
      const along = from + (i + 0.5) * ((to - from) / count)
      // The building mass sits half a block DEEP of the frontage line.
      const cx = axis === 'z' ? line + out.x * -BLOCK_D / 2 : along
      const cz = axis === 'z' ? along : line + out.z * -BLOCK_D / 2
      const fx = axis === 'z' ? line : along
      const fz = axis === 'z' ? along : line

      // Two floors, occasionally three. Each extra floor is ~2,000 triangles
      // per bay across fifty bays, spent on windows above the eye line.
      const floors = this.rand() > 0.78 ? 3 : 2
      const parts = buildBuildingParts(BAY_W, BLOCK_D, floors, Math.floor(this.rand() * 1e6), style)
      const colour = palette[Math.floor(this.rand() * palette.length)]

      const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, 0, cz)
      for (const [geo, list] of [
        [parts.shell, shell], [parts.metal, metal],
        [parts.signage, signage], [parts.glass, glass],
      ]) {
        const g = geo.clone()
        g.applyMatrix4(m)
        list.push(g)
      }

      // Boards on the main gali, and every third bay on a cross gali.
      const withBoard = edge === 'inner' || i % 3 === 0
      this.buildShopfront(fx, fz, rotY, colour, withBoard)

      // A stall's +Z is its customer side, and `rotY` already points out of the
      // block, so it is used as-is. The half-turn that used to be added here
      // faced every stall at the wall behind it and put its customers in the
      // half-metre gap between the two.
      this.stallSlots.push({
        id: `${edge}${rect.side}-${Math.round(from)}-${i}`,
        x: fx + out.x * 2.4,
        z: fz + out.z * 2.4,
        rotY,
      })
    }
  }

  /**
   * The open shopfront, as geometry rather than objects.
   *
   * A recess you can see into, goods on a ledge, an awning — never a pane of
   * lit glass, and never a run of dead shutters; one bay in six gets a
   * half-down shutter because real markets have them and an unbroken row of
   * open shops looks staged.
   *
   * Everything here goes into the shared bucket. The board is the exception:
   * each carries its own painted canvas, so it cannot merge with anything, and
   * only bays on the main gali get one — fifty unique textures would cost more
   * draw calls than the rest of the quarter put together.
   */
  buildShopfront(x, z, rotY, colour, withBoard) {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z)

    /** Everything here bakes into the shared bucket through one matrix. */
    const push = (geo, material) => this.statics.add(geo, material, m)
    const plane = (w, h, px, py, pz) => {
      const g = new THREE.PlaneGeometry(w, h)
      g.translate(px, py, pz)
      return g
    }
    const box = (w, h, d, px, py, pz, rx = 0, ry = 0) => {
      const g = new THREE.BoxGeometry(w, h, d)
      if (rx) g.rotateX(rx)
      if (ry) g.rotateY(ry)
      g.translate(px, py, pz)
      return g
    }
    const cyl = (rTop, rBot, h, px, py, pz, radial = 8, rx = 0) => {
      const g = new THREE.CylinderGeometry(rTop, rBot, h, radial)
      if (rx) g.rotateX(rx)
      g.translate(px, py, pz)
      return g
    }
    const blob = (r, px, py, pz, sy = 0.7) => {
      const g = new THREE.SphereGeometry(r, 7, 5)
      g.scale(1, sy, 1)
      g.translate(px, py, pz)
      return g
    }
    /** Memoised by colour, so the whole quarter shares one mesh per tone. */
    const goods = (hex) =>
      this.mat(`goods-${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.82 }))

    const dark = this.mat('recess', () => new THREE.MeshBasicMaterial({ color: 0x1a1510 }))
    push(plane(BAY_W - 0.8, 2.6, 0, 1.4, 0.06), dark)

    // One bay in six is shut. Real markets have them, and an unbroken row of
    // open shops looks staged.
    if (this.rand() > 0.84) {
      push(
        box(BAY_W - 0.8, 1.5, 0.1, 0, 2.05, 0.12),
        this.mat('shutter', () => this.mats.tint('corrugated_metal', 0x8f9aa2, 2))
      )
    } else {
      this.dressShop(this.pickTrade(), { push, box, cyl, blob, plane, goods })
      // Bare bulb light spilling out of the recess, which is what you actually
      // see of a deep shop from the street.
      push(
        plane(BAY_W - 1.2, 1.1, 0, 2.15, 0.07),
        this.mat('shopglow', () =>
          new THREE.MeshBasicMaterial({ color: 0xffdca8, transparent: true, opacity: 0.28 })
        )
      )
    }

    push(
      box(BAY_W - 0.5, 0.07, 1.3, 0, 2.78, 0.78, -0.24),
      this.mat(`awning-${colour}`, () => this.mats.tint('tarpaulin', this.pickCanopy(), 2))
    )

    if (!withBoard) return

    // The loudest thing on an Indian shopfront, and the one piece of text a
    // judge will actually read, so it is in the city's own script.
    const name = this.names[this.nameIndex % this.names.length]
    const palette = BOARD_PALETTE[this.nameIndex % BOARD_PALETTE.length]
    this.nameIndex++
    const board = signBoard({
      native: name.native,
      roman: name.roman,
      script: this.script,
      bg: palette.bg,
      fg: palette.fg,
      width: BAY_W - 0.35,
      height: 0.8,
    })
    board.position.set(x, 3.15, z)
    board.rotation.y = rotY
    board.translateZ(0.22)
    this.scene.add(board)

    // The slab the board is nailed to. Flat colour, so it merges with every
    // other one in the quarter and the board itself stays a single quad.
    push(
      box(BAY_W - 0.2, 0.95, 0.12, 0, 3.15, 0.14),
      this.mat('board-backing', () => this.mats.tint('painted_wood', 0x2a2118, 3))
    )
  }

  /** Cycled rather than rolled, so no two neighbours sell the same thing. */
  pickTrade() {
    this.tradeIndex = (this.tradeIndex ?? 0) + 1
    return TRADES[this.tradeIndex % TRADES.length]
  }

  /**
   * What is inside the shop.
   *
   * The first version put eight big coloured cubes on a plank in every bay and
   * it looked exactly like eight big coloured cubes on a plank. Two things were
   * wrong with it. Goods in a real shop are SMALL and MANY — the eye reads
   * density as merchandise and sparseness as programmer art — and a kirana, a
   * cloth shop and a hardware shop do not look remotely alike, so a street of
   * identical ledges reads as one shop repeated fifty times.
   *
   * So each bay is dressed for a trade, packed tight, in muted packaging
   * colours with the bright notes saved for labels. It is all still geometry in
   * the shared bucket: a shelf of fourteen tins costs triangles, not draw
   * calls, because the whole quarter shares one material per tone.
   *
   * Local axes: +Z points out into the gali, origin on the ground at the
   * middle of the bay.
   */
  dressShop(trade, g) {
    const { push, box, cyl, blob, plane, goods } = g
    const wood = this.mat('shelf', () => this.mats.tint('painted_wood', 0x6b4a2e, 2))
    const W = BAY_W - 0.9

    // A counter across the front. Every one of these shops has one, and it is
    // what stops the goods from reading as floating in a hole.
    push(box(W, 0.12, 0.62, 0, 0.95, 0.38), wood)
    push(box(W, 0.82, 0.08, 0, 0.5, 0.64), wood)

    /** Three shelves up the back wall — the spine of most of these trades. */
    const shelves = (ys, depth = 0.42, zc = 0.28) => {
      for (const y of ys) push(box(W, 0.05, depth, 0, y, zc), wood)
    }
    /** Fills a shelf with `n` items, alternating shapes, tight enough to read. */
    const row = (y, zc, n, palette, make) => {
      const step = W / n
      for (let i = 0; i < n; i++) {
        const px = -W / 2 + step * (i + 0.5)
        make(px, y, zc, goods(palette[Math.floor(this.rand() * palette.length)]), i)
      }
    }

    switch (trade) {
      /* ---- Kirana: tins and packets in rows, sacks of grain on the floor. */
      case 'kirana': {
        shelves([1.22, 1.68, 2.14])
        for (const y of [1.22, 1.68, 2.14]) {
          row(y, 0.28, 13, KIRANA, (px, sy, pz, mat, i) => {
            if (i % 3 === 2) push(cyl(0.062, 0.062, 0.2, px, sy + 0.125, pz, 7), mat)
            else push(box(0.14, 0.19 + this.rand() * 0.05, 0.13, px, sy + 0.125, pz), mat)
          })
        }
        // Open sacks at the front of the counter, rolled down, grain showing.
        for (let i = 0; i < 3; i++) {
          const px = -1.2 + i * 1.2
          const sack = this.mat('sack', () => new THREE.MeshStandardMaterial({ color: 0xc4a574, roughness: 1 }))
          push(cyl(0.2, 0.24, 0.38, px, 0.19, 0.72, 9), sack)
          push(cyl(0.23, 0.2, 0.09, px, 0.42, 0.72, 9), sack)
          push(blob(0.19, px, 0.44, 0.72, 0.55), goods(GRAIN[i % GRAIN.length]))
        }
        break
      }

      /* ---- Cloth: bolts stacked flat, rolls standing, one length hanging. */
      case 'cloth': {
        // Stacks of folded bolts. Slightly uneven, because a hand-stacked pile
        // is never square, and the unevenness is most of what sells it.
        for (let col = 0; col < 5; col++) {
          const px = -W / 2 + (W / 5) * (col + 0.5)
          const n = 4 + Math.floor(this.rand() * 4)
          for (let k = 0; k < n; k++) {
            const mat = goods(CLOTH_TONES[Math.floor(this.rand() * CLOTH_TONES.length)])
            push(
              box(0.68, 0.085, 0.42, px + (this.rand() - 0.5) * 0.08, 1.06 + k * 0.088, 0.3, 0, (this.rand() - 0.5) * 0.09),
              mat
            )
          }
        }
        // Rolls on end in the corner.
        for (let i = 0; i < 4; i++) {
          const mat = goods(CLOTH_TONES[Math.floor(this.rand() * CLOTH_TONES.length)])
          push(cyl(0.075, 0.075, 1.15, W / 2 - 0.15 - i * 0.17, 0.58, 0.16, 8), mat)
        }
        // A length hung up to show the print, which is the thing a cloth shop
        // always has and no other trade does.
        for (let i = 0; i < 2; i++) {
          const mat = goods(CLOTH_TONES[Math.floor(this.rand() * CLOTH_TONES.length)])
          push(plane(0.5, 1.5, -W / 2 + 0.45 + i * 0.62, 1.95, 0.52), mat)
        }
        break
      }

      /* ---- Hardware: buckets, mugs, coils of pipe. All plastic, all loud. */
      case 'hardware': {
        shelves([1.3, 1.82])
        for (const y of [1.3, 1.82]) {
          row(y, 0.28, 10, PLASTIC, (px, sy, pz, mat) => {
            push(cyl(0.085, 0.07, 0.16, px, sy + 0.105, pz, 8), mat)
          })
        }
        // Nested buckets in columns, biggest at the bottom.
        for (let col = 0; col < 4; col++) {
          const px = -W / 2 + (W / 4) * (col + 0.5)
          const mat = goods(PLASTIC[Math.floor(this.rand() * PLASTIC.length)])
          for (let k = 0; k < 3; k++) {
            push(cyl(0.17 - k * 0.012, 0.13 - k * 0.012, 0.28, px, 1.14 + k * 0.1, 0.4, 10), mat)
          }
        }
        // A coil of hose hung on the back wall.
        const coil = new THREE.TorusGeometry(0.28, 0.035, 5, 14)
        coil.translate(W / 2 - 0.45, 2.15, 0.2)
        push(coil, goods(0x2f6f4a))
        break
      }

      /* ---- Sweets: trays in a glass case, jars above, which is the only
             shop on the street with a lit counter and that is the point. */
      case 'sweets': {
        shelves([1.55, 2.0])
        for (const y of [1.55, 2.0]) {
          row(y, 0.26, 8, SWEET, (px, sy, pz, mat) => {
            push(cyl(0.085, 0.085, 0.24, px, sy + 0.14, pz, 9), mat)
          })
        }
        // The case: trays of mithai behind glass at the counter.
        for (let i = 0; i < 5; i++) {
          const px = -W / 2 + (W / 5) * (i + 0.5)
          push(cyl(0.2, 0.2, 0.04, px, 1.03, 0.4, 12), this.mat('tray', () =>
            new THREE.MeshStandardMaterial({ color: 0xb9bec3, roughness: 0.35, metalness: 0.6 })
          ))
          const mat = goods(SWEET[Math.floor(this.rand() * SWEET.length)])
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2
            push(blob(0.05, px + Math.cos(a) * 0.1, 1.07, 0.4 + Math.sin(a) * 0.1, 0.8), mat)
          }
        }
        push(
          box(W, 0.5, 0.02, 0, 1.22, 0.68),
          this.mat('case-glass', () =>
            new THREE.MeshStandardMaterial({
              color: 0xdfeef5,
              roughness: 0.08,
              metalness: 0,
              transparent: true,
              opacity: 0.22,
            })
          )
        )
        break
      }

      /* ---- Electrical: boxed goods, wire drums, bulbs on a string. */
      default: {
        shelves([1.25, 1.72, 2.18])
        for (const y of [1.25, 1.72]) {
          row(y, 0.3, 7, CARTON, (px, sy, pz, mat) => {
            push(box(0.28, 0.26, 0.24, px, sy + 0.155, pz, 0, (this.rand() - 0.5) * 0.12), mat)
          })
        }
        // Drums of cable lying on their sides on the top shelf.
        for (let i = 0; i < 4; i++) {
          const px = -W / 2 + (W / 4) * (i + 0.5)
          push(cyl(0.12, 0.12, 0.16, px, 2.31, 0.3, 10, Math.PI / 2), goods(0x2a2a2e))
        }
        // A string of bulbs across the front, which is how these shops
        // advertise that they are, in fact, an electrical shop.
        for (let i = 0; i < 9; i++) {
          push(
            blob(0.045, -W / 2 + (W / 9) * (i + 0.5), 2.42, 0.55, 1.2),
            this.mat('bulb', () => new THREE.MeshBasicMaterial({ color: 0xffe6b0 }))
          )
        }
        break
      }
    }
  }

  pickCanopy() {
    const c = this.theme.canopies ?? [0xf0392b, 0x1fbf6b, 0xff8c1a]
    return c[Math.floor(this.rand() * c.length)]
  }

  /* ------------------------------------------------------------------ *
   * Stalls
   * ------------------------------------------------------------------ */

  /**
   * Fills the slots. The compiler supplies `spec.stalls` later; for now a
   * default mix, thinned by the density axis.
   */
  buildStalls() {
    const wanted = this.spec.stalls ?? DEFAULT_STALLS
    const keep = { sparse: 0.45, busy: 0.75, packed: 1 }[this.shape.density] ?? 0.75
    const slots = this.stallSlots.filter((_, i) => i % 2 === 0)

    // Kinds a mission needs. A scenario that sends you to buy bangles in a
    // quarter where the density roll happened to skip every bangle stall is a
    // run that cannot be finished, so those kinds bypass the roll entirely.
    // Five lines, and it is the whole reason the compiler never has to know
    // where anything ended up: it names a GOOD, and the binder finds the stall.
    const required = new Set(this.spec.requiredStalls ?? [])

    this.stalls = []
    slots.forEach((slot, i) => {
      const id = wanted[i % wanted.length]
      if (!required.has(id) && this.rand() > keep) return
      const entry = STALLS[id]
      if (!entry) return

      const group = entry.build({ seed: Math.floor(this.rand() * 1e6), mats: undefined })
      group.position.set(slot.x, 0, slot.z)
      group.rotation.y = slot.rotY
      // A stall is nine or ten merged meshes; sixteen of them is a hundred and
      // fifty draw calls. They never move, so they go in the bucket with
      // everything else and come back as a handful. `stdMat` caches by colour,
      // so stalls of the same kind already share material objects and merge
      // cleanly across the whole quarter.
      this.statics.absorb(group)

      const { w, d } = entry.footprint
      const swap = Math.abs(Math.sin(slot.rotY)) > 0.5
      this.addCollider(
        slot.x - (swap ? d : w) / 2, slot.x + (swap ? d : w) / 2,
        slot.z - (swap ? w : d) / 2, slot.z + (swap ? w : d) / 2,
        2.5
      )
      this.stalls.push({ id, slot, group })
    })

    this.scatterClutter()
  }

  /**
   * The stuff between the stalls.
   *
   * What separates a market from a row of market stalls is the overflow: empty
   * crates nobody has cleared, sacks leaning on a wall, a thela parked where it
   * blocks half the lane, a plastic chair pulled out into the street. Six
   * hand-placed props could not do this — it needs enough of them, all the way
   * down, in the awkward places.
   *
   * Everything is pushed to the edges (a gali has to stay walkable), weighted
   * so crates and sacks dominate, and all of it merges into the static bucket,
   * so forty extra objects cost no draw calls worth counting.
   */
  scatterClutter() {
    // Crates and sacks are what a market is actually full of; a handcart is a
    // landmark and there should only be a few.
    const bag = [
      cratePile, cratePile, cratePile, sackPile, sackPile,
      plasticChair, gasCylinder, handcart,
    ]

    const drop = (x, z) => {
      const make = bag[Math.floor(this.rand() * bag.length)]
      const o = make({ seed: Math.floor(this.rand() * 1e6) })
      o.position.set(x, 0, z)
      o.rotation.y = this.rand() * Math.PI * 2
      this.statics.absorb(o)
    }

    // Down both gutters of the main gali, at uneven spacing so it does not
    // read as a fence.
    for (let z = LANE_Z0 + 2; z < LANE_Z1 - 2; z += 3.5 + this.rand() * 3) {
      const side = this.rand() > 0.5 ? 1 : -1
      drop(side * (LANE_HW - 0.8 - this.rand() * 0.9), z)
      // Occasionally something on the far side too, so the lane narrows.
      if (this.rand() > 0.62) drop(-side * (LANE_HW - 1.1 - this.rand() * 0.6), z + 1.2)
    }

    // And along both cross galis.
    for (const cz of [CROSS_A_Z, CROSS_B_Z]) {
      for (let x = -QUARTER_HX + 6; x < QUARTER_HX - 6; x += 5 + this.rand() * 5) {
        drop(x, cz + (this.rand() > 0.5 ? 1 : -1) * (CROSS_HW - 0.9 - this.rand() * 0.7))
      }
    }
  }

  /**
   * Tarpaulin strung right across the gali, stall to stall.
   *
   * This is what a covered market actually looks like from inside: not a roof,
   * a patchwork of sheets at slightly different heights with daylight between
   * them. It is also the `overhead` axis a judge can see without being told.
   */
  buildCanopies() {
    if (this.shape.overhead === 'sky') return
    const tin = this.shape.overhead === 'tin'
    const sheets = []
    const tones = tin
      ? [0x8f9aa2, 0x9aa5ad, 0x7f8a92]
      : [0x2f6fb5, 0x1f7a4a, 0xc9a227, 0x2f6fb5]

    const run = (x0, x1, z0, z1, along) => {
      const step = 7
      const n = Math.max(1, Math.floor((along === 'z' ? z1 - z0 : x1 - x0) / step))
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n
        const colour = tones[i % tones.length]
        const mat = this.mats.tint(tin ? 'corrugated_metal' : 'tarpaulin', colour, 2)
        // Cloth stretched under a midday sun is BACKLIT: from inside the gali
        // you are looking at the side the light is not on, and a plain diffuse
        // material renders that as near-black, which is what made the ceiling
        // read as a lid rather than as tarpaulin. A dim emissive of the sheet's
        // own colour is what light coming through it actually looks like, and
        // it is the single cheapest thing in the quarter. Tin does not glow.
        if (!tin && !mat.userData.backlit) {
          mat.emissive = new THREE.Color(colour)
          mat.emissiveIntensity = 0.45
          mat.userData.backlit = true
        }
        const w = along === 'z' ? (x1 - x0) : step - 0.6
        const d = along === 'z' ? step - 0.6 : (z1 - z0)
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), mat)
        sheet.position.set(
          along === 'z' ? (x0 + x1) / 2 : x0 + t * (x1 - x0),
          3.5 + (i % 2 ? 0.22 : 0),
          along === 'z' ? z0 + t * (z1 - z0) : (z0 + z1) / 2
        )
        // Slight, consistent tilt along the run only. The first version tilted
        // on whichever axis, which sent cross-gali sheets slicing diagonally
        // through the lane.
        if (along === 'z') sheet.rotation.x = i % 2 ? 0.035 : -0.035
        else sheet.rotation.z = i % 2 ? 0.035 : -0.035
        // Cloth, not concrete: it filters light rather than blacking the gali
        // out, and the ambient above is what stands in for what comes through.
        sheet.castShadow = false
        sheet.receiveShadow = true
        sheets.push(sheet)
      }
    }

    run(-LANE_HW, LANE_HW, LANE_Z0, LANE_Z1, 'z')
    run(-QUARTER_HX + 2, QUARTER_HX - 2, CROSS_A_Z - CROSS_HW, CROSS_A_Z + CROSS_HW, 'x')
    run(-QUARTER_HX + 2, QUARTER_HX - 2, CROSS_B_Z - CROSS_HW, CROSS_B_Z + CROSS_HW, 'x')
    // Nothing up there moves, and `tint` hands back one material per colour, so
    // thirty-odd sheets come out of the merge as three or four.
    for (const s of sheets) this.staticsNoShadow.absorb(s)
  }

  /* ------------------------------------------------------------------ *
   * The far end and the city
   * ------------------------------------------------------------------ */

  buildGate() {
    const adapt = {
      standard: (c, o = {}) =>
        this.mats.tint((o.metalness ?? 0) > 0.4 ? 'rusted_metal' : 'painted_wood', c, 4),
    }
    const gate = makeBazaarGate(adapt, 7)
    gate.position.set(0, 0, GATE_Z)
    gate.scale.setScalar(1.2)
    this.scene.add(gate)
    this.addCollider(-12, -4.8, GATE_Z - 1.5, GATE_Z + 1.5, 7)
    this.addCollider(4.8, 12, GATE_Z - 1.5, GATE_Z + 1.5, 7)

    if (this.hero !== 'none') {
      // Scaled up and set well back: at its authored size it sat lower than the
      // shophouses and vanished from the one camera angle that has to work.
      const hero = makeCharminar(adapt, 11)
      hero.scale.setScalar(2.4)
      hero.position.set(0, 0, GATE_Z + 34)
      this.scene.add(hero)
    }
  }

  /**
   * The city the bazaar is standing in.
   *
   * Blocks of taller buildings beyond the quarter, unlit by the shadow camera
   * and never walked into. Their whole job is to close the horizon so the
   * market reads as a piece of a city rather than a diorama on a plane.
   */
  buildCityRing() {
    // Measured: `buildBuildingParts` at five floors is ~21,850 triangles, and
    // sixty-odd of them made 1.4 MILLION triangles of scenery that exists only
    // to stop the eye falling off the edge of the world. Nobody walks there and
    // nobody sees a window reveal at ninety metres.
    //
    // So the ring is one InstancedMesh of plain boxes wearing the shipped
    // game's cached facade texture: one draw call, about a thousand triangles,
    // and at this distance it reads the same.
    const blocks = []
    const bands = [
      { x0: -120, x1: -QUARTER_HX - 10, z0: -70, z1: 80, step: 17 },
      { x0: QUARTER_HX + 10, x1: 120, z0: -70, z1: 80, step: 17 },
      { x0: -120, x1: 120, z0: LANE_Z0 - 46, z1: LANE_Z0 - 20, step: 19 },
      { x0: -120, x1: 120, z0: GATE_Z + 50, z1: GATE_Z + 76, step: 19 },
    ]
    for (const band of bands) {
      for (let x = band.x0; x < band.x1; x += band.step) {
        for (let z = band.z0; z < band.z1; z += band.step) {
          if (this.rand() > 0.74) continue
          blocks.push({
            x: x + band.step / 2,
            z: z + band.step / 2,
            w: band.step - 3 - this.rand() * 2,
            h: 11 + this.rand() * 22,
          })
        }
      }
    }
    if (!blocks.length) return

    const palette = this.theme.buildings ?? [0xe8dcc0]
    const tex = facadeTexture(palette[0], 6, 3)
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ map: tex }),
      blocks.length
    )
    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    blocks.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z)
      dummy.scale.set(b.w, b.h, b.w)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      // Tint per block so the ring is a skyline rather than a comb.
      mesh.setColorAt(i, colour.set(palette[i % palette.length]).multiplyScalar(0.82 + this.rand() * 0.3))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.castShadow = false
    mesh.receiveShadow = false
    this.scene.add(mesh)
  }

  /* ------------------------------------------------------------------ *
   * Dressing
   * ------------------------------------------------------------------ */

  buildStreetFurniture() {
    for (let z = LANE_Z0 + 8; z < LANE_Z1; z += 16) {
      for (const side of [-1, 1]) {
        streetLamp(this, { x: side * (LANE_HW - 0.6), z, rotY: side > 0 ? Math.PI : 0, warm: '#FFD9A0' })
      }
    }
    for (const side of [-1, 1]) {
      bollard(this, { x: side * (LANE_HW - 0.5), z: LANE_Z0 - 3 })
      planter(this, { x: side * (LANE_HW + 1.8), z: LANE_Z0 - 2, scale: 1.1 })
    }
    bin(this, { x: -LANE_HW + 0.8, z: CROSS_A_Z + 2 })
    bin(this, { x: LANE_HW - 0.8, z: CROSS_B_Z - 2 })
  }

  /**
   * Festoon bulbs over the galis. Lifted from the ShopVerse square, where a net
   * of them over the whole plaza does more for the atmosphere than any prop.
   * The sag is the point: a straight line of dots reads as a fence.
   */
  buildFestoon() {
    const spans = []
    for (let z = LANE_Z0 + 6; z < LANE_Z1 - 2; z += 8) spans.push({ z, along: 'x' })

    const perSpan = 9
    const bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.085, 6, 5),
      new THREE.MeshBasicMaterial(),
      spans.length * perSpan
    )
    const dummy = new THREE.Object3D()
    const colour = new THREE.Color()
    const warm = ['#ffd9a0', '#ffe9b8', '#ffc98b', '#fff2cc']
    let i = 0
    for (const s of spans) {
      for (let k = 0; k < perSpan; k++) {
        const t = (k + 0.5) / perSpan
        dummy.position.set(-LANE_HW + t * LANE_HW * 2, 4.4 - Math.sin(t * Math.PI) * 0.6, s.z)
        dummy.updateMatrix()
        bulbs.setMatrixAt(i, dummy.matrix)
        bulbs.setColorAt(i, colour.set(warm[i % warm.length]))
        i++
      }
    }
    bulbs.instanceMatrix.needsUpdate = true
    this.scene.add(bulbs)
  }

  /* ------------------------------------------------------------------ *
   * Life
   * ------------------------------------------------------------------ */

  /**
   * The crowd and the cow.
   *
   * Shoppers are given the customer side of every stall as their stations, so
   * they walk from stall to stall and stand looking at goods — a market where
   * people want things, rather than pedestrians orbiting. This runs before any
   * model has been called and keeps running whether or not one ever is.
   */
  buildLife() {
    // A few loitering spots so the market is not exclusively at counters:
    // the mouth of the gali, both crossings, and the far end by the gate.
    const loiter = [LANE_Z0 + 4, CROSS_A_Z + 1, 6, CROSS_B_Z - 1, LANE_Z1 - 6].map((z) => ({
      x: (this.rand() - 0.5) * LANE_HW,
      z,
    }))

    this.crowd = new MarketLife(this, {
      stalls: this.stalls,
      loiter,
      // The porter's round trip, down the middle of the main gali.
      patrol: [
        { x: 0.8, z: LANE_Z0 + 3 },
        { x: -0.8, z: LANE_Z1 - 5 },
      ],
      // The three streets that are meant to feel full. Stalls line every edge
      // of the quarter, including the backs of the blocks, and without this the
      // crowd spreads itself evenly over sixty metres of alley nobody walks
      // down while the gali the player is standing in looks abandoned.
      busy: [
        { x0: -LANE_HW - 2, x1: LANE_HW + 2, z0: LANE_Z0, z1: LANE_Z1, weight: 6 },
        { x0: -QUARTER_HX, x1: QUARTER_HX, z0: CROSS_A_Z - CROSS_HW, z1: CROSS_A_Z + CROSS_HW, weight: 2 },
        { x0: -QUARTER_HX, x1: QUARTER_HX, z0: CROSS_B_Z - CROSS_HW, z1: CROSS_B_Z + CROSS_HW, weight: 2 },
      ],
      // The host's frame watchdog raises or lowers this at runtime. Keepers and
      // the people already at counters are on top of it and are never retired —
      // a stall with nobody behind it is not a stall.
      shoppers: { sparse: 14, busy: 26, packed: 34 }[this.shape.density] ?? 26,
      seed: 91,
      language: this.spec.language,
      script: shopNamesFor(this.spec.language).script,
    })

    this.cow = new Cow(this, { x: -1.8, z: CROSS_A_Z + 5 })
    this.bindCast(this.spec.cast ?? [])
  }

  /**
   * Puts the scenario's people into the world that was just built.
   *
   * The compiler never names a stall. It names a GOOD, and this walks the
   * stalls that actually got built, binds each cast member to the nearest one
   * of the right kind, and registers the interactable that lets the player
   * press E on them.
   *
   * Binding AFTER the build rather than planning slots before it is deliberate.
   * `Bazaar` draws from a single RNG stream, and the bay loop consumes draws for
   * floor counts, building seeds and palette picks before it ever pushes a
   * stall slot — so a planner that skipped the mesh draws would advance the
   * stream differently and choose a different set of stalls than the one the
   * player is standing in. Five lines here instead of splitting the stream.
   *
   * @param {Array<{id: string, name: string, stallKind: string, slot?: string}>} cast
   */
  bindCast(cast) {
    /** Logical slot id -> the stall it was bound to. The scenario's `L1`, `R1`. */
    this.slotBindings = {}
    /** Character id -> the column of light standing at their stall. */
    this.markers = new Map()
    const spawn = this.spawn()
    const taken = new Set()

    // Nearest to the spawn point first, so the first errand is the first stall
    // you walk past rather than one at the far end of the quarter.
    const byDistance = (a, b) => {
      const da = (a.slot.x - spawn.x) ** 2 + (a.slot.z - spawn.z) ** 2
      const db = (b.slot.x - spawn.x) ** 2 + (b.slot.z - spawn.z) ** 2
      return da - db
    }

    for (const member of cast) {
      const stall = this.stalls
        .filter((s) => s.id === member.stallKind && !taken.has(s) && s.keeper)
        .sort(byDistance)[0]
      if (!stall) {
        console.warn(`[bazaar] no ${member.stallKind} for ${member.id}; they are not in this world`)
        continue
      }
      taken.add(stall)

      const keeper = stall.keeper
      keeper.id = member.id
      keeper.name = member.name
      if (member.slot) this.slotBindings[member.slot] = { x: stall.slot.x, z: stall.slot.z }

      // WHERE THE PLAYER ACTUALLY STANDS TO BE SERVED.
      //
      // Out in front of the stall, on the gali side — not on the keeper, who
      // stands BEHIND their goods. Measuring the interaction from the keeper's
      // body looks right and is wrong: the stall has a collider, so the player
      // is stopped about 1.2 m short of its centre while the keeper is 1.15 m
      // beyond it, which leaves 2.35 m between them against a 2.4 m radius. It
      // triggered only if you walked in dead straight, and never if you
      // approached at an angle.
      const fx = Math.sin(stall.slot.rotY)
      const fz = Math.cos(stall.slot.rotY)
      const stand = { x: stall.slot.x + fx * 1.6, z: stall.slot.z + fz * 1.6 }

      // A column of light where the errand is. The gali is long, roofed and
      // full of people; without one, "go and find the bangle seller" means
      // walking the whole quarter reading boards.
      const marker = makeMarker(MARKER_COLOURS.buy)
      marker.position.set(stand.x, 0, stand.z)
      marker.visible = false
      this.scene.add(marker)
      this.markers.set(member.id, marker)

      // Registered directly rather than through `addNPC`, which would also push
      // onto `this.npcs` — and `BaseWorld.update` culls that list on its own
      // schedule, which would fight MarketLife's LOD over who owns visibility.
      this.addInteractable({
        // Anchored to the standing spot, not the keeper: it is a fixed point in
        // front of the counter, so the radius means the same thing from every
        // angle and does not move when the keeper leans over to serve someone.
        pos: () => stand,
        radius: 2.8,
        label: `Talk to ${member.name} (E)`,
        action: (game) => game.talkTo(keeper),
      })
    }
  }

  /* ------------------------------------------------------------------ *
   * Runtime
   * ------------------------------------------------------------------ */

  spawn() {
    return { x: 0, z: LANE_Z0 - 3, heading: 0, camYaw: Math.PI, camPitch: 0.3 }
  }

  /**
   * Which errands are worth walking to right now.
   *
   * Driven from the world state rather than from the 3D: the archetype has no
   * idea what a mission is, it is just told which of its people are wanted.
   *
   * @param {Record<string, 'next'|'later'|'done'|'hidden'>} states by character id
   */
  showTargets(states) {
    for (const [id, marker] of this.markers) {
      setMarkerState(marker, states[id] ?? 'hidden')
    }
  }

  update(dt) {
    super.update(dt)
    this._markerT = (this._markerT ?? 0) + dt
    for (const marker of this.markers?.values() ?? []) {
      if (marker.visible) updateMarker(marker, this._markerT)
    }
    this.skyDome?.update(dt, this.game.camera.position)
    this.crowd?.update(dt, this.game.player.pos)
    this.cow?.update(dt)
  }
}

/* ------------------------------------------------------------------ */

/** Does this block edge sit on a cross gali, and so deserve a frontage? */
function touchesCross(z) {
  return [CROSS_A_Z - CROSS_HW, CROSS_A_Z + CROSS_HW, CROSS_B_Z - CROSS_HW, CROSS_B_Z + CROSS_HW].some(
    (edge) => Math.abs(edge - z) < 0.6
  )
}

function hex(n) {
  return typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : n
}
