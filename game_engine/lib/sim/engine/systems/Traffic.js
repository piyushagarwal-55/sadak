import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Road traffic that obeys the road.
//
// The previous cars were pure position integration — `pos.z += dir * speed * dt`
// with a wrap at ±62. That gives you three separate lies at once: cars have no
// idea the traffic lights exist, no idea each other exist, and no idea the city
// grew past ±62, so they evaporated halfway up the avenue.
//
// The fix is to stop treating a car as a free body in 3D space. Here a car is a
// scalar: one number, `s`, its progress along a fixed one-way lane. Its lateral
// position is never simulated at all — it is read straight off the lane's cross
// coordinate. That is the whole safety argument. A car cannot mount the kerb,
// clip a planter or drive through the SOLE shopfront, because there is no
// degree of freedom in which it could: "off the road" is not representable.
// Everything below is therefore 1-D longitudinal control, which is the only
// part of driving this city actually needs.
//
// ---------------------------------------------------------------------------
// LIGHT STATE — how the world drives the signals
// ---------------------------------------------------------------------------
// Chosen mechanism: `this.signals`, a plain object owned by Traffic and written
// by the world. Each lane names the signal that governs it; the world sets that
// name's state when it cycles its own traffic-light props:
//
//     this.traffic.setSignal('west', l.state)   // 0 red · 1 amber · 2 green
//
// `setSignal` accepts either the numeric encoding used by kit/street.js
// trafficLight() (lamps are authored red, amber, green in that order) or the
// strings 'red' | 'amber' | 'green'. Writing `traffic.signals.west = 'red'`
// directly works too — reads are normalised.
//
// Default signal names, matching the three crossings in Outdoor.buildStreetscape:
//   'west'  — crossing at x = -34, z = 9   (world.lights[0])
//   'east'  — crossing at x =  34, z = 9   (world.lights[1])
//   'north' — crossing at x =   0, z = 40  (world.lights[2])
//
// A world that would rather compute state on the fly can instead pass
// `getLightState(lane)` in opts; if present it is consulted first and
// `this.signals` is only the fallback.

const PALETTE = ['#f4c430', '#f4c430', '#ef4444', '#38bdf8', '#a78bfa', '#f472b6']
const TAXI = '#f4c430'

// The box traffic runs through. Deliberately much larger than the walkable
// bounds (x ±88, z -13.5..92) so cars enter and leave from beyond anywhere the
// player can stand — a car that wraps in view reads as a glitch.
const DEFAULT_BOUNDS = { minX: -95, maxX: 95, minZ: -60, maxZ: 100 }

const MIN_GAP = 7 // bumper-to-bumper spacing a follower will not close inside
const LOOK_AHEAD = 26 // how far up the lane a car bothers to look
const STOP_MARGIN = 0.4 // how short of a stop line the car centre settles
const COMFORT_DECEL = 4.5 // the deceleration the speed planner aims for
const MAX_DECEL = 16 // what the brakes can actually do in one frame
const PANIC_DECEL = 48 // player stepped out — everything the car has
const ACCEL = 4.2
const PLAYER_LATERAL = 2.2 // half-width of the carriageway we treat as occupied
const PLAYER_AHEAD = 6.5
const PLAYER_BUMPER = 1.6 // hard floor on how close a car may get to the player
const JUNCTION_CLAIM = 7 // a crossing car this near the box owns the box

// Speed you may be doing now and still stop in `gap` metres at `decel`. Using
// the kinematic form rather than a linear ramp is what makes cars settle *on*
// the stop line instead of creeping over it and correcting back.
const safeSpeed = (gap, decel) => (gap <= 0 ? 0 : Math.sqrt(2 * decel * gap))

// 0 red · 1 amber · 2 green, however the world chose to spell it.
function normaliseState(v) {
  if (v === 0 || v === 'red') return 0
  if (v === 1 || v === 'amber' || v === 'yellow') return 1
  return 2
}

