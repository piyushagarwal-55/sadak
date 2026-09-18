import * as THREE from 'three'
import { BaseWorld } from '../engine/world/BaseWorld.js'
import { SURFACE } from '../engine/world/LegacyZones.js'
import { Sky } from '../engine/world/kit/sky.js'
import { createMaterialLibrary } from '@/lib/game/materials'
import { mulberry32 } from '@/lib/game/props'
import { STALLS, cratePile, sackPile, plasticChair } from '../kit/stalls'
import { MarketLife } from '../systems/market-life'
import { signBoard, shopNamesFor } from '../kit/signage'
import { GeoBucket } from '../kit/merge'
import { makeMarker, updateMarker, setMarkerState, MARKER_COLOURS } from '../kit/marker'

/**
 * THE PLATFORM.
 *
 * The second archetype, and it exists to prove a claim the bazaar alone cannot:
 * that a situation the player describes lands in a place shaped like that
 * situation. "Buy a train ticket" in a bazaar is a bazaar with a ticket in it.
 *
 * WHY A PLATFORM AND NOT A CONCOURSE
 *
 * A concourse is a big room, and the engine has no interiors — no ceilings, no
 * doors, no enclosed volumes. A platform is outdoors by definition: a long slab
 * between a track and a wall, roofed by a canopy on columns. Everything the
 * renderer is already good at, and it is the half of an Indian station that
 * anybody actually pictures.
 *
 * WHAT MAKES IT READ AS A STATION AND NOT A STREET
 *
 *   the track      a trench with rails and sleepers, which nothing in the
 *                  bazaar has and which the eye reads instantly
 *   the length     ninety metres in one direction and nine across. A bazaar is
 *                  a grid; a platform is a corridor with one exit
 *   the yellow line and the crowd standing behind it, facing the same way
 *   the canopy     steel columns on a regular pitch, not bamboo and tarpaulin
 *   sitting down   people on benches and on their own luggage, which is what
 *                  a platform is full of and a market never is
 *
 * It reuses `MarketLife` for the crowd, `GeoBucket` for the draw calls and the
 * stall kit for the chai tapri, because a station platform has a chai stall on
 * it and because the cheapest way to make a second place is to share everything
 * that is about people rather than about architecture.
 */

const PLAT_HW = 4.5 // half width of the platform slab
const PLAT_Z0 = -45
const PLAT_Z1 = 45
const TRACK_X = -11 // centre of the track trench
const WALL_X = 7.5 // the back wall with the counters in it
const CANOPY_Y = 5.2

export class Station extends BaseWorld {
  /**
   * @param {object} game the SimHost
   * @param {{
   *   title?: string, theme: object, seed?: number, language?: string,
   *   shape?: {overhead?: 'sky'|'tarp'|'tin', density?: 'sparse'|'busy'|'packed'},
   *   cast?: Array<{id: string, name: string, stallKind: string, slot?: string}>,
   * }} spec
   */
  constructor(game, spec) {
    super(game)
    this.key = 'station'
    this.spec = spec
    this.title = spec.title ?? 'Platform 1'
    this.theme = spec.theme
    this.shape = { overhead: 'tin', density: 'busy', ...(spec.shape ?? {}) }
    this.language = spec.language ?? 'hi-IN'
    this.script = shopNamesFor(this.language).script

    // A nine-metre platform is narrower than the gali, so the camera has to come
    // in further again or it spends the whole run inside the back wall.
    this.camDist = 5.0
    this.bounds = { minX: TRACK_X - 6, maxX: WALL_X + 6, minZ: PLAT_Z0 - 6, maxZ: PLAT_Z1 + 6 }
    this.envKind = 'none'

    this.rand = mulberry32(spec.seed ?? 4041)
    this.mats = createMaterialLibrary(game.renderer)
    this.statics = new GeoBucket()
    this.staticsNoShadow = new GeoBucket()
    this._matCache = new Map()
    this.stalls = []
    this.markers = new Map()

    const t0 = performance.now()
    this.buildSky()
    this.buildGround()
    this.defineZones()
    this.buildTrack()
    this.buildBackWall()
    this.buildCanopy()
    this.buildFurniture()
    this.buildStalls()
    this.buildTrain()
    const t1 = performance.now()

    const merged =
      this.statics.flush(this.scene) +
      this.staticsNoShadow.flush(this.scene, { castShadow: false })
    const t2 = performance.now()

    this.buildLife()
    this.bindCast(spec.cast ?? [])
    console.info(
      `[station] ${merged} static draw calls · dressing ${(t1 - t0) | 0}ms · life ${(performance.now() - t2) | 0}ms`
    )
  }

