import { Avatar } from './Avatar.js'
import { collideCircle, clamp, lerpAngle } from '../core/util.js'

let rngCounter = 1
function rand() {
  // deterministic-ish jitter; NPCs don't need true randomness
  rngCounter = (rngCounter * 16807) % 2147483647
  return rngCounter / 2147483647
}

export class NPC {
  constructor({ name, lines = [], pos = { x: 0, z: 0 }, area = null, palette = {}, pace = 1.6, heading = 0, person = null, kind = null, rng = Math.random }) {
    this.lines = lines.length ? lines : ['Hi there!']
    this.area = area // {minX,maxX,minZ,maxZ} — null means stationary
    this.paused = false
    this.radius = 0.42

    this.avatar = new Avatar({ name, person, kind, rng, ...palette })
    // archetypes carry their own gait: children scurry, elders shuffle
    this.name = this.avatar.name
    this.pace = pace * (this.avatar.arch?.pace ?? 1)
    this.group = this.avatar.group
    this.group.position.set(pos.x, 0, pos.z)
    this.heading = heading
    this.avatar.visual.rotation.y = heading

    this.state = 'idle'
    this.timer = 1 + rand() * 3
    this.target = null
    this.stuckTime = 0
  }

  faceToward(x, z) {
    this.heading = Math.atan2(x - this.group.position.x, z - this.group.position.z)
    this.avatar.visual.rotation.y = this.heading
  }

  update(dt, world) {
    // an Activity (see systems/Activities.js) owns position and animation for
    // controlled NPCs, so the wander AI must stay out of the way
    if (this.controlled) return
    if (this.paused || !this.area) {
      this.avatar.update(dt, false)
      return
    }

    this.timer -= dt
    let moving = false

    if (this.state === 'idle') {
      if (this.timer <= 0) {
        const a = this.area
        // Aim at legal ground in the first place. Steering only at the moment
        // of contact makes a pedestrian trudge into the kerb and stall there;
        // rejecting the destination up front makes them look like they chose
        // to walk somewhere sensible.
        let t = null
        for (let i = 0; i < 8; i++) {
          const c = {
            x: a.minX + rand() * (a.maxX - a.minX),
            z: a.minZ + rand() * (a.maxZ - a.minZ),
          }
          if (!world.zones || world.zones.allows('pedestrian', c.x, c.z)) {
            t = c
            break
          }
        }
        this.target = t ?? { x: this.group.position.x, z: this.group.position.z }
        this.state = 'walk'
        this.timer = 12 // give up on unreachable targets
        this.stuckTime = 0
      }
    } else {
      const p = this.group.position
      const dx = this.target.x - p.x
      const dz = this.target.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.3 || this.timer <= 0) {
        this.state = 'idle'
        this.timer = 1.5 + rand() * 3.5
      } else {
        moving = true
        let nx = p.x + (dx / dist) * this.pace * dt
        let nz = p.z + (dz / dist) * this.pace * dt
        ;[nx, nz] = collideCircle(nx, nz, this.radius, world.colliders)
        // Pedestrians keep off the carriageway. Hand-typed roam rectangles used
        // to overlap the road, so shoppers wandered into traffic.
        if (world.zones) [nx, nz] = world.zones.resolve('pedestrian', p.x, p.z, nx, nz)
        const b = world.bounds
        nx = clamp(nx, b.minX + this.radius, b.maxX - this.radius)
        nz = clamp(nz, b.minZ + this.radius, b.maxZ - this.radius)
        const step = Math.hypot(nx - p.x, nz - p.z)
        this.stuckTime = step < this.pace * dt * 0.3 ? this.stuckTime + dt : 0
        if (this.stuckTime > 0.8) {
          this.state = 'idle'
          this.timer = 1 + rand() * 2
        }
        p.set(nx, 0, nz)
        this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), 1 - Math.pow(0.001, dt))
        this.avatar.visual.rotation.y = this.heading
      }
    }
    this.avatar.update(dt, moving)
  }
}