// ---------------------------------------------------------------------------
// geometry — authored once, in car-local space, yaw 0 facing +X
// ---------------------------------------------------------------------------
// Every part is pre-translated into its resting position on the car, so the
// per-instance matrix is the car's root transform and nothing else. Per frame
// that means one Object3D compose per car, reused across all six meshes — no
// matrix multiplies, no per-part bookkeeping.
function carGeometry() {
  // Car faces +X, length ~2.34 along X, width ~1.04 along Z, wheels on the
  // ground (y = 0). Each named group is merged into a single geometry so the
  // whole fleet still costs one instanced draw call per part.
  const body = []
  const cabin = []
  const glass = []
  const wheels = []
  const trim = []
  const head = []
  const tail = []

  // --- lower body: a filleted hull over a slimmer sill, so the silhouette is
  //     a shouldered shape catching light along the beltline, not a slab.
  const hull = new RoundedBoxGeometry(2.34, 0.46, 1.04, 3, 0.12)
  hull.translate(0, 0.5, 0)
  body.push(hull)
  const sill = new THREE.BoxGeometry(2.06, 0.18, 0.94)
  sill.translate(0, 0.33, 0)
  body.push(sill)

  // --- greenhouse: an extruded side profile, so the windshield and backlight
  //     actually rake instead of standing up as a box. Front is +X.
  const belt = 0.7
  const ghW = 0.84
  const side = new THREE.Shape()
  side.moveTo(0.52, 0) // windshield foot
  side.lineTo(0.12, 0.42) // windshield header, raked back
  side.lineTo(-0.62, 0.42) // roof, rear corner
  side.lineTo(-0.88, 0) // backlight foot, raked
  side.closePath()
  const green = new THREE.ExtrudeGeometry(side, { depth: ghW, bevelEnabled: false })
  green.translate(0, belt, -ghW / 2)
  glass.push(green)

  // painted roof cap on top of the greenhouse — this is what carries the
  // per-car two-tone (see meshCabin), so it stays its own group.
  const roof = new THREE.BoxGeometry(0.82, 0.08, 0.9)
  roof.translate(-0.25, belt + 0.42, 0)
  cabin.push(roof)

  // --- wheels: dark tyre + a bright hub cap on the outer face ---
  for (const [wx, wz] of [[-0.72, 0.53], [0.72, 0.53], [-0.72, -0.53], [0.72, -0.53]]) {
    const tyre = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14)
    tyre.rotateX(Math.PI / 2)
    tyre.translate(wx, 0.28, wz)
    wheels.push(tyre)
    const hub = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 8)
    hub.rotateX(Math.PI / 2)
    hub.translate(wx, 0.28, wz + Math.sign(wz) * 0.08)
    trim.push(hub)
  }

  // --- bumpers front and rear, sharing the hub-cap trim material ---
  for (const bx of [1.19, -1.19]) {
    const bump = new THREE.BoxGeometry(0.13, 0.2, 1.0)
    bump.translate(bx, 0.4, 0)
    trim.push(bump)
  }

  // --- paired head/tail lamps ---
  for (const z of [-0.34, 0.34]) {
    const h = new THREE.BoxGeometry(0.06, 0.13, 0.22)
    h.translate(1.18, 0.52, z)
    head.push(h)
    const t = new THREE.BoxGeometry(0.05, 0.13, 0.24)
    t.translate(-1.2, 0.55, z)
    tail.push(t)
  }

  const topper = new THREE.BoxGeometry(0.5, 0.18, 0.3)
  topper.translate(-0.22, belt + 0.42 + 0.17, 0)

  // mergeGeometries requires every input to share the same attributes and
  // index-ness. The parts mix RoundedBox/Box/Cylinder/Extrude, which differ in
  // both, so reduce each to a bare {position, normal}, non-indexed — the cars
  // are flat-shaded solid colours, so UVs aren't needed. This is bulletproof.
  const norm = (g) => {
    const ni = g.index ? g.toNonIndexed() : g
    if (!ni.getAttribute('normal')) ni.computeVertexNormals()
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', ni.getAttribute('position'))
    out.setAttribute('normal', ni.getAttribute('normal'))
    return out
  }
  const merge = (list) => mergeGeometries(list.map(norm), false)

  return {
    body: merge(body),
    cabin: merge(cabin),
    glass: merge(glass),
    wheels: merge(wheels),
    trim: merge(trim),
    head: merge(head),
    tail: merge(tail),
    topper,
  }
}

// Cars are rewritten every frame and roam the whole map, so the authored
// bounding sphere (a car sitting at the origin) is meaningless — per-mesh
// frustum culling would pop the entire fleet out at once.
function inst(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count)
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  m.frustumCulled = false
  return m
}

export class Traffic {
  constructor(opts = {}) {
    const {
      rng = Math.random,
      lanes = null,
      carsPerLane = 3,
      bounds = null,
      getLightState = null,
    } = opts

    this.rng = rng
    this.bounds = bounds ?? DEFAULT_BOUNDS
    this.getLightState = getLightState
    this.signals = { west: 'green', east: 'red', north: 'amber' }

    this.group = new THREE.Group()
    this.lanes = this.buildLanes(lanes)
    this.linkConflicts()
    this.cars = []
    this.buildCars(carsPerLane)

    this._dummy = new THREE.Object3D()
    this._color = new THREE.Color()
  }