  mat(key, make) {
    let m = this._matCache.get(key)
    if (!m) {
      m = make()
      this._matCache.set(key, m)
    }
    return m
  }

  /* ---------------- the place ---------------- */

  buildSky() {
    // `Sky(preset, opts)` — a preset OBJECT or the name of one. This used to
    // read `new Sky(this.scene, this.theme)`, which handed it the scene as the
    // preset: `p.sunDir` was undefined, `new THREE.Vector3(...undefined)` threw
    // "p.sunDir is not iterable", and the world never built.
    //
    // Nothing caught it because nothing had ever rendered a station. The only
    // authored one was played through the turn route, never in 3D, so the first
    // person to generate a railway world was the first to run this line.
    const t = this.theme
    this.skyDome = new Sky({
      top: t.sky[0], mid: t.sky[2], bottom: t.sky[4],
      sun: hex(t.sunColour),
      // Lower and flatter than the bazaar's: a platform canopy is lit from the
      // open ends, so the light comes down the tracks rather than from above.
      sunDir: [0.62, 0.18, -0.76],
      sunSize: 0.018,
      cloud: '#FFF0DC', cloudAlpha: 0.45, stars: 0,
      fog: hex(t.fog),
    }).addTo(this)

    this.scene.fog = new THREE.Fog(t.fog, 20, t.fogNear ?? 70)

    const hemi = new THREE.HemisphereLight(
      this.theme.hemiSky,
      this.theme.hemiGround,
      (this.theme.hemiIntensity ?? 0.55) * 1.7
    )
    this.scene.add(hemi)
    // A canopy makes a platform a half-lit place: bright at the open ends,
    // dim under the steel. The ambient is what stops the middle going black.
    this.scene.add(new THREE.AmbientLight(0xffe9c4, 0.34))

    const sun = new THREE.DirectionalLight(this.theme.sunColour, this.theme.sunIntensity ?? 2)
    sun.position.set(-40, 48, 20)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const d = 60
    sun.shadow.camera.left = -d
    sun.shadow.camera.right = d
    sun.shadow.camera.top = d
    sun.shadow.camera.bottom = -d
    sun.shadow.camera.far = 140
    this.scene.add(sun, sun.target)
  }

