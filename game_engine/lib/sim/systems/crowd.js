import * as THREE from 'three'
import { makePerson, setWalkPhase, PERSON_PRESETS } from '@/lib/game/people'
import { mulberry32 } from '@/lib/game/props'

/**
 * THE CROWD.
 *
 * Shoppers with somewhere to be. Each one walks to a stall, looks at it for a
 * few seconds, and moves on to another — so the market reads as people WANTING
 * things rather than pedestrians orbiting a plaza. That distinction is most of
 * what "alive" means here, and it costs a state machine with three states.
 *
 * WHY THESE BODIES
 *
 * The shipped game's `people.ts` rig, not ShopVerse's `Avatar`: it is merged
 * low-poly with a real gait (`setWalkPhase` blends idle → walk → run), it comes
 * dressed in saree, salwar, lungi and kurta, and the demo laptop has an Intel
 * UHD with no discrete GPU, where fifteen meshes per body times twenty bodies is
 * the whole frame budget before a single stall is drawn.
 *
 * COST CONTROL
 *
 * Bodies beyond `CULL` are hidden and skipped entirely; between `NEAR` and
 * `CULL` they still walk but update every other frame at double dt, so the gait
 * stays the right speed. The cap is adjustable at runtime so the host's frame
 * watchdog can retire people instead of dropping the whole scene's quality.
 */

const CULL = 46
const NEAR = 20
/** Metres per second. A market crowd shuffles; anything brisker reads as a chase. */
const PACE = { min: 0.75, max: 1.25 }

export class Crowd {
  /**
   * @param {object} world     a BaseWorld
   * @param {{
   *   stations: Array<{x: number, z: number, facing?: number}>,
   *   count?: number, seed?: number, materials?: object,
   *   bounds?: {minX: number, maxX: number, minZ: number, maxZ: number},
   * }} opts
   */
  constructor(world, opts) {
    this.world = world
    this.rand = mulberry32(opts.seed ?? 4242)
    this.stations = opts.stations ?? []
    this.bounds = opts.bounds ?? world.bounds
    this.materials = opts.materials
    this.cap = opts.count ?? 16
    this.tick = 0
    this.people = []

    for (let i = 0; i < this.cap; i++) this.spawn(i)
  }

  spawn(i) {
    const preset = PERSON_PRESETS[Math.floor(this.rand() * 5)] // skip uniform/rider
    const group = makePerson(
      { seed: Math.floor(this.rand() * 1e6), preset },
      this.materials
    )
    group.traverse((o) => {
      if (o.isMesh) o.castShadow = false // twenty shadow casters is the budget
    })

    const start = this.stations.length
      ? this.stations[Math.floor(this.rand() * this.stations.length)]
      : { x: 0, z: 0 }
    group.position.set(start.x + (this.rand() - 0.5) * 3, 0, start.z + (this.rand() - 0.5) * 3)
    this.world.scene.add(group)

    const person = {
      group,
      // Stagger so they do not all set off on the same frame.
      state: this.rand() > 0.5 ? 'browse' : 'walk',
      timer: this.rand() * 6,
      phase: this.rand() * Math.PI * 2,
      gait: 0,
      pace: PACE.min + this.rand() * (PACE.max - PACE.min),
      target: null,
      heading: this.rand() * Math.PI * 2,
    }
    this.pickTarget(person)
    this.people.push(person)
    return person
  }

  pickTarget(person) {
    if (!this.stations.length) {
      person.target = null
      return
    }
    // Somewhere else, with a little scatter so two shoppers never stand in the
    // same spot in front of a stall.
    const s = this.stations[Math.floor(this.rand() * this.stations.length)]
    person.target = {
      x: s.x + (this.rand() - 0.5) * 2.4,
      z: s.z + (this.rand() - 0.5) * 2.4,
      facing: s.facing,
    }
  }

  /** Retire or add people to hold a frame budget. Called by the host's watchdog. */
  setCap(cap) {
    const next = Math.max(4, Math.min(28, Math.round(cap)))
    while (this.people.length > next) {
      const p = this.people.pop()
      this.world.scene.remove(p.group)
    }
    while (this.people.length < next) this.spawn(this.people.length)
    this.cap = next
  }

  update(dt, playerPos) {
    this.tick = (this.tick + 1) % 2

    for (const p of this.people) {
      const dx = p.group.position.x - playerPos.x
      const dz = p.group.position.z - playerPos.z
      const d2 = dx * dx + dz * dz

      if (d2 > CULL * CULL) {
        p.group.visible = false
        continue
      }
      p.group.visible = true

      // Far but visible: step at half rate with double dt so the gait speed is
      // unchanged and only the smoothness suffers, which nobody can see at 30 m.
      const far = d2 > NEAR * NEAR
      if (far && this.tick === 1) continue
      this.step(p, far ? dt * 2 : dt)
    }
  }