  // ---------- lanes ----------
  //
  // A lane is a one-way strip: an axis, the fixed coordinate on the other axis,
  // a direction, the extent it occupies, and a speed limit. `stops` are the
  // points along it where a signal can hold it. `priority` breaks right-of-way
  // at unsignalled crossroads — higher wins.
  buildLanes(custom) {
    const b = this.bounds
    // Derived from Outdoor.buildRoads: vertical carriageways centred x = ±34,
    // the avenue centred z = 40, all 8 units wide. Two lanes per road at ±2
    // from centre, so each lane sits in the middle of its own half.
    // Stop lines clear the zebra (stripes span ±3.45 from the crossing centre)
    // by a car's nose plus a little.
    const spec = custom ?? [
      { axis: 'z', cross: -36, dir: 1, speed: 8.5, priority: 0, stops: [{ at: 4.4, signal: 'west' }] },
      { axis: 'z', cross: -32, dir: -1, speed: 8.5, priority: 0, stops: [{ at: 13.6, signal: 'west' }] },
      { axis: 'z', cross: 36, dir: -1, speed: 8.5, priority: 0, stops: [{ at: 13.6, signal: 'east' }] },
      { axis: 'z', cross: 32, dir: 1, speed: 8.5, priority: 0, stops: [{ at: 4.4, signal: 'east' }] },
      { axis: 'x', cross: 42, dir: -1, speed: 10, priority: 1, stops: [{ at: 4.6, signal: 'north' }] },
      { axis: 'x', cross: 38, dir: 1, speed: 10, priority: 1, stops: [{ at: -4.6, signal: 'north' }] },
    ]

    return spec.map((l, i) => {
      const along = l.axis === 'z' ? [b.minZ, b.maxZ] : [b.minX, b.maxX]
      const min = l.start ?? along[0]
      const max = l.end ?? along[1]
      return {
        index: i,
        axis: l.axis,
        cross: l.cross,
        dir: l.dir >= 0 ? 1 : -1,
        min,
        max,
        length: max - min,
        speed: l.speed ?? 9,
        priority: l.priority ?? 0,
        stops: l.stops ?? [],
        // yaw 0 faces +X. Rotating by θ about Y sends +X to (cos θ, 0, −sin θ),
        // so +Z needs −π/2 and −Z needs +π/2. The old code had this pair
        // inverted, which is why the cars drove backwards for one frame and
        // then sideways forever.
        yaw: l.axis === 'x' ? (l.dir >= 0 ? 0 : Math.PI) : (l.dir >= 0 ? -Math.PI / 2 : Math.PI / 2),
        conflicts: [],
        cars: [],
      }
    })
  }

  // Where perpendicular lanes physically cross. The signalled zebras are only
  // half the story — the vertical roads also cut straight through the avenue at
  // (±34, 40), and without this cars pass through each other there in plain
  // sight. Each pair is resolved by priority (and lane order as a tiebreak) so
  // exactly one side yields; a symmetric "both yield" rule deadlocks.
  linkConflicts() {
    for (const a of this.lanes) {
      for (const c of this.lanes) {
        if (a.axis === c.axis) continue
        const yields = a.priority !== c.priority ? a.priority < c.priority : a.index > c.index
        if (!yields) continue
        // The crossing point sits at (vertical lane's x, horizontal lane's z);
        // each lane measures it in its own coordinate.
        a.conflicts.push({ at: c.cross, other: c, otherAt: a.cross })
      }
    }
  }

