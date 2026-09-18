import * as THREE from 'three'
import { Avatar } from './Avatar.js'
import { collideCircle, clamp, lerpAngle, lerp, makeCanvasTexture } from '../core/util.js'

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o })

// ============================================================================
// Employee — a uniformed staff member with goal-directed movement. Unlike the
// wandering NPC, an Employee has a "department" (home) and can be given goals:
//   approach(player)  — path to the customer, then trigger a conversation
//   leadTo(point)     — walk to a section, glancing back so the customer follows
//   goHome()          — return to the department and resume idle activity
// Roles: greeter | associate | inventory | trial | cashier
// ============================================================================
export class Employee {
  constructor({ name, role, pos, heading = Math.PI, palette = {}, home = null, script = null, idle = 'stand' }) {
    this.name = name
    this.role = role
    this.script = script // (game) => dialogue node
    this.idleMode = idle
    this.radius = 0.42
    this.speed = 1.9

    this.avatar = new Avatar({ name, ...palette })
    this.group = this.avatar.group
    this.group.position.set(pos.x, 0, pos.z)
    this.heading = heading
    this.avatar.visual.rotation.y = heading

    this.home = home || { x: pos.x, z: pos.z, heading }
    this.goal = null
    this.paused = false
    this.stuck = 0
    this.idleT = 1 + Math.random() * 2
    this.lookTarget = null
    this.busyActivity = 0

    // living-employee state: a cycle of poses + optional roaming task stations
    this.pose = 'idle'
    this.poseT = 1 + Math.random() * 2
    this.roam = false
    this.stations = []
    this.roamGate = null
    this._lookHeading = this.home.heading

    this.dressUniform(palette)
    this.rt = Math.random() * 10
  }

  // Give the employee an autonomous routine: a set of stations to visit and a
  // gate deciding when roaming is allowed (so it never interrupts the customer
  // flow). Called by the world once staff are placed.
  setRoutine({ roam = false, stations = [], gate = null } = {}) {
    this.roam = roam
    this.stations = stations
    this.roamGate = gate
    this.pose = 'idle'
    this.poseT = 1 + Math.random() * 2
  }

