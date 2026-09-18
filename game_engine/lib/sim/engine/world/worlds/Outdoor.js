import * as THREE from 'three'
import { BaseWorld } from '../BaseWorld.js'
import { mesh, signPlane } from '../builders.js'
import { NPC } from '../NPC.js'
import { mulberry32, makeCanvasTexture, normalizeToSize } from '../../core/util.js'
import { buildPairLite, SHOES } from '../../data/shoes.js'
import { Sky } from '../kit/sky.js'
import { Fountain } from '../kit/water.js'
import { treeLine, hedge, lawn, planter, FallingLeaves } from '../kit/nature.js'
import { treeSeat, cafeSet, picnicTable } from '../kit/seating.js'
import { Critters } from '../kit/critters.js'
import { pavement, crossing, roadSign, directionSign, streetLamp, trafficLight, bin, bollard, bench as streetBench, busStop, policeCar, barricade, cones } from '../kit/street.js'
import { pickKind, makePerson } from '../../data/people.js'
import { BallGame, SeatedGroup, seat } from '../../systems/Activities.js'
import { SURFACE } from '../LegacyZones.js'
import { Social } from '../../systems/Social.js'
import { Traffic } from '../../systems/Traffic.js'

const WORLD_SEED = 20260729

const DEFAULT_VENUES = [
  { key: 'sole', x: -25, name: 'SOLE', base: '#171412', accent: '#FF4D2E', sub: 'sneaker flagship · drops', glow: '#FFD9A0' },
  { key: 'fashion', x: -8.5, name: 'POUNCE Footwear', base: '#e8cfc0', accent: '#e11d48', sub: 'sneakers · AR try-on', glow: '#ffe9b8' },
  { key: 'electronics', x: 8.5, name: 'Volt Electronics', base: '#1e293b', accent: '#0891b2', sub: 'gadgets · AR demos', glow: '#a5f3fc' },
  { key: 'cafe', x: 25, name: 'Bloom Café', base: '#ddebc8', accent: '#65a30d', sub: 'coffee · grocery', glow: '#ffe9b8' },
]

/**
 * Everything about this world that a scenario is allowed to change.
 *
 * The defaults ARE the original Neon Square — passing no spec reproduces it
 * exactly. A SADAK chowk is the same geometry with a different palette, a
 * different sky and different venues in the four slots, which is the whole
 * point: the square, the roads, the crowd, the traffic and the tuning are
 * authored once and re-dressed, rather than regenerated and hoped for.
 *
 * See `chowkSpec.js` for the mapping from a SADAK district `Theme` to this.
 */
export const OUTDOOR_DEFAULTS = {
  title: 'Neon Square · POUNCE City',
  /** 'dusk' | 'day' | 'night', or a full preset object (see kit/sky.js). */
  sky: 'dusk',
  fog: { near: 60, far: 165 },
  hemiSky: '#D8C8FF',
  hemiGround: '#4A3A5C',
  hemiIntensity: 1.15,
  sunColour: '#FFE3B8',
  sunIntensity: 1.9,
  ground: '#30343e',
  plaza: '#7d838f',
  /** Painted circles on the square: [x, z, radius, colour]. */
  discs: [
    [-9, 18, 4.5, '#f9a8d4'],
    [10, 14, 3.5, '#7dd3fc'],
    [-6, 4, 2.8, '#ffd166'],
    [8, 24, 3, '#6ee7b7'],
  ],
  /** The four shopfront slots on the south side. */
  venues: null,
  /**
   * The one hand-placed NPC who explains where you are. Scenario-driven,
   * because "welcome to Neon Square" is the single most out-of-place line in
   * an Indian chowk.
   */
  greeter: {
    name: 'Maya',
    kind: 'woman',
    pos: { x: 2.5, z: 14.5 },
    heading: 0,
    lines: [
      'Welcome to Neon Square — the heart of POUNCE City! 🌆',
      'POUNCE Footwear is on the left — walk in and the staff guide you to the perfect pair. SOLE is our sneaker flagship too.',
      'Volt Electronics has an AR demo wall, and Bloom Café bakes fresh every hour.',
      'Walk up to any shop door and press E. And look up — the sky at dusk is worth it.',
    ],
  },
  /**
   * The scenario's cast: the people the player actually has to talk to, placed
   * outside the venue they belong to. Distinct from the crowd, which is
   * atmosphere and generated from the archetype mix.
   */
  actors: [],
}

const NEON = ['#ffd166', '#7dd3fc', '#f9a8d4', '#c4b5fd', '#6ee7b7']
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o })

// Lit-window texture for towers, cached per tint.
const windowCanvases = {}
function windowCanvas(tint, seed) {
  const key = tint + seed
  if (windowCanvases[key]) return windowCanvases[key]
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 192
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#232048'
  ctx.fillRect(0, 0, 96, 192)
  const rng = mulberry32(seed)
  for (let y = 8; y < 184; y += 16) {
    for (let x = 8; x < 88; x += 14) {
      const lit = rng() < 0.55
      ctx.fillStyle = lit ? tint : '#141230'
      ctx.globalAlpha = lit ? 0.75 + rng() * 0.25 : 1
      ctx.fillRect(x, y, 9, 10)
    }
  }
  ctx.globalAlpha = 1
  windowCanvases[key] = c
  return c
}

function adCanvas({ bg1, bg2, text, sub, emoji }) {
  return makeCanvasTexture(768, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, bg1)
    g.addColorStop(1, bg2)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    for (let i = 0; i < 26; i++) ctx.fillRect((i * 131) % w, (i * 197) % h, 5, 5)
    if (emoji) {
      ctx.font = '150px serif'
      ctx.textAlign = 'left'
      ctx.fillText(emoji, 40, h / 2 + 55)
    }
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 105px ui-sans-serif, system-ui'
    ctx.shadowColor = 'rgba(0,0,0,0.4)'
    ctx.shadowBlur = 18
    ctx.fillText(text, w / 2 + (emoji ? 60 : 0), h / 2 + 8)
    ctx.shadowBlur = 0
    if (sub) {
      ctx.font = '46px ui-sans-serif, system-ui'
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillText(sub, w / 2 + (emoji ? 60 : 0), h / 2 + 88)
    }
  })
}

function marqueeTexture(text, fg, bg) {
  const tex = makeCanvasTexture(1024, 128, (ctx, w, h) => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = fg
    ctx.font = 'bold 84px ui-sans-serif, system-ui'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 10, h / 2 + 4)
  })
  tex.wrapS = THREE.RepeatWrapping
  return tex
}