  // ---------- fleet ----------
  buildCars(perLane) {
    const rng = this.rng
    const geo = carGeometry()
    const total = this.lanes.length * perLane

    let taxis = 0
    const plan = []
    for (const lane of this.lanes) {
      for (let i = 0; i < perLane; i++) {
        const color = PALETTE[plan.length % PALETTE.length]
        if (color === TAXI) taxis++
        plan.push({ lane, color })
      }
    }

    // White base materials: instanceColor multiplies through, so per-car paint
    // costs nothing extra.
    const paint = (o = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, ...o })
    this.meshBody = inst(geo.body, paint(), total)
    this.meshCabin = inst(geo.cabin, paint({ roughness: 0.3 }), total)
    this.meshGlass = inst(geo.glass, new THREE.MeshStandardMaterial({ color: '#0e141c', roughness: 0.16, metalness: 0.4 }), total)
    this.meshWheels = inst(geo.wheels, new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.85 }), total)
    this.meshTrim = inst(geo.trim, new THREE.MeshStandardMaterial({ color: '#c2c8cf', roughness: 0.4, metalness: 0.65 }), total)
    this.meshHead = inst(geo.head, new THREE.MeshBasicMaterial({ color: '#fff7cc', toneMapped: false }), total)
    this.meshTail = inst(geo.tail, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), total)
    this.meshBody.castShadow = true
    this.meshCabin.castShadow = true

    this.parts = [this.meshBody, this.meshCabin, this.meshGlass, this.meshWheels, this.meshTrim, this.meshHead, this.meshTail]
    this.group.add(...this.parts)

    if (taxis > 0) {
      this.meshTopper = inst(geo.topper, new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.9 }), taxis)
      this.group.add(this.meshTopper)
    }

    const dummy = new THREE.Object3D()
    const col = new THREE.Color()
    let topperSlot = 0

    plan.forEach((p, i) => {
      const lane = p.lane
      const n = lane.cars.length
      // Even spacing with a little jitter, then start everyone at the limit —
      // a fleet that all launches from a standstill looks like a car park.
      const slot = (n + 0.5) / perLane
      const s = lane.min + (slot * 0.9 + rng() * 0.08) * lane.length
      const car = {
        lane,
        s,
        x: lane.axis === 'z' ? lane.cross : s,
        z: lane.axis === 'z' ? s : lane.cross,
        cruise: lane.speed * (0.86 + rng() * 0.14),
        speed: lane.speed * 0.8,
        braking: false,
        index: i,
        topper: -1,
      }
      if (p.color === TAXI && this.meshTopper) car.topper = topperSlot++
      lane.cars.push(car)
      this.cars.push(car)

      this.meshBody.setColorAt(i, col.set(p.color))
      this.meshCabin.setColorAt(i, col.set(p.color === TAXI ? '#fde68a' : '#e2e8f0'))
      this.meshTail.setColorAt(i, col.set('#7f1d1d'))

      // Seed the matrices so the first rendered frame is already correct, even
      // if something renders before update() is ever called.
      dummy.position.set(car.x, 0, car.z)
      dummy.rotation.set(0, lane.yaw, 0)
      dummy.updateMatrix()
      for (const m of this.parts) m.setMatrixAt(i, dummy.matrix)
      if (car.topper >= 0) this.meshTopper.setMatrixAt(car.topper, dummy.matrix)
    })

    for (const m of this.parts) m.instanceMatrix.needsUpdate = true
    if (this.meshTopper) this.meshTopper.instanceMatrix.needsUpdate = true
    for (const m of [this.meshBody, this.meshCabin, this.meshTail]) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  addTo(world) {
    world.scene.add(this.group)
    world.traffic = this
    // Deliberately no colliders: a car is a moving body, and a static AABB
    // baked at build time would be a phantom wall in the road forever. Worlds
    // that want proximity tests read `this.cars` instead.
    return this
  }

  // ---------- signals ----------
  setSignal(name, state) {
    this.signals[name] = normaliseState(state)
    return this
  }

  lightFor(lane, stop) {
    if (this.getLightState) {
      const v = this.getLightState(lane, stop)
      if (v != null) return normaliseState(v)
    }
    const v = this.signals[stop.signal]
    return v == null ? 2 : normaliseState(v)
  }

  // Distance from `from` to `to` travelling in the lane's direction, measured
  // the long way round the wrap seam rather than going negative. Look-ahead
  // has to be a ring, not a segment — otherwise the car at the top of the lane
  // has no leader and drives into the back of the one that just wrapped.
  ahead(lane, from, to) {
    let d = lane.dir * (to - from)
    if (d < 0) d += lane.length
    return d
  }

  update(dt, playerPos) {
    // A tab-out hands back a multi-second dt; without this the whole fleet
    // teleports through its own look-ahead and lands on top of each other.
    const step = Math.min(dt, 0.1)
    if (step <= 0) return

    const px = playerPos ? playerPos.x : null
    const dummy = this._dummy
    let colorsDirty = false

    for (const lane of this.lanes) {
      const isZ = lane.axis === 'z'
      // The player projected into this lane's frame: how far along, how far off.
      const pAlong = px == null ? null : (isZ ? playerPos.z : playerPos.x)
      const pOff = px == null ? null : Math.abs((isZ ? playerPos.x : playerPos.z) - lane.cross)
      const playerOnLane = pOff != null && pOff < PLAYER_LATERAL

      for (const car of lane.cars) {
        let target = car.cruise
        let panic = false

        // --- follow the car in front ---
        // This is look-ahead, not collision. By the time two boxes overlap the
        // car needed to have started braking ten metres ago, so the query is
        // "who is in front of me and how far", answered before anything touches.
        let gap = Infinity
        for (const other of lane.cars) {
          if (other === car) continue
          const d = this.ahead(lane, car.s, other.s)
          if (d > 0 && d < gap) gap = d
        }
        if (gap < LOOK_AHEAD) target = Math.min(target, safeSpeed(gap - MIN_GAP, COMFORT_DECEL))

        // --- traffic lights ---
        for (const stop of lane.stops) {
          const d = this.ahead(lane, car.s, stop.at)
          if (d > LOOK_AHEAD) continue // behind us, or not our problem yet
          const state = this.lightFor(lane, stop)
          if (state === 2) continue
          if (state === 1) {
            // Amber: stop if you comfortably can, otherwise clear the junction.
            // Braking regardless is what makes cars slam to a halt astride the
            // zebra every time the world flips a light.
            const need = (car.speed * car.speed) / (2 * COMFORT_DECEL) + STOP_MARGIN
            if (d < need) continue
          }
          target = Math.min(target, safeSpeed(d - STOP_MARGIN, COMFORT_DECEL))
        }

        // --- unsignalled crossroads ---
        for (const cf of lane.conflicts) {
          const d = this.ahead(lane, car.s, cf.at)
          if (d > LOOK_AHEAD) continue
          let claimed = false
          for (const other of cf.other.cars) {
            const od = this.ahead(cf.other, other.s, cf.otherAt)
            // Approaching the box, or sitting in it right now.
            if (od < JUNCTION_CLAIM || Math.abs(other.s - cf.otherAt) < 4) { claimed = true; break }
          }
          if (claimed) target = Math.min(target, safeSpeed(d - 2.2, COMFORT_DECEL))
        }

        // --- yield to the player ---
        let playerGap = Infinity
        if (playerOnLane) {
          const d = lane.dir * (pAlong - car.s)
          if (d > -PLAYER_BUMPER && d < PLAYER_AHEAD) {
            playerGap = d
            target = 0
            if (d < 2.6) panic = true
          }
        }

        // --- longitudinal control ---
        const wasBraking = car.braking
        if (target < car.speed) {
          car.speed = Math.max(target, car.speed - (panic ? PANIC_DECEL : MAX_DECEL) * step)
          car.braking = car.speed > 0.15
        } else {
          car.speed = Math.min(target, car.speed + ACCEL * step)
          car.braking = false
        }
        if (car.speed < 0) car.speed = 0

        car.s += lane.dir * car.speed * step

        // The hard guarantee. Control laws are approximations and a player can
        // sidestep into a lane faster than any brake; this simply refuses to
        // let the integration carry a car past them.
        if (playerGap < Infinity) {
          const limit = pAlong - lane.dir * PLAYER_BUMPER
          if (lane.dir * (car.s - limit) > 0) {
            car.s = limit
            car.speed = 0
            car.braking = true
          }
        }

        // Wrap at the lane ends, which are the edges of the traffic box, not
        // the old hard-coded ±62 that sat inside the city.
        if (lane.dir > 0 && car.s > lane.max) car.s -= lane.length
        else if (lane.dir < 0 && car.s < lane.min) car.s += lane.length

        car.x = isZ ? lane.cross : car.s
        car.z = isZ ? car.s : lane.cross

        dummy.position.set(car.x, 0, car.z)
        dummy.rotation.set(0, lane.yaw, 0)
        dummy.updateMatrix()
        for (const m of this.parts) m.setMatrixAt(car.index, dummy.matrix)
        if (car.topper >= 0) this.meshTopper.setMatrixAt(car.topper, dummy.matrix)

        if (car.braking !== wasBraking) {
          this.meshTail.setColorAt(car.index, this._color.set(car.braking ? '#ff2d2d' : '#7f1d1d'))
          colorsDirty = true
        }
      }
    }

    for (const m of this.parts) m.instanceMatrix.needsUpdate = true
    if (this.meshTopper) this.meshTopper.instanceMatrix.needsUpdate = true
    if (colorsDirty && this.meshTail.instanceColor) this.meshTail.instanceColor.needsUpdate = true
  }
}
