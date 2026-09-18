import * as THREE from 'three'

// Activities drive groups of NPCs so the crowd is doing something rather than
// wandering aimlessly. An activity owns the position and animation of the NPCs
// it controls (they get `controlled = true`, which makes NPC.update stand down)
// and exposes update(dt), called from the world.

// ---------------------------------------------------------------------------
// Seated people: park an NPC on a bench, facing out.
// ---------------------------------------------------------------------------
export function seat(npc, { x, z, heading = 0, height = 0.46 }) {
  npc.controlled = true
  npc.group.position.set(x, 0, z)
  npc.heading = heading
  npc.avatar.visual.rotation.y = heading
  npc.avatar.setSitting(true, height)
  return npc
}

export class SeatedGroup {
  constructor(npcs) {
    this.npcs = npcs
  }

  update(dt) {
    for (const n of this.npcs) {
      if (n.paused) continue // talking to the player
      n.avatar.update(dt, false)
    }
  }
}

// ---------------------------------------------------------------------------
// Ball game: a handful of children chase a ball around a patch of the plaza.
// The ball is the only real simulation — kids simply run at it, and whoever
// reaches it first boots it toward somebody else.
// ---------------------------------------------------------------------------
export class BallGame {
  constructor(world, { kids, center = { x: 0, z: 0 }, radius = 7 }) {
    this.world = world
    this.kids = kids
    this.center = center
    this.radius = radius
    this.cooldown = 0

    for (const k of kids) k.controlled = true

    const g = new THREE.Group()
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 10),
      new THREE.MeshStandardMaterial({ color: '#F5F3EF', roughness: 0.55 })
    )
    ball.castShadow = true
    g.add(ball)
    // a couple of patches so the spin is visible
    for (const [px, py, pz] of [[0, 0.2, 0], [0.16, -0.12, 0.1], [-0.15, -0.05, -0.13]]) {
      const patch = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: '#22303F', roughness: 0.6 })
      )
      patch.position.set(px, py, pz).multiplyScalar(1.05)
      patch.scale.set(1, 0.5, 1)
      g.add(patch)
    }
    g.position.set(center.x, 0.22, center.z)
    world.scene.add(g)

    this.ball = g
    this.vel = new THREE.Vector3(2.4, 0, 1.6)
    this.spin = 0
  }

  kick(fromIdx) {
    // aim at a different child, with a bit of scatter so it isn't ping-pong
    const targets = this.kids.filter((_, i) => i !== fromIdx)
    if (!targets.length) return
    const t = targets[Math.floor(Math.random() * targets.length)]
    const dx = t.group.position.x - this.ball.position.x
    const dz = t.group.position.z - this.ball.position.z
    const d = Math.hypot(dx, dz) || 1
    const speed = 4.5 + Math.random() * 3
    this.vel.set((dx / d) * speed + (Math.random() - 0.5), 0, (dz / d) * speed + (Math.random() - 0.5))
    this.cooldown = 0.45
  }

  update(dt) {
    const b = this.ball.position

    // roll with friction
    b.x += this.vel.x * dt
    b.z += this.vel.z * dt
    const damp = Math.pow(0.35, dt)
    this.vel.multiplyScalar(damp)

    // keep it inside the play area
    const dxc = b.x - this.center.x
    const dzc = b.z - this.center.z
    const dc = Math.hypot(dxc, dzc)
    if (dc > this.radius) {
      b.x = this.center.x + (dxc / dc) * this.radius
      b.z = this.center.z + (dzc / dc) * this.radius
      this.vel.x *= -0.6
      this.vel.z *= -0.6
    }

    // rolling spin, and a small bounce so it feels alive
    const speed = Math.hypot(this.vel.x, this.vel.z)
    this.spin += speed * dt * 3
    this.ball.rotation.x = this.spin
    this.ball.position.y = 0.22 + Math.abs(Math.sin(this.spin * 0.5)) * 0.06

    // nudge it if it has all but stopped
    if (speed < 0.3 && this.cooldown <= 0) this.kick(-1)
    this.cooldown = Math.max(0, this.cooldown - dt)

    // kids run at the ball
    this.kids.forEach((k, i) => {
      if (k.paused) {
        k.avatar.update(dt, false)
        return
      }
      const p = k.group.position
      const dx = b.x - p.x
      const dz = b.z - p.z
      const d = Math.hypot(dx, dz)

      if (d < 0.75) {
        if (this.cooldown <= 0) this.kick(i)
        k.avatar.update(dt, false)
      } else {
        const sp = 2.6 * (k.avatar.arch?.pace ?? 1)
        const step = Math.min(sp * dt, d)
        p.x += (dx / d) * step
        p.z += (dz / d) * step
        k.heading = Math.atan2(dx, dz)
        k.avatar.visual.rotation.y = k.heading
        k.avatar.update(dt, true, true)
      }
    })
  }
}