export class Outdoor extends BaseWorld {
  constructor(game, spec = {}) {
    super(game)
    this.spec = { ...OUTDOOR_DEFAULTS, ...spec }
    this.venues = this.spec.venues ?? DEFAULT_VENUES
    this.key = 'outdoor'
    this.title = this.spec.title
    this.camDist = 6.5
    this.bounds = { minX: -88, maxX: 88, minZ: -13.5, maxZ: 92 }
    this.marquees = []

    const scene = this.scene

    // Real sky dome instead of a flat background gradient: it has a sun, drifting
    // clouds and stars, so looking up actually rewards you.
    this.skyDome = new Sky(this.spec.sky).addTo(this)
    scene.fog = new THREE.Fog(this.skyDome.preset.fog, this.spec.fog.near, this.spec.fog.far)

    scene.add(new THREE.HemisphereLight(this.spec.hemiSky, this.spec.hemiGround, this.spec.hemiIntensity))
    const sun = new THREE.DirectionalLight(this.spec.sunColour, this.spec.sunIntensity)
    // same azimuth as the drawn sun so shadows agree, but lifted to an elevation
    // that actually lights the square
    sun.position.copy(this.skyDome.keyLightPosition(70))
    sun.castShadow = true
    // A ±60 m frustum at 2048² meant the shadow pass redrew the whole square
    // every frame at high resolution. A tight box that follows the player covers
    // everything you can actually see, at a quarter of the texels.
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 150
    sun.shadow.camera.left = -34
    sun.shadow.camera.right = 34
    sun.shadow.camera.top = 34
    sun.shadow.camera.bottom = -34
    sun.shadow.bias = -0.0006
    scene.add(sun)
    scene.add(sun.target)
    this.sun = sun
    this.sunOffset = sun.position.clone()

    // ground: city asphalt, with a lighter paved square at the center
    const ground = mesh(new THREE.PlaneGeometry(240, 240), std(this.spec.ground))
    ground.rotation.x = -Math.PI / 2
    ground.position.z = 8
    ground.castShadow = false
    scene.add(ground)
    const plaza = mesh(new THREE.PlaneGeometry(64, 46), std(this.spec.plaza))
    plaza.rotation.x = -Math.PI / 2
    plaza.position.set(0, 0.02, 9)
    plaza.castShadow = false
    scene.add(plaza)
    // playful painted circles around the fountain
    for (const [cx, cz, r, col] of this.spec.discs) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16 }))
      disc.rotation.x = -Math.PI / 2
      disc.position.set(cx, 0.03, cz)
      scene.add(disc)
    }

    this.defineZones()
    this.buildRoads()
    this.buildFountain()
    for (const s of this.venues) this.buildFacade(s)
    this.buildBillboards()
    // DECLUTTER — commented out to clear the canvas, not deleted. Uncomment to
    // restore. buildCity() is the grid of lit tower blocks around the square;
    // buildSkyline() is the distant silhouette ring that closes the horizon.
    // this.buildCity()
    // this.buildSkyline()
    this.buildLightStrings()
    this.scatterDecor()
    this.buildTraffic()
    this.buildStreetscape()
    this.buildNorthParade()
    this.populate()
    this.populateCorners()
    this.buildActivities()
    this.buildMinimap()

    // Anyone hand-placed before the rules existed may be standing in the road
    // or inside a shopfront. Move them to the nearest legal ground rather than
    // leaving them to be shoved around by the constraint solver every frame.
    for (const n of this.npcs) {
      const p = n.group.position
      if (!this.zones.allows('pedestrian', p.x, p.z)) {
        const [lx, lz] = this.zones.nearestLegal('pedestrian', p.x, p.z)
        p.set(lx, 0, lz)
      }
    }
    this.scene.add(this.zones.buildDebug())

    // Idle chatter between shoppers. Reuses the same `paused` flag the player
    // dialogue uses, with ownership tracking so the two never fight.
    this.social = new Social({ npcs: this.npcs, rng: mulberry32(WORLD_SEED + 5) }).addTo(this)
  }

  buildTraffic() {
    // Cars are lane-relative: position is (lane cross-coord, distance along
    // lane), so driving onto the pavement is not representable rather than
    // merely prevented. Replaces the old free-integration cars.
    this.traffic = new Traffic({
      rng: mulberry32(WORLD_SEED + 91),
      carsPerLane: 3,
      bounds: this.bounds,
      // Vertical lanes are cut short at z = 48 to match the ROAD zone — north
      // of that the parade shopfronts occupy the carriageway.
      lanes: [
        { axis: 'z', cross: -36, dir: 1, speed: 8.5, priority: 0, start: -60, end: 48, stops: [{ at: 4.4, signal: 'west' }] },
        { axis: 'z', cross: -32, dir: -1, speed: 8.5, priority: 0, start: -60, end: 48, stops: [{ at: 13.6, signal: 'west' }] },
        { axis: 'z', cross: 36, dir: -1, speed: 8.5, priority: 0, start: -60, end: 48, stops: [{ at: 13.6, signal: 'east' }] },
        { axis: 'z', cross: 32, dir: 1, speed: 8.5, priority: 0, start: -60, end: 48, stops: [{ at: 4.4, signal: 'east' }] },
        { axis: 'x', cross: 42, dir: -1, speed: 10, priority: 1, stops: [{ at: 4.6, signal: 'north' }] },
        { axis: 'x', cross: 38, dir: 1, speed: 10, priority: 1, stops: [{ at: -4.6, signal: 'north' }] },
      ],
    }).addTo(this)
  }

  // ---------- the rule map ----------
  // Declared BEFORE anything is built, so every later system can consult it
  // instead of inventing its own idea of where things belong. Order matters:
  // zoneAt() takes the last match, so general surfaces go down first and
  // exceptions (crossings over roads, buildings over pavement) go on top.
  defineZones() {
    const Z = this.zones

    // Default ground. Everything not otherwise declared is open plaza.
    Z.add(SURFACE.PLAZA, -88, 88, -13.5, 92)

    // ---- pavements: the legal way to walk beside a road ----
    for (const px of [-29.5, -38.5, 29.5, 38.5]) Z.addAt(SURFACE.PAVEMENT, px, 8, 3.2, 120)
    for (const pz of [35.5, 44.5]) Z.addAt(SURFACE.PAVEMENT, 0, pz, 120, 3.2)
    Z.addAt(SURFACE.PAVEMENT, 0, -4.6, 58, 3.0)
    Z.addAt(SURFACE.PAVEMENT, 0, 49.6, 108, 3.4) // north parade frontage

    // ---- carriageways: two vertical roads and the northern avenue ----
    // 8 units wide, matching buildRoads(). Painted AFTER the pavements on
    // purpose: a footpath stops at the kerb, so where one is drawn straight
    // through a junction the road has to win. Otherwise a car crossing the
    // intersection is standing on "pavement" and reads as driving on the path.
    // The vertical roads STOP at z = 48. Beyond that sits the north parade
    // block (z 51.6–60.4), and the shopfronts at x = -34 and x = 36 stand
    // exactly on these two carriageways — running the road through would put
    // cars inside a building. The zone map is what surfaced that clash.
    Z.add(SURFACE.ROAD, -38, -30, -60, 48)
    Z.add(SURFACE.ROAD, 30, 38, -60, 48)
    Z.add(SURFACE.ROAD, -95, 95, 36, 44)

    // ---- crossings: the ONLY places a pedestrian may be on a road ----
    Z.addAt(SURFACE.CROSSING, -34, 9, 8.4, 7.2)
    Z.addAt(SURFACE.CROSSING, 34, 9, 8.4, 7.2)
    Z.addAt(SURFACE.CROSSING, 0, 40, 7.2, 8.4)

    // ---- lawns and the kids' pitch ----
    Z.addAt(SURFACE.LAWN, -20, 22, 18, 16)
    Z.addAt(SURFACE.LAWN, 20, 24, 16, 14)
    Z.addAt(SURFACE.PLAY, 0, 24, 14, 14)

    // ---- solid ground nobody may enter ----
    // The shop row. This is the fix for the wedged-in-a-wall bug: the facade
    // footprint is now illegal ground in its own right, so a collider can no
    // longer shove you into a pocket the bounds clamp then traps you in.
    for (const s of this.venues) Z.add(SURFACE.BUILDING, s.x - 6, s.x + 6, -14, -5.6)
    // North parade shopfronts (Z = 56 in buildNorthParade).
    for (const x of [-34, -20, -6, 8, 22, 36]) Z.add(SURFACE.BUILDING, x - 6, x + 6, 51.6, 60.4)
    // The fountain basin — you stop at the coping, you don't wade in.
    Z.addAt(SURFACE.WATER, 0, 10, 6.8, 6.8)
  }

  // ---------- streetscape: pavements, planting, signage, police ----------
  buildStreetscape() {
    const rng = mulberry32(WORLD_SEED + 31)

    // raised footpaths flanking both vertical roads and the northern avenue
    for (const px of [-29.5, -38.5, 29.5, 38.5]) {
      pavement(this, { x: px, z: 8, length: 120, width: 3.2, dir: 'z' })
    }
    for (const pz of [35.5, 44.5]) {
      pavement(this, { x: 0, z: pz, length: 120, width: 3.2, dir: 'x' })
    }
    // promenade edging the plaza in front of the shops
    pavement(this, { x: 0, z: -4.6, length: 58, width: 3.0, dir: 'x' })

    crossing(this, { x: -34, z: 9, dir: 'z' })
    crossing(this, { x: 34, z: 9, dir: 'z' })
    crossing(this, { x: 0, z: 40, dir: 'x' })

    // ---- planting: a lot of it, this is what softens the concrete ----
    // Blossom season: flowering trees are the dominant note along the avenues,
    // mixed with canopy and columnar so the street isn't one repeated shape.
    // Eight species, not five: maple (autumn colour), oak (broadest crown) and
    // fruit (apples, plus windfall on the ground) break up what was otherwise a
    // repeating silhouette down the whole avenue.
    const SPECIES = ['canopy', 'flowering', 'columnar', 'willow', 'palm', 'maple', 'oak', 'fruit']
    const pickSpecies = (weights) => {
      let t = rng()
      for (let i = 0; i < SPECIES.length; i++) {
        t -= weights[i] ?? 0
        if (t <= 0) return SPECIES[i]
      }
      return 'canopy'
    }

    const avenue = []
    for (let z = -6; z <= 52; z += 6) {
      avenue.push([-30.5, z, pickSpecies([0.18, 0.2, 0.1, 0.06, 0.03, 0.19, 0.14, 0.1])])
      avenue.push([30.5, z, pickSpecies([0.18, 0.2, 0.1, 0.06, 0.03, 0.19, 0.14, 0.1])])
    }
    for (let x = -26; x <= 26; x += 6) {
      avenue.push([x, 34.5, pickSpecies([0.16, 0.18, 0.16, 0.05, 0.03, 0.22, 0.14, 0.06])])
    }
    const planted = []
    // DECLUTTER — the avenue rows (~28 trees lining both carriageways and the
    // north edge). Uncomment to restore.
    // planted.push(treeLine(this, avenue, { rng }))

    // plaza groves — clustered, not evenly spaced, so it reads as landscaping
    const grove = []
    for (const [cx, cz] of [[-20, 16], [20, 18], [-14, 28], [16, 28], [-24, 6], [24, 6], [-8, 24], [8, 22]]) {
      const n = 4 + Math.floor(rng() * 3)
      for (let i = 0; i < n; i++) {
        grove.push([cx + (rng() - 0.5) * 7, cz + (rng() - 0.5) * 7, pickSpecies([0.14, 0.18, 0.05, 0.1, 0.05, 0.16, 0.14, 0.18])])
      }
    }
    // DECLUTTER — the eight clustered plaza groves (~40 trees). Uncomment to
    // restore. The promenade blossom row below is kept: it frames the
    // shopfronts and is the planting you actually walk past.
    // planted.push(treeLine(this, grove, { rng }))

    // Blossom row framing the shopfronts — set back to z = 5.5 and gapped in
    // front of every shop door. At z = 1.2 it stood directly across the
    // approach, hiding the storefronts and swallowing the camera in leaves.
    const promenade = []
    for (let x = -30; x <= 30; x += 5) {
      const blocksDoor = this.venues.some((s) => Math.abs(x - s.x) < 4.5)
      if (!blocksDoor) promenade.push([x, 5.5, rng() < 0.7 ? 'flowering' : rng() < 0.5 ? 'maple' : 'canopy'])
    }
    planted.push(treeLine(this, promenade, { rng }))

    // Every canopy that got planted, so leaf-fall and the wildlife attach to
    // real trees rather than guessed positions.
    this.canopies = planted.flatMap((p) => p.canopies ?? [])
    this.leafFall = new FallingLeaves({ canopies: this.canopies, count: 110, rng }).addTo(this)

    // Shade seating: tree surrounds under the biggest canopies, so there is
    // somewhere to sit *under* a tree rather than only out in the open.
    const shadeTrees = this.canopies.filter((t) => t.h > 5.5).slice(0, 40)
    const usedSeats = []
    for (const t of shadeTrees) {
      if (Math.hypot(t.x, t.z - 10) < 9) continue // keep the fountain ring clear
      if (Math.abs(t.z + 2) < 6 || Math.abs(t.x) < 4.5) continue // main walkways
      if (usedSeats.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < 11)) continue
      usedSeats.push(t)
      treeSeat(this, { x: t.x, z: t.z, radius: 1.6, sides: 6 })
      if (usedSeats.length >= 5) break
    }

    // Open-air café seating on the plaza, away from the trees.
    cafeSet(this, { x: -12, z: 12, rotY: 0.4, chairs: 3, umbrella: true })
    cafeSet(this, { x: 12.5, z: 13, rotY: -0.5, chairs: 4, umbrella: true })
    cafeSet(this, { x: -7, z: 27, rotY: 1.1, chairs: 3 })
    picnicTable(this, { x: 18, z: 30, rotY: 0.3 })
    picnicTable(this, { x: -21, z: 31, rotY: -0.4 })

    // Pigeons, squirrels, songbirds and butterflies, attached to real planting.
    this.critters = new Critters({
      rng,
      trees: this.canopies,
      bounds: { minX: -30, maxX: 30, minZ: -2, maxZ: 40 },
    }).addTo(this)

    lawn(this, { x: -20, z: 22, w: 18, d: 16 })
    lawn(this, { x: 20, z: 24, w: 16, d: 14 })
    hedge(this, { x: -20, z: 14.4, length: 16, rotY: 0, height: 0.7 })
    hedge(this, { x: 20, z: 17.4, length: 14, rotY: 0, height: 0.7 })
    for (const [x, z] of [[-7.5, -3.5], [7.5, -3.5], [-16, 2], [16, 2], [-11, 32], [11, 32]]) {
      planter(this, { x, z, scale: 1.1 })
    }

    // ---- signage ----
    roadSign(this, { x: -30.6, z: 4, rotY: Math.PI / 2, type: 'stop' })
    roadSign(this, { x: 30.6, z: 14, rotY: -Math.PI / 2, type: 'speed', text: '30' })
    roadSign(this, { x: -30.6, z: 24, rotY: Math.PI / 2, type: 'pedestrian' })
    roadSign(this, { x: 30.6, z: 30, rotY: -Math.PI / 2, type: 'pedestrian' })
    directionSign(this, { x: -27.5, z: 42, rotY: 0.5, lines: ['◀ POUNCE Fashion', 'Neon Square ▲'] })
    directionSign(this, { x: 27.5, z: 42, rotY: -0.5, lines: ['Bloom Café ▶', 'Volt Electronics ▲'] })
    directionSign(this, { x: 0, z: 47, rotY: Math.PI, lines: ['SHOPVERSE CITY CENTRE'] })

    // ---- traffic control ----
    this.lights = [
      trafficLight(this, { x: -30.8, z: 12.5, rotY: Math.PI / 2, state: 2 }),
      trafficLight(this, { x: 30.8, z: 5.5, rotY: -Math.PI / 2, state: 0 }),
      trafficLight(this, { x: 3.5, z: 36.5, rotY: Math.PI, state: 1 }),
    ]
    this.lightTimer = 0

    // ---- street lighting along the roads ----
    for (let z = -4; z <= 50; z += 13) {
      streetLamp(this, { x: -29.8, z, rotY: -Math.PI / 2 })
      streetLamp(this, { x: 29.8, z, rotY: Math.PI / 2 })
    }
    for (let x = -24; x <= 24; x += 13) streetLamp(this, { x, z: 35.2, rotY: 0 })

    // ---- furniture ----
    busStop(this, { x: -37, z: 20, rotY: Math.PI / 2 })
    busStop(this, { x: 37, z: 30, rotY: -Math.PI / 2 })
    for (const [x, z, r] of [[-8, 6, 0], [8, 6, 0], [-12, 26, Math.PI], [12, 26, Math.PI], [-22, 34, 0], [22, 34, 0]]) {
      streetBench(this, { x, z, rotY: r })
    }
    for (const [x, z] of [[-9.5, 5], [9.5, 5], [-30.2, 18], [30.2, 26], [-13.5, 25], [13.5, 25]]) bin(this, { x, z })
    for (let i = -5; i <= 5; i++) bollard(this, { x: i * 2.6, z: -3.4 })

    // ---- police presence ----
    // Parked on the west carriageway, not across the SOLE shopfront where it
    // blocked the entrance and the drop banners.
    this.patrol = policeCar(this, { x: -31.5, z: 24, rotY: 0 })
    barricade(this, { x: -31.5, z: 30, rotY: Math.PI / 2 })
    barricade(this, { x: -31.5, z: 18, rotY: Math.PI / 2 })
    cones(this, [[-29.4, 28], [-29.4, 26], [-29.4, 22], [-29.4, 20]])
    this.policeFlash = 0
  }

  // ---------- north parade: a second row of neighbourhood shops ----------
  //
  // These are storefronts, not enterable worlds. Each one gets real signage, a
  // lit window with a display inside, an awning and a stall, and walking up
  // tells you plainly that it is a facade. Building five more full interiors
  // would be a much larger job; this expands the city you can walk without
  // pretending the doors work.
  buildNorthParade() {
    const rng = mulberry32(WORLD_SEED + 77)
    const PARADE = [
      { x: -34, name: 'Kirana Corner', accent: '#C77D2E', base: '#E7DCC9', goods: 'daily needs · fresh stock' },
      { x: -20, name: 'Rasa Bakery', accent: '#B4653A', base: '#F0E0CB', goods: 'bread · cakes · chai' },
      { x: -6, name: 'Sharp Cuts', accent: '#1B6CA8', base: '#DCE6EE', goods: 'salon · barber' },
      { x: 8, name: 'Green Leaf Pharmacy', accent: '#2A9D8F', base: '#DFEDE6', goods: 'chemist · open 24h' },
      { x: 22, name: 'Page One Books', accent: '#8E44AD', base: '#E6DEEE', goods: 'books · stationery' },
      { x: 36, name: 'Cycle & Repair', accent: '#5A6B4A', base: '#DEE3D4', goods: 'bikes · service' },
    ]
    const Z = 56 // north side of the avenue, facing back toward the square

    for (const shop of PARADE) {
      const { x, name, accent, base, goods } = shop
      const g = new THREE.Group()

      // body + parapet
      g.add(mesh(new THREE.BoxGeometry(12, 6.4, 8), std(base), 0, 3.2, 0))
      g.add(mesh(new THREE.BoxGeometry(12.6, 0.5, 8.6), std('#4b5563'), 0, 6.6, 0))

      // shopfront glazing with a lit interior behind it
      const glass = new THREE.Mesh(
        new THREE.PlaneGeometry(8.4, 2.6),
        new THREE.MeshBasicMaterial({ color: '#FFE9C4' })
      )
      glass.position.set(0, 2.0, 4.02)
      g.add(glass)
      // mullions
      for (const mx of [-2.8, 0, 2.8]) {
        g.add(mesh(new THREE.BoxGeometry(0.14, 2.6, 0.1), std('#4A4034'), mx, 2.0, 4.06))
      }
      // display silhouettes in the window
      for (let i = 0; i < 5; i++) {
        const box = mesh(
          new THREE.BoxGeometry(0.5 + rng() * 0.5, 0.5 + rng() * 0.7, 0.3),
          std(accent, { roughness: 0.7 }),
          -3.4 + i * 1.7, 1.4 + rng() * 0.4, 3.6
        )
        g.add(box)
      }

      // door
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), new THREE.MeshBasicMaterial({ color: '#1A1712' }))
      door.position.set(4.2, 1.3, 4.03)
      g.add(door)

      // striped awning
      const awning = mesh(new THREE.BoxGeometry(10, 0.14, 1.8), std(accent), 0, 3.7, 4.7)
      awning.rotation.x = -0.2
      g.add(awning)
      for (let i = -4; i <= 4; i++) {
        const stripe = mesh(new THREE.BoxGeometry(0.55, 0.16, 1.82), std('#F5F1E8'), i * 1.1, 3.71, 4.7)
        stripe.rotation.x = -0.2
        if (i % 2 === 0) g.add(stripe)
      }

      // signboard
      const sign = signPlane({ text: name, w: 8.4, h: 1.5, bg: accent, sub: goods })
      sign.position.set(0, 5.2, 4.05)
      g.add(sign)
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.1), new THREE.MeshBasicMaterial({ color: '#FFE9C4', toneMapped: false }))
      halo.position.set(0, 4.4, 4.06)
      g.add(halo)

      // pavement stall out front — the detail that makes a parade feel used
      const stall = new THREE.Group()
      stall.add(mesh(new THREE.BoxGeometry(2.6, 0.12, 1.2), std('#6B5140'), 0, 0.9, 0))
      for (const lx of [-1.1, 1.1]) {
        stall.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), std('#4A3728'), lx, 0.45, 0.45))
        stall.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), std('#4A3728'), lx, 0.45, -0.45))
      }
      for (let i = 0; i < 6; i++) {
        stall.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), std(NEON[i % NEON.length]), -1 + i * 0.4, 1.06, (rng() - 0.5) * 0.5))
      }
      stall.position.set(-3.5, 0, 5.9)
      g.add(stall)

      g.position.set(x, 0, Z)
      g.rotation.y = Math.PI // face south, toward the square
      this.scene.add(g)
      this.addCollider(x - 6, x + 6, Z - 4.4, Z + 4.4, 6.4)
      this.addCollider(x + 2.6, x + 4.4, Z - 6.6, Z - 5.2, 1.1) // the stall

      this.addInteractable({
        pos: () => ({ x, z: Z - 5.4 }),
        radius: 2.4,
        label: `Look at ${name} (E)`,
        action: (game) => game.ui.toast(`${name} — ${goods}. Window shopping only for now.`),
      })
    }

    // pavement and planting along the parade
    pavement(this, { x: 0, z: Z - 6.4, length: 108, width: 3.4, dir: 'x' })
    const rowTrees = []
    for (let x = -44; x <= 44; x += 8) {
      if (!PARADE.some((p) => Math.abs(x - p.x) < 4)) rowTrees.push([x, Z - 8.6, rng() < 0.5 ? 'canopy' : 'maple'])
    }
    treeLine(this, rowTrees, { rng })
    for (let x = -40; x <= 40; x += 16) streetLamp(this, { x, z: Z - 7.4, rotY: Math.PI })
    for (const x of [-28, 0, 28]) streetBench(this, { x, z: Z - 8.2, rotY: Math.PI })
    for (const x of [-14, 14]) bin(this, { x, z: Z - 7.6 })
  }

  // People at the edges of the map, so the corners are not dead space.
  populateCorners() {
    const rng = mulberry32(WORLD_SEED + 909)
    const CORNERS = [
      { x: -44, z: 44, lines: ['This end of the avenue is quieter. I like it.', 'The bakery opens early if you want fresh bread.'] },
      { x: 44, z: 44, lines: ['Waiting for my bus. It is never on time.', 'The parade up there has everything you need.'] },
      { x: -44, z: 12, lines: ['Careful on the crossing, the taxis do not slow down.', 'Been walking this street for years.'] },
      { x: 44, z: 12, lines: ['Nice evening for it.', 'That sneaker shop always has a queue.'] },
      { x: -20, z: 66, lines: ['Just heading home.', 'Quiet up here, away from the square.'] },
      { x: 20, z: 66, lines: ['My shop is on the parade. Come by.', 'Everything is fresher in the morning.'] },
    ]
    const area = (c) => ({ minX: c.x - 7, maxX: c.x + 7, minZ: c.z - 7, maxZ: c.z + 7 })
    for (const c of CORNERS) {
      const person = makePerson(pickKind(rng), rng)
      this.addNPC(new NPC({ person, pos: { x: c.x, z: c.z }, area: area(c), lines: c.lines }))
    }
  }

  // Seated people and a children's ball game.
  buildActivities() {
    const rng = mulberry32(WORLD_SEED + 1212)
    this.activities = []

    // --- people sitting on the plaza benches ---
    // Seats come from world.seatAnchors, which every bench registers as it is
    // built. The previous version used hardcoded coordinates that went stale
    // the moment a bench moved, which is why people sat in midair.
    const anchors = (this.seatAnchors ?? []).slice()
    const SITTERS = [
      { kind: 'aunty', lines: ['Resting my legs a while.', 'Sit, sit. No hurry.'] },
      { kind: 'grandpa', lines: ['Forty years I have watched this square.', 'The fountain is new. I liked the old one.'] },
      { kind: 'woman', lines: ['Waiting for a friend.', 'Best seat in the square, this.'] },
      { kind: 'man', lines: ['Ten minutes of peace before I head back.', 'Long day.'] },
      { kind: 'girl', lines: ['Reading before the light goes.', 'One more chapter.'] },
      { kind: 'uncle', lines: ['This bench and I go back years.', 'Too much noise these days.'] },
    ]
    const seated = []
    for (const spec of SITTERS) {
      if (!anchors.length) break
      // spread across the available benches rather than filling one
      const a = anchors.splice(Math.floor(rng() * anchors.length), 1)[0]
      const person = makePerson(spec.kind, rng)
      const npc = this.addNPC(new NPC({ person, pos: { x: a.x, z: a.z }, lines: spec.lines }))
      seat(npc, { x: a.x, z: a.z, heading: a.heading, height: a.height })
      seated.push(npc)
    }
    this.activities.push(new SeatedGroup(seated))

    // --- children playing ball on the north lawn ---
    // Deliberately different archetypes and shirt colours, started far apart:
    // four same-sized kids spawned on top of each other read as one blob.
    const kids = []
    const KID_SPECS = [
      { kind: 'boy', top: '#E4572E', x: -6.5, z: 20 },
      { kind: 'girl', top: '#3D5A80', x: 6.5, z: 21 },
      { kind: 'child', top: '#F2C14E', x: -5, z: 29 },
      { kind: 'boy', top: '#2A9D8F', x: 6, z: 29.5 },
    ]
    for (const k of KID_SPECS) {
      const person = makePerson(k.kind, rng)
      person.top = k.top
      kids.push(this.addNPC(new NPC({
        person, pos: { x: k.x, z: k.z },
        lines: ['Pass it! Pass it!', 'That was nearly a goal.', 'You are always goalie.'],
      })))
    }
    this.ballGame = new BallGame(this, { kids, center: { x: 0, z: 24 }, radius: 7 })
    this.activities.push(this.ballGame)
  }

  // Data the radar draws — cheap vector shapes, not a second render pass.
  buildMinimap() {
    this.minimap = {
      ground: '#1B2029',
      roadColor: '#39424F',
      areas: [
        { x: 0, z: 9, w: 64, d: 46, color: '#2A313C' }, // plaza
        { x: -20, z: 22, w: 18, d: 16, color: '#25402A' }, // lawns
        { x: 20, z: 24, w: 16, d: 14, color: '#25402A' },
      ],
      roads: [
        { x1: -34, z1: -57, x2: -34, z2: 73, w: 8 },
        { x1: 34, z1: -57, x2: 34, z2: 73, w: 8 },
        { x1: -65, z1: 40, x2: 65, z2: 40, w: 8 },
      ],
      buildings: [
        ...this.venues.map((s) => ({ x: s.x, z: -10, w: 12, d: 8, color: '#3B4757' })),
        ...[-34, -20, -6, 8, 22, 36].map((x) => ({ x, z: 56, w: 12, d: 8, color: '#3B4757' })),
      ],
      pois: [
        ...this.venues.map((s) => ({ x: s.x, z: -5.2, color: s.glow, icon: s.name[0], label: s.name })),
        { x: 0, z: 24, color: '#6EE7B7', icon: '⚽', label: 'Ball game' },
        { x: 0, z: 50, color: '#FFD166', icon: 'P', label: 'North Parade' },
      ],
    }
  }

  // ---------- streets ----------
  buildRoads() {
    const road = std('#23262e')
    const lane = new THREE.MeshBasicMaterial({ color: '#e8d44d' })
    for (const [w, d, x, z, vert] of [[8, 130, -34, 8, true], [8, 130, 34, 8, true], [130, 8, 0, 40, false]]) {
      const r = mesh(new THREE.PlaneGeometry(w, d), road)
      r.rotation.x = -Math.PI / 2
      r.position.set(x, 0.015, z)
      r.castShadow = false
      this.scene.add(r)
      // dashed center line
      const count = 14
      for (let i = 0; i < count; i++) {
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(vert ? 0.3 : 3, vert ? 3 : 0.3), lane)
        seg.rotation.x = -Math.PI / 2
        const t = -0.5 + (i + 0.5) / count
        seg.position.set(vert ? x : t * 120, 0.03, vert ? 8 + t * 120 : z)
        this.scene.add(seg)
      }
    }
    // crosswalk stripes into the plaza (west, east, north-center)
    const zebra = new THREE.MeshBasicMaterial({ color: '#dfe3ea' })
    for (const [x, z, vert] of [[-34, 9, true], [34, 9, true], [0, 40, false]]) {
      for (let i = -3; i <= 3; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(vert ? 6.6 : 0.7, vert ? 0.7 : 6.6), zebra)
        s.rotation.x = -Math.PI / 2
        s.position.set(vert ? x : i * 1.15, 0.035, vert ? 9 + i * 1.15 : z)
        this.scene.add(s)
      }
    }
  }

  // ---------- landmarks ----------
  buildFountain() {
    // Tiered basin with live water — see kit/water.js for the references.
    this.fountainRig = new Fountain({ radius: 3.4, jets: 10 }).addTo(this, { x: 0, z: 10 })

    // Benches ringing the fountain, all turned to face it. Real plazas seat
    // people looking at the water, not away from it.
    const ring = 5.6
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      streetBench(this, {
        x: Math.cos(a) * ring,
        z: 10 + Math.sin(a) * ring,
        // The bench seat faces its local +Z. To look inward we need that to
        // point at the centre, i.e. along -(cos a, sin a) — hence the atan2.
        // (-a + PI/2 aims it the opposite way and seats everyone facing out.)
        rotY: Math.atan2(-Math.cos(a), -Math.sin(a)),
      })
    }
  }

  buildFacade({ key, x, name, base, accent, sub, glow }) {
    const scene = this.scene
    // POUNCE Footwear uses a dark premium base + its own storefront (below), so we
    // skip the generic plain door/windows/sign to avoid a half-built look.
    const isAura = key === 'fashion'
    scene.add(mesh(new THREE.BoxGeometry(12, 7, 8), std(isAura ? '#2a2e35' : base), x, 3.5, -10))
    scene.add(mesh(new THREE.BoxGeometry(12.6, 0.5, 8.6), std('#4b5563'), x, 7.2, -10))

    if (!isAura) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.2), new THREE.MeshBasicMaterial({ color: '#161425' }))
      door.position.set(x, 1.6, -5.94)
      scene.add(door)
      for (const wx of [-3.6, 3.6]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2), new THREE.MeshBasicMaterial({ color: glow }))
        win.position.set(x + wx, 2.2, -5.94)
        scene.add(win)
      }
      const awning = mesh(new THREE.BoxGeometry(4, 0.12, 1.4), std(accent), x, 3.55, -5.5)
      awning.rotation.x = 0.18
      scene.add(awning)

      const sign = signPlane({ text: name, w: 7, h: 1.5, bg: accent, sub })
      sign.position.set(x, 5.6, -5.9)
      scene.add(sign)
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 0.14), new THREE.MeshBasicMaterial({ color: glow }))
      halo.position.set(x, 4.78, -5.9)
      scene.add(halo)
    }

    // SOLE gets a full-height drop banner beside the door — a flagship
    // announcing a limited release should be readable from across the square.
    if (key === 'sole') {
      const bannerTex = makeCanvasTexture(420, 1024, (ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, '#FF4D2E')
        grad.addColorStop(0.55, '#C2200E')
        grad.addColorStop(1, '#1A0B06')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 5
        ctx.strokeRect(14, 14, w - 28, h - 28)
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#FFF'
        ctx.font = 'bold 128px ui-sans-serif, system-ui'
        ctx.letterSpacing = '20px'
        ctx.fillText('SOLE', 0, -300)
        ctx.font = 'bold 52px ui-sans-serif, system-ui'
        ctx.letterSpacing = '10px'
        ctx.fillStyle = '#FFD9A0'
        ctx.fillText('SNEAKER', 0, -190)
        ctx.fillText('FLAGSHIP', 0, -130)
        // the drop callout
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(-w / 2 + 34, -40, w - 68, 250)
        ctx.fillStyle = '#FFF'
        ctx.font = 'bold 78px ui-sans-serif, system-ui'
        ctx.letterSpacing = '4px'
        ctx.fillText('DROP', 0, 20)
        ctx.font = 'bold 92px ui-sans-serif, system-ui'
        ctx.fillStyle = '#D8F32B'
        ctx.fillText('SOLAR', 0, 108)
        ctx.fillText('FLARE', 0, 190)
        ctx.font = '44px ui-sans-serif, system-ui'
        ctx.fillStyle = '#FFE1CF'
        ctx.letterSpacing = '2px'
        ctx.fillText('LIVE NOW · 120 PAIRS', 0, 300)
        ctx.font = 'bold 40px ui-sans-serif, system-ui'
        ctx.fillStyle = '#FFF'
        ctx.fillText('▼  ENTER  ▼', 0, 400)
        ctx.restore()
      })
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.3), new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: false }))
      banner.position.set(x - 4.3, 3.4, -5.88)
      scene.add(banner)
      const banner2 = banner.clone()
      banner2.position.x = x + 4.3
      scene.add(banner2)

      // lit soffit strip over the entrance so the shopfront glows at dusk
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(11, 0.22), new THREE.MeshBasicMaterial({ color: '#FF6B3D', toneMapped: false }))
      strip.position.set(x, 3.75, -5.87)
      scene.add(strip)
    }

    // POUNCE Footwear gets a premium modern storefront: glass, illuminated logo,
    // lit window displays, a canopy and planters.
    if (key === 'fashion') this._auraStorefront(x, accent, glow)

    this.addCollider(x - 6, x + 6, -14, -6, 8)
    this.addInteractable({
      pos: () => ({ x, z: -5.2 }),
      radius: 2.4,
      label: `Enter ${name} (E)`,
      action: (game) => game.switchWorld(key, 'entry'),
    })
  }

  // A grand two-storey flagship for POUNCE Footwear: taller massing, double-height
  // glass with brushed-metal mullions, real shoes lit in the windows, a big
  // illuminated channel-letter sign + a projecting blade sign, wood/stone mix.
  _auraStorefront(x, accent, glow) {
    const scene = this.scene
    const z = -5.85
    const concrete = std('#d2cdc2', { roughness: 0.95 })
    const wood = std('#8a5a34', { roughness: 0.7 })
    const metal = std('#3a3f4c', { roughness: 0.35, metalness: 0.6 })
    const dark = std('#15181d', { roughness: 0.5 })
    const stone = std('#d9dde3', { roughness: 0.4 })
    const glassMat = new THREE.MeshStandardMaterial({ color: '#cfe6f0', transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0.1, depthWrite: false })

    // ---- taller flagship massing: a second-storey brand slab + parapet ----
    scene.add(mesh(new THREE.BoxGeometry(12.4, 5.6, 1.0), concrete, x, 9.7, z - 0.18))
    scene.add(mesh(new THREE.BoxGeometry(13.0, 0.5, 1.5), std('#eceef2'), x, 12.6, z - 0.18)) // parapet cap
    // full-height concrete pilasters
    for (const px of [-5.9, 5.9]) scene.add(mesh(new THREE.BoxGeometry(1.0, 12.6, 0.8), concrete, x + px, 6.3, z - 0.16))
    // polished dark plinth base
    scene.add(mesh(new THREE.BoxGeometry(11.9, 0.5, 0.8), dark, x, 0.25, z - 0.06))

    // ---- double-height glass storefront ----
    // dark lit interior wall well behind the glass gives real depth
    scene.add(mesh(new THREE.BoxGeometry(11, 6.8, 0.2), dark, x, 3.6, z - 0.5))
    const glass = mesh(new THREE.BoxGeometry(10.8, 6.6, 0.06), glassMat, x, 3.6, z + 0.18)
    scene.add(glass)
    // brushed-metal mullion grid
    for (const mx of [-3.6, -1.7, 1.7, 3.6]) scene.add(mesh(new THREE.BoxGeometry(0.1, 6.6, 0.16), metal, x + mx, 3.6, z + 0.22))
    scene.add(mesh(new THREE.BoxGeometry(10.8, 0.12, 0.16), metal, x, 3.8, z + 0.22)) // mezzanine transom
    scene.add(mesh(new THREE.BoxGeometry(10.8, 0.16, 0.18), metal, x, 6.9, z + 0.22)) // head
    scene.add(mesh(new THREE.BoxGeometry(10.8, 0.16, 0.18), metal, x, 0.4, z + 0.22)) // sill

    // ---- illuminated channel-letter sign on the upper slab ----
    const signTex = makeCanvasTexture(2048, 360, (ctx, w, h) => {
      ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#e11d48'; ctx.fillRect(66, h / 2 - 86, 172, 172)
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '900 128px ui-sans-serif, system-ui'; ctx.fillText('P', 152, h / 2 + 4)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#14171c'; ctx.font = '900 176px ui-sans-serif, system-ui'; ctx.fillText('POUNCE', 296, h / 2 - 24)
      const aw = ctx.measureText('POUNCE ').width
      ctx.fillStyle = '#e11d48'; ctx.fillText('FOOTWEAR', 296 + aw, h / 2 - 24)
      ctx.fillStyle = '#6b6257'; ctx.font = '700 52px ui-sans-serif, system-ui'; ctx.fillText('PREMIUM SNEAKERS  ·  EST. 2026', 298, h / 2 + 100)
    })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 1.86), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }))
    sign.position.set(x, 9.9, z + 0.34)
    scene.add(sign)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.16, 0.12), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }))
    bar.position.set(x, 8.4, z + 0.2)
    scene.add(bar)

    // ---- projecting blade sign (flagship signature) ----
    const bladeTex = makeCanvasTexture(256, 1024, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#e11d48'); g.addColorStop(1, '#8f1330')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 6; ctx.strokeRect(12, 12, w - 24, h - 24)
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 2)
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 150px ui-sans-serif, system-ui'
      ctx.fillText('POUNCE', 0, 0); ctx.restore()
    })
    const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 5), new THREE.MeshBasicMaterial({ map: bladeTex, toneMapped: false, side: THREE.DoubleSide }))
    blade.position.set(x - 6.4, 8.2, z + 1.9)
    blade.rotation.y = Math.PI / 2
    scene.add(blade)
    scene.add(mesh(new THREE.BoxGeometry(2.1, 0.1, 0.1), metal, x - 5.6, 10.6, z + 1.9))

    // ---- warm wood canopy + LED + downlights ----
    scene.add(mesh(new THREE.BoxGeometry(11.9, 0.24, 2.1), wood, x, 7.15, z + 0.95))
    const led = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }))
    led.position.set(x, 7.02, z + 1.1)
    scene.add(led)

    // ---- two double-height window displays with REAL shoes ----
    this._flagWindow(x - 3.5, z, [SHOES[0], SHOES[5]])
    this._flagWindow(x + 3.5, z, [SHOES[3], SHOES[11]])

    // ---- recessed glass entrance + stone threshold + POUNCE mat ----
    for (const dx of [-0.78, 0.78]) scene.add(mesh(new THREE.BoxGeometry(1.44, 3.7, 0.06), glassMat, x + dx, 1.95, z + 0.26))
    for (const dx of [-1.6, 0, 1.6]) scene.add(mesh(new THREE.BoxGeometry(0.12, 3.8, 0.18), metal, x + dx, 1.95, z + 0.3))
    scene.add(mesh(new THREE.BoxGeometry(3.4, 0.16, 0.18), metal, x, 3.85, z + 0.3))
    scene.add(mesh(new THREE.BoxGeometry(3.6, 0.1, 1.3), stone, x, 0.05, z + 1.0))
    const matTex = makeCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#15181d'; ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = accent; ctx.lineWidth = 10; ctx.strokeRect(16, 16, w - 32, h - 32)
      ctx.fillStyle = '#f6f3ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 120px ui-sans-serif, system-ui'
      ctx.fillText('POUNCE', w / 2, h / 2)
    })
    const matM = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.1), new THREE.MeshBasicMaterial({ map: matTex, toneMapped: false }))
    matM.rotation.x = -Math.PI / 2
    matM.position.set(x, 0.12, z + 1.0)
    scene.add(matM)

    // ---- planters (wide) + hours/offer plates on the pilasters ----
    for (const px of [-5.1, 5.1]) {
      const g = new THREE.Group()
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), std('#20242c'), 0, 0.4, 0))
      g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), std('#2f6f3f'), 0, 0.98, 0))
      g.position.set(x + px, 0, z + 0.9)
      scene.add(g)
      this.addCollider(x + px - 0.36, x + px + 0.36, z + 0.55, z + 1.25, 1.1)
    }
    const plate = (bg, a, b, l1, l2) => makeCanvasTexture(256, 140, (ctx, w, h) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)
      ctx.textAlign = 'center'; ctx.fillStyle = a; ctx.font = 'bold 42px ui-sans-serif, system-ui'; ctx.fillText(l1, w / 2, 56)
      ctx.fillStyle = b; ctx.font = 'bold 34px ui-sans-serif, system-ui'; ctx.fillText(l2, w / 2, 104)
    })
    const hours = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.55), new THREE.MeshBasicMaterial({ map: plate('#0b0d11', '#86efac', '#e2e8f0', 'OPEN', '10AM – 10PM'), toneMapped: false }))
    hours.position.set(x + 5.9, 1.7, z + 0.42)
    scene.add(hours)
    const off = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.6), new THREE.MeshBasicMaterial({ map: plate(accent, '#fff', '#fff', 'WEEKEND', '40% OFF'), toneMapped: false }))
    off.position.set(x - 5.9, 1.8, z + 0.42)
    scene.add(off)
  }

  // A tall lit window with real shoes on staggered plinths behind the glass.
  _flagWindow(x, z, shoes) {
    const scene = this.scene
    // bright backlit interior panel
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 5.6), new THREE.MeshBasicMaterial({ color: '#fbeed0', toneMapped: false }))
    bl.position.set(x, 3.5, z - 0.12)
    scene.add(bl)
    // warm spotlight grazing the display
    const pl = new THREE.PointLight('#ffdca0', 0.6, 6)
    pl.position.set(x, 4.6, z + 0.4)
    scene.add(pl)
    // two staggered plinths + real shoes behind the glass
    const slots = [[-0.72, 0.9], [0.72, 1.9]] // [dx, plinthTop]
    shoes.forEach((sh, i) => {
      if (!sh) return
      const [dx, top] = slots[i]
      scene.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, top, 20), std('#f2efe8'), x + dx, top / 2, z + 0.02))
      const model = normalizeToSize(buildPairLite(sh.spec), 0.8)
      model.position.set(x + dx, top, z + 0.02)
      model.rotation.y = 0.5
      scene.add(model)
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0.28, toneMapped: false }))
      dot.position.set(x + dx, top + 1.1, z - 0.1)
      scene.add(dot)
    })
  }

  buildBillboards() {
    const scene = this.scene
    // mega billboard tower rising behind the shop row — the Times Square wall
    const tower = mesh(new THREE.BoxGeometry(20, 26, 6), std('#241f4e'), 0, 13 + 7, -18)
    scene.add(tower)
    const ads = [
      adCanvas({ bg1: '#7c3aed', bg2: '#db2777', text: 'POUNCE', sub: 'new sneaker drop · AR try-on inside', emoji: '👟' }),
      adCanvas({ bg1: '#0e7490', bg2: '#1e40af', text: 'VOLT', sub: 'feel the current ⚡ AR demos', emoji: '📱' }),
      adCanvas({ bg1: '#16a34a', bg2: '#ca8a04', text: 'BLOOM', sub: 'fresh bakes every hour', emoji: '🧁' }),
    ]
    ads.forEach((tex, i) => {
      const ad = new THREE.Mesh(new THREE.PlaneGeometry(17, 5.4), new THREE.MeshBasicMaterial({ map: tex }))
      ad.position.set(0, 10.4 + i * 6.2, -14.9)
      scene.add(ad)
    })
    // scrolling marquee crown
    const mtex = marqueeTexture('  SHOPVERSE ✦ NEON SQUARE ✦ WELCOME ✦ BIG SALE TODAY ', '#ffe9b8', '#1b163a')
    mtex.repeat.set(2, 1)
    const marquee = new THREE.Mesh(new THREE.PlaneGeometry(19, 1.6), new THREE.MeshBasicMaterial({ map: mtex }))
    marquee.position.set(0, 31.6, -14.9)
    scene.add(marquee)
    this.marquees.push(mtex)

    // angled pylon billboards flanking the square
    // Roadside hoardings. Moved in from the far corners, turned to face the
    // square and lit, because at the old positions and angles they were
    // effectively invisible from anywhere a player actually walks.
    const pylonAds = [
      { x: -20, z: 14, ry: 0.9, tex: adCanvas({ bg1: '#FF4D2E', bg2: '#7A1E10', text: 'SOLAR FLARE', sub: 'SOLE · drop live now', emoji: '👟' }) },
      { x: 20, z: 14, ry: -0.9, tex: adCanvas({ bg1: '#06b6d4', bg2: '#8b5cf6', text: 'TRY AR', sub: 'see it in your space', emoji: '👓' }) },
      { x: -22, z: 32, ry: 2.2, tex: adCanvas({ bg1: '#f43f5e', bg2: '#f59e0b', text: 'SALE 50%', sub: 'today only — Neon Square', emoji: '🎉' }) },
      { x: 22, z: 32, ry: -2.2, tex: adCanvas({ bg1: '#f472b6', bg2: '#7c3aed', text: 'SHOPVERSE', sub: 'the city that shops', emoji: '🌆' }) },
      { x: -33, z: 46, ry: 0.6, tex: adCanvas({ bg1: '#facc15', bg2: '#ef4444', text: 'HOT DOGS', sub: 'corner of 5th & neon', emoji: '🌭' }) },
      { x: 33, z: 46, ry: -0.6, tex: adCanvas({ bg1: '#16a34a', bg2: '#ca8a04', text: 'BLOOM', sub: 'fresh bakes every hour', emoji: '🧁' }) },
    ]
    // Proper roadside hoardings: two footed support posts carry a framed,
    // bordered poster panel that tilts down toward the plaza, with a lit header
    // strip and gantry spotlights raking across the artwork. The poster texture
    // and placement hooks are unchanged — only the structure is upgraded.
    const postMat = std('#2E3340', { metalness: 0.4, roughness: 0.6 })
    const frameMat = std('#4B535C', { metalness: 0.5, roughness: 0.45 })
    for (const p of pylonAds) {
      const g = new THREE.Group()

      // ---- footed support posts to the ground + a cross-brace ----
      for (const lx of [-2.9, 2.9]) {
        g.add(mesh(new THREE.BoxGeometry(0.5, 7.4, 0.5), postMat, lx, 3.7, 0))
        g.add(mesh(new THREE.BoxGeometry(1.0, 0.4, 1.0), std('#5A6068'), lx, 0.2, 0)) // concrete footing
      }
      g.add(mesh(new THREE.BoxGeometry(6.4, 0.34, 0.42), frameMat, 0, 6.7, 0)) // top brace
      g.add(mesh(new THREE.BoxGeometry(6.4, 0.24, 0.36), frameMat, 0, 4.0, 0)) // lower brace

      // ---- panel assembly: tilted down toward the viewer ----
      const panel = new THREE.Group()
      panel.position.set(0, 9.6, 0)
      panel.rotation.x = -0.1 // top leans back so the face angles down at the plaza

      // dark backing board behind the artwork
      panel.add(mesh(new THREE.BoxGeometry(9.8, 5.3, 0.3), std('#141230'), 0, 0, -0.17))
      // the poster artwork (content hook preserved)
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 4.5),
        new THREE.MeshBasicMaterial({ map: p.tex, side: THREE.DoubleSide, toneMapped: false })
      )
      board.position.z = 0.02
      panel.add(board)
      // a real border frame around the poster — four raised bars
      const RIM = 0.3
      panel.add(mesh(new THREE.BoxGeometry(9.9, RIM, 0.4), frameMat, 0, 2.35, 0.05)) // top
      panel.add(mesh(new THREE.BoxGeometry(9.9, RIM, 0.4), frameMat, 0, -2.35, 0.05)) // bottom
      panel.add(mesh(new THREE.BoxGeometry(RIM, 5.3, 0.4), frameMat, -4.8, 0, 0.05)) // left
      panel.add(mesh(new THREE.BoxGeometry(RIM, 5.3, 0.4), frameMat, 4.8, 0, 0.05)) // right

      // ---- lit header strip crowning the board ----
      panel.add(mesh(new THREE.BoxGeometry(6.6, 0.9, 0.5), std('#20243A'), 0, 3.2, 0.06))
      const header = new THREE.Mesh(
        new THREE.PlaneGeometry(6.2, 0.54),
        new THREE.MeshBasicMaterial({ color: '#FFE9C4', toneMapped: false })
      )
      header.position.set(0, 3.2, 0.32)
      panel.add(header)

      // ---- gantry spotlights on arms, raking the artwork ----
      for (const lx of [-3.1, 0, 3.1]) {
        g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 1.2), frameMat, lx, 12.55, 0.6))
        const housing = mesh(new THREE.BoxGeometry(0.55, 0.34, 0.42), std('#3A3F4C'), lx, 12.6, 1.15)
        g.add(housing)
        const lens = new THREE.Mesh(
          new THREE.PlaneGeometry(0.46, 0.24),
          new THREE.MeshBasicMaterial({ color: '#FFF3D6', toneMapped: false })
        )
        lens.position.set(lx, 12.44, 1.24)
        lens.rotation.x = -1.15 // aim the beam down onto the poster
        g.add(lens)
      }

      g.add(panel)
      g.position.set(p.x, 0, p.z)
      g.rotation.y = p.ry
      this.scene.add(g)
      for (const lx of [-2.9, 2.9]) {
        const wx = p.x + Math.cos(p.ry) * lx
        const wz = p.z - Math.sin(p.ry) * lx
        this.addCollider(wx - 0.45, wx + 0.45, wz - 0.45, wz + 0.45, 5)
      }
    }
  }

  // ---------- the metropolis ----------
  // The lot grid that used to stand here produced ~50 near-identical towers and
  // read as an obvious repeating pattern, so it is gone. Distance is now held by
  // buildSkyline()'s silhouette ring plus the two shop rows; the space that
  // freed up is walkable city instead of wallpaper.
  buildCity() {}

  buildSkyline() {
    // distant silhouette ring + fog = the city never visibly ends
    const rng = mulberry32(WORLD_SEED + 99)
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rng() * 0.15
      const r = 88 + rng() * 22
      const x = Math.sin(a) * r
      const z = 8 + Math.cos(a) * r
      const w = 10 + rng() * 14
      const h = 30 + rng() * 34
      const tint = NEON[Math.floor(rng() * NEON.length)]
      const tex = new THREE.CanvasTexture(windowCanvas(tint, 5 + Math.floor(rng() * 3)))
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(Math.round(w / 5), Math.round(h / 6))
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: tex }))
      m.position.set(x, h / 2 - 2, z)
      this.scene.add(m)
    }
  }

  buildLightStrings() {
    // festival string lights around the fountain square
    const posts = [[-6, 4], [6, 4], [6, 16], [-6, 16]]
    for (const [x, z] of posts) this.buildLamp(x, z)
    const bulbGeo = new THREE.SphereGeometry(0.09, 8, 6)
    const bulbMat = new THREE.MeshBasicMaterial()
    const count = posts.length * 11
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, count)
    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    let idx = 0
    for (let s = 0; s < posts.length; s++) {
      const [ax, az] = posts[s]
      const [bx, bz] = posts[(s + 1) % posts.length]
      for (let i = 0; i < 11; i++) {
        const t = (i + 0.5) / 11
        dummy.position.set(ax + (bx - ax) * t, 3.45 - Math.sin(t * Math.PI) * 0.55, az + (bz - az) * t)
        dummy.updateMatrix()
        bulbs.setMatrixAt(idx, dummy.matrix)
        bulbs.setColorAt(idx, col.set(NEON[idx % NEON.length]))
        idx++
      }
    }
    bulbs.instanceMatrix.needsUpdate = true
    this.scene.add(bulbs)
  }

  scatterDecor() {
    const rng = mulberry32(WORLD_SEED)
    // planter trees along the promenade — a little green between the neon
    // DECLUTTER — was 8 potted trees scattered across the open plaza. Trimmed
    // to the two flanking the promenade; restore the full list to bring them
    // back: [[-26, 2], [-12, 24], [12, 24], [26, 2], [-20, 14], [20, 14], [-10, 34], [10, 34]]
    const spots = [[-26, 2], [26, 2]]
    for (const [x, z] of spots) {
      const g = new THREE.Group()
      g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.5, 10), std('#3f4552'), 0, 0.25, 0))
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.4, 8), std('#7a4f2c'), 0, 1.1, 0))
      g.add(mesh(new THREE.SphereGeometry(0.95, 10, 8), std('#3f8f3f'), 0, 2.2, 0))
      g.scale.setScalar(0.85 + rng() * 0.3)
      g.position.set(x, 0, z)
      this.scene.add(g)
      this.addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 1.6)
    }
    for (const [x, z] of [[-24, -4.4], [-8, -4.4], [8, -4.4], [24, -4.4]]) this.buildLamp(x, z)
    // fountain seating is placed in buildFountain() so it stays in step with the
    // basin radius; these are the outlying benches along the promenade
    for (const [x, z, ry] of [[-16, 20, 0.4], [16, 20, -0.4], [0, 30, Math.PI]]) streetBench(this, { x, z, rotY: ry })
  }

  buildLamp(x, z) {
    const g = new THREE.Group()
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8), std('#334155'), 0, 1.7, 0))
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff2c0' }))
    head.position.y = 3.5
    g.add(head)
    g.position.set(x, 0, z)
    this.scene.add(g)
    this.addCollider(x - 0.18, x + 0.18, z - 0.18, z + 0.18, 2)
  }

  buildBench(x, z, rotY) {
    const g = new THREE.Group()
    const wood = std('#8a6d4f')
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.09, 0.5), wood, 0, 0.55, 0))
    for (const lx of [-0.7, 0.7]) g.add(mesh(new THREE.BoxGeometry(0.08, 0.55, 0.5), wood, lx, 0.275, 0))
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), wood, 0, 0.95, -0.25))
    g.position.set(x, 0, z)
    g.rotation.y = rotY
    this.scene.add(g)
    this.colliderFromObject(g, 1)
  }




  populate() {
    // The greeter is hand-authored; everyone else is generated from the
    // archetype mix so the square contains children, adults and elders with
    // genuinely different silhouettes rather than recoloured clones.
    const rng = mulberry32(WORLD_SEED + 404)

    const g = this.spec.greeter
    if (g) {
      const guide = makePerson(g.kind ?? 'woman', rng)
      guide.name = g.name
      this.addNPC(new NPC({
        person: guide,
        pos: g.pos ?? { x: 2.5, z: 14.5 },
        heading: g.heading ?? 0,
        lines: g.lines,
      }))
    }

    // The scenario's cast. Stationary (no `area`) so they stay at the venue
    // they belong to instead of wandering off mid-conversation.
    for (const actor of this.spec.actors ?? []) {
      const person = makePerson(actor.kind ?? 'man', rng)
      person.name = actor.name
      const npc = this.addNPC(new NPC({
        person,
        pos: actor.pos,
        heading: actor.heading ?? Math.PI,
        lines: actor.lines ?? [`${actor.role}.`],
      }))
      // Carried through to the dialogue layer, which needs the role and the
      // persona seed rather than the body.
      npc.actor = actor
    }

    // dialogue pools per archetype, so an uncle doesn't talk like a ten-year-old
    const LINES = {
      child: [['Look how big the fountain is!', 'I want the red sneakers. The RED ones.'], ['Tag! You’re it!', 'Mumma said we can get cupcakes after.']],
      boy: [['Did you see the drop at SOLE? Insane.', 'I’m saving up for those.'], ['Race you to the crossing!', 'My brother works at Volt.']],
      girl: [['The string lights are so pretty tonight.', 'I love the little café here.'], ['Do these go with my jacket?', 'POUNCE has the best fitting room.']],
      woman: [['I came for the billboards, stayed for the coffee.', 'The trial room mirror is genuinely clever.'], ['Fifty percent off at POUNCE today!', 'Meet me by the fountain later.']],
      man: [['I just tried the AR wall at Volt — the drone looks huge.', 'This square never sleeps.'], ['Parking here is a nightmare.', 'The sneakers at SOLE are worth the queue.']],
      aunty: [['Beta, have you eaten something?', 'These prices, I tell you… in my day!'], ['The vegetables here are fresher than the market.', 'Come, sit, rest your legs.']],
      uncle: [['In my time this whole square was empty ground.', 'Traffic gets worse every single year.'], ['You want a good deal? Bargain. Always bargain.', 'The tea stall used to be right here.']],
      grandma: [['Slowly, slowly… no hurry at my age.', 'Such a nice crowd today.'], ['My granddaughter works in that shop.', 'Sit with me a while, na?']],
      grandpa: [['Forty years I have walked this road.', 'The lights are new. I liked the old ones.'], ['Careful crossing, the cars don’t look.', 'Good evening to you, young one.']],
    }

    // Crowd size is the dominant draw-call cost outdoors — each character is
    // ~15 meshes plus a name tag. Kept deliberately small; raise CROWD once the
    // avatars are merged/instanced.
    const area = { minX: -28, maxX: 28, minZ: -2, maxZ: 34 }
    const spots = [[-10, 6], [10, 8], [-14, 20], [14, 22], [-4, 30], [6, 28]]

    for (const [x, z] of spots) {
      const kind = pickKind(rng)
      const person = makePerson(kind, rng)
      const pool = LINES[kind] ?? LINES.man
      const lines = pool[Math.floor(rng() * pool.length)]
      this.addNPC(new NPC({ person, pos: { x, z }, area, lines }))
    }

    // a beat officer stationed by the patrol car
    const cop = makePerson('man', rng)
    cop.name = 'Officer Rane'
    cop.top = '#1B3B7A'
    cop.bottom = '#1B2430'
    this.addNPC(new NPC({
      person: cop, pos: { x: -29, z: 22 }, heading: 1.6,
      lines: [
        'Evening. Keep to the footpath by the crossing, please.',
        'We’re just managing traffic while the road work finishes up.',
        'Any trouble in the square, you come find me.',
      ],
    }))
  }

  update(dt) {
    super.update(dt)
    this.skyDome?.update(dt, this.game.camera.position)
    for (const a of this.activities ?? []) a.update(dt)

    // Water only animates when you're close enough to see it — the ripple
    // scroll and 260-particle spray aren't worth the cost from across the city.
    if (this.fountainRig) {
      const p = this.game.player.pos
      const o = this.fountainRig.origin
      if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < 60 * 60) this.fountainRig.update(dt)
    }

    this.leafFall?.update(dt)
    this.critters?.update(dt, this.game.player.pos)
    this.traffic?.update(dt, this.game.player.pos)
    this.social?.update(dt)

    // the tight shadow box travels with the player, snapped to whole metres so
    // shadow texels don't shimmer as you walk
    if (this.sun) {
      const p = this.game.player.pos
      const sx = Math.round(p.x)
      const sz = Math.round(p.z)
      this.sun.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z)
      this.sun.target.position.set(sx, 0, sz)
      this.sun.target.updateMatrixWorld()
    }

    // police light bar alternates red/blue
    if (this.patrol) {
      this.policeFlash += dt
      const on = Math.floor(this.policeFlash * 3) % 2 === 0
      this.patrol.lampR.material.color.set(on ? '#FF3B3B' : '#4A1418')
      this.patrol.lampB.material.color.set(on ? '#1A2352' : '#3B6BFF')
    }

    // traffic lights cycle on a shared timer
    if (this.lights) {
      this.lightTimer += dt
      if (this.lightTimer > 4) {
        this.lightTimer = 0
        for (const l of this.lights) {
          l.state = (l.state + 1) % 3
          l.lamps.forEach((lamp, i) => lamp.mesh.material.color.set(i === l.state ? lamp.color : '#31363C'))
        }
        // The lights were purely decorative until now — nothing read them.
        // Push their state to the traffic system so cars actually obey.
        const [west, east, north] = this.lights
        this.traffic?.setSignal('west', west?.state)
        this.traffic?.setSignal('east', east?.state)
        this.traffic?.setSignal('north', north?.state)
      }
    }

    for (const tex of this.marquees) tex.offset.x += dt * 0.08
  }

  spawn(tag = 'default') {
    const shop = this.venues.find((s) => s.key === tag)
    if (shop) return { x: shop.x, z: -3.6, heading: 0, camYaw: Math.PI }
    // Open apron south of the fountain, clear of the kids' ball game (0,24) and
    // the benches, so you don't spawn on top of the crowd. Face north into the
    // square with the camera behind.
    return { x: 0, z: 2, heading: 0, camYaw: Math.PI }
  }
}