  step(person, dt) {
    person.timer -= dt

    if (person.state === 'browse') {
      person.gait += (0 - person.gait) * Math.min(1, dt * 6)
      if (person.timer <= 0) {
        this.pickTarget(person)
        person.state = 'walk'
        person.timer = 22
      }
    } else {
      const t = person.target
      if (!t) {
        person.state = 'browse'
        person.timer = 4
      } else {
        const dx = t.x - person.group.position.x
        const dz = t.z - person.group.position.z
        const dist = Math.hypot(dx, dz)

        if (dist < 0.6 || person.timer <= 0) {
          person.state = 'browse'
          // Long enough to read as looking at something, short enough that the
          // market keeps moving.
          person.timer = 4 + this.rand() * 5
          if (t.facing !== undefined) person.heading = t.facing
        } else {
          const want = Math.atan2(dx, dz)
          person.heading = angleTowards(person.heading, want, dt * 3.2)
          const step = person.pace * dt
          const nx = person.group.position.x + Math.sin(person.heading) * step
          const nz = person.group.position.z + Math.cos(person.heading) * step

          // Zones are the truth about where anyone may stand. A shopper that
          // wanders into a shopfront is shoved back rather than clipping in.
          if (this.world.zones?.allows?.('pedestrian', nx, nz) === false) {
            const [lx, lz] = this.world.zones.nearestLegal('pedestrian', nx, nz)
            person.group.position.set(lx, 0, lz)
            this.pickTarget(person)
          } else {
            person.group.position.set(nx, 0, nz)
          }

          person.gait += (1 - person.gait) * Math.min(1, dt * 6)
          person.phase += (step / 0.62) * Math.PI
        }
      }
    }

    person.group.rotation.y = person.heading
    setWalkPhase(person.group, person.phase, person.gait, 0, performance.now() / 1000)
  }

  dispose() {
    for (const p of this.people) this.world.scene.remove(p.group)
    this.people.length = 0
  }
}

/** Shortest-way angle step, so nobody spins the long way round. */
function angleTowards(from, to, maxStep) {
  let diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI
  if (Math.abs(diff) < maxStep) return to
  return from + Math.sign(diff) * maxStep
}

/**
 * A cow in the way.
 *
 * Every Indian market has one and it is the single cheapest thing that says
 * where you are. It stands, chews, and occasionally shifts a couple of metres,
 * which is exactly what they do.
 */
export class Cow {
  constructor(world, { x, z, materials } = {}) {
    this.world = world
    const g = new THREE.Group()
    const hide = new THREE.MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.95 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x6f6257, roughness: 0.95 })

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 8), hide)
    body.rotation.z = Math.PI / 2
    body.position.y = 0.95
    g.add(body)

    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), hide)
    hump.position.set(0.3, 1.32, 0)
    hump.scale.set(1, 0.8, 0.9)
    g.add(hump)

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 7), hide)
    neck.position.set(0.82, 1.12, 0)
    neck.rotation.z = -0.5
    g.add(neck)

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.3), hide)
    head.position.set(1.12, 0.98, 0)
    g.add(head)
    this.head = head

    for (const sz of [-0.14, 0.14]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 5), dark)
      horn.position.set(1.02, 1.2, sz)
      horn.rotation.z = -0.4
      g.add(horn)
    }
    for (const [lx, lz] of [[-0.45, -0.24], [-0.45, 0.24], [0.5, -0.24], [0.5, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.95, 6), hide)
      leg.position.set(lx, 0.47, lz)
      g.add(leg)
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.7, 5), dark)
    tail.position.set(-0.78, 0.85, 0)
    tail.rotation.z = 0.3
    g.add(tail)
    this.tail = tail

    g.position.set(x ?? 0, 0, z ?? 0)
    g.rotation.y = Math.PI / 2
    g.traverse((o) => { if (o.isMesh) o.castShadow = true })
    world.scene.add(g)
    this.group = g
    this.t = 0

    world.addCollider(g.position.x - 0.8, g.position.x + 0.8, g.position.z - 0.8, g.position.z + 0.8, 1.6)
  }

  update(dt) {
    this.t += dt
    // Chewing, and a tail that never stops.
    this.head.position.y = 0.98 + Math.sin(this.t * 2.2) * 0.03
    this.tail.rotation.x = Math.sin(this.t * 1.7) * 0.35
  }
}