  // ---- uniform: every employee wears the same staff tee ("EMPLOYEE"), with a
  //      role-coloured accent so roles stay subtly distinguishable ----
  dressUniform(palette) {
    const v = this.avatar.visual
    const accent = palette.accent || '#e11d48'

    // one shared uniform colour for all staff (recolours torso + sleeves)
    this.avatar.m.shirt.color.set('#1f2937')

    // "EMPLOYEE" printed across the chest and back
    const empTex = makeCanvasTexture(256, 96, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = accent
      ctx.fillRect(w / 2 - 90, h / 2 + 20, 180, 6) // accent underline
      ctx.fillStyle = '#f8fafc'
      ctx.font = 'bold 40px ui-sans-serif, system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('EMPLOYEE', w / 2, h / 2 - 6)
    })
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: empTex, transparent: true }))
    front.position.set(0, 1.5, 0.185)
    v.add(front)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: empTex, transparent: true }))
    back.position.set(0, 1.42, -0.175)
    back.rotation.y = Math.PI
    v.add(back)

    // name-badge / lanyard on the chest for everyone
    const lanyard = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 24, Math.PI), std('#0f172a'))
    lanyard.position.set(0, 1.62, 0.14)
    lanyard.rotation.x = 0.1
    v.add(lanyard)
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.02), std('#f8fafc'))
    badge.position.set(0, 1.4, 0.19)
    v.add(badge)
    const badgeStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.021), std(accent))
    badgeStripe.position.set(0, 1.44, 0.2)
    v.add(badgeStripe)

    if (this.role === 'cashier' || this.role === 'greeter') {
      // apron (matte black with accent trim)
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.06), std('#111827'))
      apron.position.set(0, 1.05, 0.17)
      v.add(apron)
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.061), std(accent))
      trim.position.set(0, 1.32, 0.171)
      v.add(trim)
    }
    if (this.role === 'associate') {
      // holds a slim inventory tablet at the waist
      const tablet = new THREE.Group()
      tablet.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.2), std('#0f172a', { roughness: 0.3 })))
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ color: '#38bdf8' }))
      scr.rotation.x = -Math.PI / 2
      scr.position.y = 0.011
      tablet.add(scr)
      tablet.position.set(0.34, 1.12, 0.14)
      tablet.rotation.z = -0.3
      v.add(tablet)
      this.tablet = tablet
    }
    if (this.role === 'inventory') {
      // ball cap
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), std(accent))
      cap.position.set(0, 2.05, 0)
      v.add(cap)
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.035, 0.26), std(accent))
      brim.position.set(0, 2.06, 0.24)
      v.add(brim)
    }
    if (this.role === 'trial') {
      // small towel / disposable socks over the forearm
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.24), std('#e2e8f0'))
      towel.position.set(0.4, 1.28, 0.05)
      v.add(towel)
    }
  }

  faceToward(x, z) {
    this.heading = Math.atan2(x - this.group.position.x, z - this.group.position.z)
    this.avatar.visual.rotation.y = this.heading
  }

  // drive the talking pose from the agent's emotion
  setEmotion(e) {
    this.emotion = e
    this.emotionPose = e === 'thinking' || e === 'apologetic' ? 'handsBehind' : 'talk'
  }

  // ---- goals ----
  approach(game, opts = {}) {
    this.goal = { kind: 'approach', game, dist: opts.dist ?? 1.7, onArrive: opts.onArrive }
  }
  leadTo(point, opts = {}) {
    this.goal = { kind: 'lead', point, onArrive: opts.onArrive, game: opts.game }
  }
  goTo(point, opts = {}) {
    this.goal = { kind: 'go', point, onArrive: opts.onArrive, faceHeading: opts.faceHeading }
  }
  goHome(opts = {}) {
    this.goal = { kind: 'go', point: this.home, faceHeading: this.home.heading, onArrive: opts.onArrive }
  }
  clearGoal() {
    this.goal = null
  }
  get busy() {
    return !!this.goal
  }

  // Carry a shoe box while walking (inventory runner).
  carryBox(color = '#c2410c') {
    if (this.box) return
    const box = new THREE.Group()
    box.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), std(color)))
    box.add(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.32), std('#fed7aa')))
    box.position.set(0, 1.25, 0.3)
    this.avatar.visual.add(box)
    this.box = box
  }
  dropBox() {
    if (this.box) {
      this.avatar.visual.remove(this.box)
      this.box = null
    }
  }

  update(dt, world, game) {
    this.rt += dt
    if (this.paused) {
      // gesturing while in conversation — pose reflects the agent's emotion
      this.avatar.update(dt, false)
      const save = this.pose
      this.pose = this.emotionPose || 'talk'
      this._applyPose(dt)
      this.pose = save
      return
    }

    if (this.goal) {
      this._pursue(dt, world, game)
    } else {
      this._live(dt, world, game)
    }
  }

  _pursue(dt, world, game) {
    const p = this.group.position
    let tx, tz
    if (this.goal.kind === 'approach') {
      const pl = game.player.pos
      const dx = p.x - pl.x
      const dz = p.z - pl.z
      const d = Math.hypot(dx, dz) || 1
      tx = pl.x + (dx / d) * this.goal.dist
      tz = pl.z + (dz / d) * this.goal.dist
    } else {
      tx = this.goal.point.x
      tz = this.goal.point.z
    }

    const dx = tx - p.x
    const dz = tz - p.z
    const dist = Math.hypot(dx, dz)
    const arriveR = this.goal.kind === 'approach' ? 0.5 : 0.4

    if (dist < arriveR) {
      const g = this.goal
      // face the customer (approach/lead) or a set heading (go)
      if (g.kind === 'go' && g.faceHeading != null) {
        this.heading = g.faceHeading
        this.avatar.visual.rotation.y = this.heading
      } else if (game) {
        this.faceToward(game.player.pos.x, game.player.pos.z)
      }
      this.goal = null
      this.avatar.update(dt, false)
      if (g.onArrive) g.onArrive(game, this)
      return
    }

    const step = this.speed * dt
    let nx = p.x + (dx / dist) * step
    let nz = p.z + (dz / dist) * step
    ;[nx, nz] = collideCircle(nx, nz, this.radius, world.colliders)
    const b = world.bounds
    nx = clamp(nx, b.minX + this.radius, b.maxX - this.radius)
    nz = clamp(nz, b.minZ + this.radius, b.maxZ - this.radius)
    const moved = Math.hypot(nx - p.x, nz - p.z)
    this.stuck = moved < step * 0.3 ? this.stuck + dt : 0
    p.set(nx, 0, nz)

    // face travel direction, but glance back at the customer while leading
    let faceX = dx, faceZ = dz
    if (this.goal.kind === 'lead' && game && Math.sin(this.rt * 2) > 0.6) {
      faceX = game.player.pos.x - p.x
      faceZ = game.player.pos.z - p.z
    }
    this.heading = lerpAngle(this.heading, Math.atan2(faceX, faceZ), 1 - Math.pow(0.002, dt))
    this.avatar.visual.rotation.y = this.heading
    this.avatar.update(dt, true, false)

    // give up if wedged
    if (this.stuck > 1.6) {
      const g = this.goal
      this.goal = null
      if (game) this.faceToward(game.player.pos.x, game.player.pos.z)
      if (g.onArrive) g.onArrive(game, this)
    }
  }

  // The employee is "alive" while idle: notices the player, cycles through
  // believable poses, and occasionally walks a short routine of tasks.
  _live(dt, world, game) {
    const p = this.group.position
    const pl = game && game.player ? game.player.pos : null
    const nearPlayer = pl && Math.hypot(pl.x - p.x, pl.z - p.z) < 6

    // look-at: turn toward the player when they're near (they notice you but
    // don't chase); otherwise drift to a relaxed random glance.
    this.idleT -= dt
    if (this.idleT <= 0) {
      this.idleT = 3 + Math.random() * 5
      this._lookHeading = this.home.heading + (Math.random() - 0.5) * 1.5
    }
    let target = this._lookHeading
    if (nearPlayer) target = Math.atan2(pl.x - p.x, pl.z - p.z)
    this.heading = lerpAngle(this.heading, target, 1 - Math.pow(0.02, dt))
    this.avatar.visual.rotation.y = this.heading

    // pose / task cycle
    this.poseT -= dt
    if (this.poseT <= 0) this._nextTask(game)

    this.avatar.update(dt, false)
    this._applyPose(dt)
  }

  _roamOK(game) {
    return !this.roamGate || this.roamGate(game)
  }

  _nextTask(game) {
    const common = ['idle', 'lookAround', 'crossArms', 'handsBehind', 'pockets', 'checkWatch', 'stretch', 'drink']
    const byRole = {
      cashier: ['type', 'receipt', 'pos', 'lean', 'drink', 'lookAround'],
      associate: ['tablet', 'restock', 'wipe', 'point', 'idle', 'lookAround'],
      inventory: ['restock', 'tablet', 'idle', 'lookAround'],
      trial: ['wipe', 'fold', 'tablet', 'idle', 'lookAround'],
      greeter: ['handsBehind', 'wave', 'lookAround', 'checkWatch', 'idle'],
    }
    // occasionally set off on a short walking task
    if (this.roam && this.stations.length && this._roamOK(game) && Math.random() < 0.45) {
      const st = this.stations[Math.floor(Math.random() * this.stations.length)]
      if (st.carry) this.carryBox(st.carry)
      this.goTo({ x: st.x, z: st.z }, {
        faceHeading: st.heading,
        onArrive: (g, e) => {
          e.pose = st.pose || 'restock'
          e.poseT = 3 + Math.random() * 3
          if (st.drop) e.dropBox()
        },
      })
      this.poseT = 10 // covers the walk; onArrive resets it
      return
    }
    const pool = (byRole[this.role] || []).concat(common)
    this.pose = pool[Math.floor(Math.random() * pool.length)]
    this.poseT = 2.5 + Math.random() * 4
  }

  // Map the current pose to target limb rotations and ease toward them. Runs
  // AFTER avatar.update (which zeroes the arms when standing).
  _applyPose(dt) {
    const a = this.avatar
    const t = this.rt
    let ALx = 0, ALz = 0, ARx = 0, ARz = 0, HX = 0, HY = 0, UX = 0
    switch (this.pose) {
      case 'crossArms': ALx = -1.25; ARx = -1.3; ALz = 0.5; ARz = -0.5; break
      case 'handsBehind': ALx = 0.32; ARx = 0.32; ALz = -0.28; ARz = 0.28; HX = -0.05; break
      case 'pockets': ALx = -0.12; ARx = -0.12; ALz = 0.32; ARz = -0.32; break
      case 'tablet': ALx = -1.05; ARx = -1.0 + Math.sin(t * 4) * 0.06; HX = 0.28; break
      case 'restock': ARx = -1.15 - Math.max(0, Math.sin(t * 1.4)) * 0.55; ALx = -0.55; break
      case 'wipe': ARx = -1.0; ARz = -0.25 + Math.sin(t * 4) * 0.45; HX = 0.12; break
      case 'type': ALx = -0.7 + Math.sin(t * 7) * 0.05; ARx = -0.7 + Math.sin(t * 7 + 1) * 0.05; HX = 0.16; UX = 0.08; break
      case 'pos': ARx = -0.8 + Math.sin(t * 3) * 0.12; HX = 0.2; break
      case 'receipt': ARx = -0.95; ALx = -0.85; HX = 0.2; break
      case 'lean': UX = 0.3; ALx = -0.5; ARx = -0.5; break
      case 'drink': { const u = Math.sin(t * 1.2) * 0.5 + 0.5; ARx = -2.0 * u - 0.2; HX = 0.14 * u; break }
      case 'stretch': { const u = Math.max(0, Math.sin(t * 1.0)); ALx = -2.4 * u; ARx = -2.4 * u; UX = -0.12 * u; break }
      case 'checkWatch': ALx = -1.5; HX = 0.3; break
      case 'wave': ARx = -2.2; ARz = Math.sin(t * 9) * 0.45; break
      case 'point': ARx = -1.4; HY = 0.25; break
      case 'fold': ALx = -0.9; ARx = -0.9; break
      case 'talk': ARx = -0.35 + Math.sin(t * 3) * 0.35; ALx = -0.2 + Math.sin(t * 3 + 1) * 0.22; HY = Math.sin(t * 1.6) * 0.12; break
      case 'lookAround': HY = Math.sin(t * 0.8) * 0.6; break
      default: ARx = Math.sin(t * 1.1) * 0.05; ALx = -Math.sin(t * 1.1) * 0.05 // idle breathe
    }
    const k = 1 - Math.pow(0.006, dt)
    a.armL.rotation.x = lerp(a.armL.rotation.x, ALx, k)
    a.armL.rotation.z = lerp(a.armL.rotation.z, ALz, k)
    a.armR.rotation.x = lerp(a.armR.rotation.x, ARx, k)
    a.armR.rotation.z = lerp(a.armR.rotation.z, ARz, k)
    if (a.head) {
      a.head.rotation.x = lerp(a.head.rotation.x, HX, k)
      a.head.rotation.y = lerp(a.head.rotation.y, HY, k)
    }
    if (a.upper) {
      const stoop = (a.arch && a.arch.stoop) || 0
      a.upper.rotation.x = lerp(a.upper.rotation.x, stoop + UX, k)
    }
  }
}