  buildGround() {
    const slab = this.mat('slab', () => this.mats.tint('tile', 0x9a938a, 12))
    // The platform proper, raised. The step down to the track is what makes the
    // height read, and it is the only reason "mind the gap" means anything.
    this.statics.box(PLAT_HW * 2, 1.0, PLAT_Z1 - PLAT_Z0, 0, -0.5, (PLAT_Z0 + PLAT_Z1) / 2, slab)

    // The yellow line. Every Indian platform has one and everybody stands on it.
    this.statics.box(
      0.22, 0.02, PLAT_Z1 - PLAT_Z0,
      -PLAT_HW + 0.9, 0.011, (PLAT_Z0 + PLAT_Z1) / 2,
      this.mat('yellowline', () => new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.85 }))
    )

    // The ballast bed the platform sits beside.
    const ballast = new THREE.Mesh(
      new THREE.PlaneGeometry(26, PLAT_Z1 - PLAT_Z0 + 40),
      this.mats.tint('dry_mud', 0x6b6660, 14)
    )
    ballast.rotation.x = -Math.PI / 2
    ballast.position.set(TRACK_X - 2, -1.0, (PLAT_Z0 + PLAT_Z1) / 2)
    ballast.receiveShadow = true
    this.scene.add(ballast)
  }

  defineZones() {
    const Z = this.zones
    Z.add(SURFACE.PLAZA, -PLAT_HW + 0.4, PLAT_HW - 0.4, PLAT_Z0 + 1, PLAT_Z1 - 1)
    // The track is not somewhere you may walk, and the zone says so before any
    // collider has to. Falling onto the line is the one thing a station must
    // not let you do by accident.
    Z.add(SURFACE.WATER, TRACK_X - 8, -PLAT_HW, PLAT_Z0 - 20, PLAT_Z1 + 20)
    Z.add(SURFACE.BUILDING, PLAT_HW - 0.4, WALL_X + 4, PLAT_Z0, PLAT_Z1)
    this.addCollider(PLAT_HW - 0.4, WALL_X + 4, PLAT_Z0, PLAT_Z1, 6)
    this.addCollider(TRACK_X - 8, -PLAT_HW + 0.05, PLAT_Z0 - 20, PLAT_Z1 + 20, 0.9)
  }

  /** Rails and sleepers. Two long boxes and a run of short ones. */
  buildTrack() {
    const steel = this.mat('rail', () =>
      new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.4, metalness: 0.75 })
    )
    const wood = this.mat('sleeper', () => this.mats.tint('painted_wood', 0x4a3f33, 6))

    for (const dx of [-0.72, 0.72]) {
      this.statics.box(0.14, 0.16, PLAT_Z1 - PLAT_Z0 + 40, TRACK_X + dx, -0.86, (PLAT_Z0 + PLAT_Z1) / 2, steel)
    }
    for (let z = PLAT_Z0 - 20; z < PLAT_Z1 + 20; z += 0.7) {
      this.statics.box(2.6, 0.12, 0.26, TRACK_X, -0.98, z, wood)
    }
  }

  /**
   * The back wall, with the ticket counters cut into it.
   *
   * A counter is a dark recess behind a grille with a person visible in it —
   * the same vocabulary as the bazaar's shopfronts, which is deliberate: one
   * builder's worth of ideas, two completely different places.
   */
  buildBackWall() {
    const wall = this.mat('stationwall', () => this.mats.tint('weathered_plaster', 0xd8c9ae, 8))
    const dark = this.mat('counterdark', () => new THREE.MeshBasicMaterial({ color: 0x1a1510 }))
    const grille = this.mat('grille', () => this.mats.tint('rusted_metal', 0x6f7a80, 3))

    this.statics.box(4, 7, PLAT_Z1 - PLAT_Z0, WALL_X + 2, 3.5, (PLAT_Z0 + PLAT_Z1) / 2, wall)

    // Five windows on a regular pitch. Regularity is the point: a station is
    // institutional where a bazaar is improvised, and the rhythm says so.
    this.counters = []
    for (let i = 0; i < 5; i++) {
      const z = -20 + i * 10
      const g = new THREE.PlaneGeometry(2.6, 1.9)
      g.rotateY(-Math.PI / 2)
      g.translate(WALL_X - 0.01, 1.9, z)
      this.statics.add(g, dark)

      // The grille bars.
      for (let b = 0; b < 7; b++) {
        this.statics.box(0.06, 1.9, 0.06, WALL_X - 0.06, 1.9, z - 1.1 + b * 0.37, grille)
      }
      // The shelf you push money across.
      this.statics.box(0.5, 0.12, 2.8, WALL_X - 0.25, 1.0, z, wall)
      this.counters.push({ x: WALL_X - 1.6, z, rotY: -Math.PI / 2 })
    }

    // The board over the middle counter, in the local script.
    const names = shopNamesFor(this.language)
    const board = signBoard({
      native: this.language === 'te-IN' ? 'టికెట్ కౌంటర్' : this.language === 'ta-IN' ? 'டிக்கெட் கவுண்டர்' : 'टिकट काउंटर',
      roman: 'Ticket Counter',
      script: names.script,
      bg: '#1b5e9e',
      fg: '#fff6e0',
      width: 5,
      height: 1,
    })
    board.position.set(WALL_X - 0.04, 3.6, 0)
    board.rotation.y = -Math.PI / 2
    this.scene.add(board)
  }

  /** Steel columns and a corrugated roof. Nothing bamboo anywhere. */
  buildCanopy() {
    if (this.shape.overhead === 'sky') return
    const steel = this.mat('column', () =>
      new THREE.MeshStandardMaterial({ color: 0x5d6a72, roughness: 0.55, metalness: 0.5 })
    )
    const roof = this.mat('stationroof', () => this.mats.tint('corrugated_metal', 0x8f9aa2, 8))

    for (let z = PLAT_Z0 + 6; z < PLAT_Z1 - 4; z += 9) {
      for (const x of [-PLAT_HW + 1.2, PLAT_HW - 1.6]) {
        this.statics.box(0.28, CANOPY_Y, 0.28, x, CANOPY_Y / 2, z, steel)
        // The bracket, which is most of what makes it read as engineered.
        this.statics.box(0.18, 0.18, 1.6, x, CANOPY_Y - 0.4, z, steel)
      }
      this.statics.box(PLAT_HW * 2 + 1, 0.2, 0.3, 0, CANOPY_Y, z, steel)
    }
    // Two pitched sheets, so rain would run off the platform rather than onto it.
    const sheet = (dx, tilt) => {
      const g = new THREE.BoxGeometry(PLAT_HW + 1.4, 0.08, PLAT_Z1 - PLAT_Z0 - 8)
      g.rotateZ(tilt)
      g.translate(dx, CANOPY_Y + 0.42, (PLAT_Z0 + PLAT_Z1) / 2)
      this.staticsNoShadow.add(g, roof)
    }
    sheet(-(PLAT_HW + 0.7) / 2, 0.09)
    sheet((PLAT_HW + 0.7) / 2, -0.09)
  }

  /** Benches, luggage, bins, and the things people leave on a platform. */
  buildFurniture() {
    const slat = this.mat('bench', () => this.mats.tint('painted_wood', 0x2f6f4a, 4))
    const leg = this.mat('benchleg', () =>
      new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.7, metalness: 0.4 })
    )

    this.benches = []
    for (let z = PLAT_Z0 + 10; z < PLAT_Z1 - 8; z += 13) {
      const x = PLAT_HW - 2.3
      for (let s = 0; s < 3; s++) {
        this.statics.box(0.5, 0.07, 3.4, x, 0.46 + s * 0.16, z, slat, 0)
      }
      this.statics.box(0.5, 0.06, 3.4, x + 0.28, 0.9, z, slat)
      for (const dz of [-1.5, 1.5]) this.statics.box(0.5, 0.45, 0.08, x, 0.22, z + dz, leg)
      this.benches.push({ x, z })

      // What is under and beside every platform bench.
      const bag = this.rand() > 0.4 ? sackPile : cratePile
      const o = bag({ seed: Math.floor(this.rand() * 1e6) })
      o.position.set(x - 1.4, 0, z + (this.rand() - 0.5) * 2)
      o.rotation.y = this.rand() * Math.PI * 2
      this.statics.absorb(o)

      if (this.rand() > 0.5) {
        const chair = plasticChair({ colour: 0x2f6fb5 })
        chair.position.set(-PLAT_HW + 2.2, 0, z + 2)
        chair.rotation.y = this.rand() * Math.PI
        this.statics.absorb(chair)
      }
    }
  }

  /** A chai tapri and a snack stall. Every platform has both, at the ends. */
  buildStalls() {
    const plan = [
      { id: 'chai_tapri', x: PLAT_HW - 2.2, z: -32, rotY: -Math.PI / 2 },
      { id: 'plastic_stall', x: PLAT_HW - 2.4, z: 30, rotY: -Math.PI / 2 },
      { id: 'fruit_stall', x: PLAT_HW - 2.4, z: 8, rotY: -Math.PI / 2 },
    ]
    for (const p of plan) {
      const entry = STALLS[p.id]
      if (!entry) continue
      const group = entry.build({ seed: Math.floor(this.rand() * 1e6), mats: undefined })
      group.position.set(p.x, 0, p.z)
      group.rotation.y = p.rotY
      this.statics.absorb(group)
      const { w, d } = entry.footprint
      this.addCollider(p.x - d / 2, p.x + d / 2, p.z - w / 2, p.z + w / 2, 2.5)
      this.stalls.push({ id: p.id, slot: { x: p.x, z: p.z, rotY: p.rotY }, group })
    }
  }

  /**
   * A train standing at the platform.
   *
   * Not driveable, not enterable, and entirely worth it: a row of coaches
   * filling the left third of every shot is the single image that says "this is
   * a station" before a player has read one sign. Boxes and window strips,
   * merged, about four draw calls.
   */
  buildTrain() {
    const body = this.mat('coach', () => this.mats.tint('painted_wood', 0x9a2f2f, 5))
    const roof = this.mat('coachroof', () =>
      new THREE.MeshStandardMaterial({ color: 0x6f757a, roughness: 0.7 })
    )
    const glass = this.mat('coachglass', () =>
      new THREE.MeshBasicMaterial({ color: 0x14202a })
    )
    const bogie = this.mat('bogie', () =>
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.8, metalness: 0.4 })
    )

    for (let c = 0; c < 4; c++) {
      const z = PLAT_Z0 + 6 + c * 22
      this.statics.box(3.0, 3.1, 21, TRACK_X, 1.9, z, body)
      this.statics.box(3.1, 0.35, 21, TRACK_X, 3.6, z, roof)
      // A window strip rather than fifteen windows: at this distance the eye
      // reads the band, and fifteen boxes is fifteen times the geometry.
      for (const dx of [-1.52, 1.52]) {
        this.statics.box(0.04, 0.85, 19, TRACK_X + dx, 2.5, z, glass)
      }
      for (const dz of [-7, 7]) {
        this.statics.box(2.4, 0.7, 3.2, TRACK_X, 0.15, z + dz, bogie)
      }
    }
  }

  /* ---------------- people ---------------- */

  buildLife() {
    // Waiting rather than shopping: the loiter spots are the benches and the
    // yellow line, because a platform crowd faces the track and does not browse.
    const loiter = [
      ...this.benches.map((b) => ({ x: b.x - 1.2, z: b.z })),
      ...Array.from({ length: 6 }, (_, i) => ({
        x: -PLAT_HW + 1.4 + this.rand() * 0.8,
        z: PLAT_Z0 + 12 + i * 12,
      })),
    ]

    this.crowd = new MarketLife(this, {
      stalls: this.stalls,
      loiter,
      patrol: [
        { x: 0.5, z: PLAT_Z0 + 6 },
        { x: -0.5, z: PLAT_Z1 - 8 },
      ],
      busy: [{ x0: -PLAT_HW, x1: PLAT_HW, z0: PLAT_Z0, z1: PLAT_Z1, weight: 5 }],
      shoppers: { sparse: 12, busy: 22, packed: 30 }[this.shape.density] ?? 22,
      seed: 4042,
      language: this.language,
      script: this.script,
    })
  }

  /**
   * Scenario people at the ticket counters.
   *
   * The bazaar binds a cast to stalls by the good they sell; a station binds
   * them to counter windows in order. That difference is the whole reason
   * binding lives on the archetype rather than in the compiler.
   */
  bindCast(cast) {
    this.slotBindings = {}
    cast.forEach((member, i) => {
      const spot = this.counters[i % this.counters.length]
      if (!spot) return

      const keeper = this.crowd.addKeeper({ slot: spot, id: 'counter' })
      keeper.id = member.id
      keeper.name = member.name
      if (member.slot) this.slotBindings[member.slot] = { x: spot.x, z: spot.z }

      const stand = { x: spot.x - 1.5, z: spot.z }
      const marker = makeMarker(MARKER_COLOURS.ask)
      marker.position.set(stand.x, 0, stand.z)
      marker.visible = false
      this.scene.add(marker)
      this.markers.set(member.id, marker)

      this.addInteractable({
        pos: () => stand,
        radius: 2.8,
        label: `Talk to ${member.name} (E)`,
        action: (game) => game.talkTo(keeper),
      })
    })
  }

  showTargets(states) {
    for (const [id, marker] of this.markers) setMarkerState(marker, states[id] ?? 'hidden')
  }

  /* ---------------- runtime ---------------- */

  spawn() {
    return { x: 1.5, z: PLAT_Z0 + 4, heading: 0, camYaw: Math.PI, camPitch: 0.16 }
  }

  update(dt) {
    super.update(dt)
    this._t = (this._t ?? 0) + dt
    for (const marker of this.markers.values()) {
      if (marker.visible) updateMarker(marker, this._t)
    }
    this.skyDome?.update(dt, this.game.camera.position)
    this.crowd?.update(dt, this.game.player.pos)
  }
}

/** Theme colours arrive as numbers or strings depending on where they came from. */
function hex(n) {
  return typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : n
}
