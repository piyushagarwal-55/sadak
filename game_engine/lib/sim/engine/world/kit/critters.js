import * as THREE from 'three'

// Wildlife kit. A plaza with nothing alive in it reads as a diorama — critters
// are the cheapest way to make it feel inhabited, because they move without the
// player asking them to and they react when the player arrives.
//
// Everything here is instanced per body part across the whole population, so a
// species costs the same handful of draw calls whether there are 4 pigeons or
// 40. The world is already close to its draw-call budget; the entire system is
// 13 meshes.

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o })

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, k) => a + (b - a) * k

// ---------- shared geometry ----------
// Radius-1 blob: instance scale is therefore a radius, not a diameter.
const BLOB = new THREE.IcosahedronGeometry(1, 1)
// Unit box / cone: instance scale is the full size.
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CONE = new THREE.ConeGeometry(1, 1, 6)
// Wing panels hinge at their inner edge, so the geometry is pre-translated to
// sit entirely on +x. Flapping is then a plain rotation about local Z, and the
// opposite wing is the same instance with a negative X scale.
const WING = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.translate(0.5, 0, 0)
  return g
})()
const PETAL_WING = (() => {
  // A butterfly wing is one triangle: hinge edge along Z at x=0, tip at +x.
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.5, 0, 0, 0.5, 1, 0, 0.18], 3))
  g.computeVertexNormals()
  return g
})()

// ---------- matrix scratch ----------
// One dummy for the whole module. Body parts are authored in body-local space
// and multiplied through a root transform, so an animal tips, turns and climbs
// as a single rigid piece instead of each part being posed in world space.
const _dummy = new THREE.Object3D()
const _root = new THREE.Matrix4()
const _part = new THREE.Matrix4()

function setRoot(x, y, z, yaw, pitch = 0, roll = 0) {
  _dummy.position.set(x, y, z)
  _dummy.rotation.set(pitch, yaw, roll, 'YXZ')
  _dummy.scale.set(1, 1, 1)
  _dummy.updateMatrix()
  _root.copy(_dummy.matrix)
}

function setPart(mesh, i, px, py, pz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _dummy.position.set(px, py, pz)
  _dummy.rotation.set(rx, ry, rz, 'YXZ')
  _dummy.scale.set(sx, sy, sz)
  _dummy.updateMatrix()
  _part.multiplyMatrices(_root, _dummy.matrix)
  mesh.setMatrixAt(i, _part)
}

// Animated instance buffers are rewritten every frame and the herd wanders far
// past its authored bounds, so per-mesh frustum culling is worse than useless.
function inst(geo, mat, count, colors) {
  const m = new THREE.InstancedMesh(geo, mat, count)
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  m.frustumCulled = false
  if (colors) {
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) m.setColorAt(i, c.set(colors[i % colors.length]))
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }
  return m
}

const flushMatrices = (meshes) => {
  for (const m of meshes) m.instanceMatrix.needsUpdate = true
}

// ============================================================================
// PIGEONS
// ============================================================================
// The flush is the whole point of the species. Walking into a scattering flock
// is the strongest "this place is real" beat a plaza can give you for free, so
// the peck/walk/idle loop exists mostly to put birds on the ground in the
// player's path, waiting to explode.

const PIGEON_BODY = ['#8B9098', '#9AA0A8', '#6F757D', '#A6ABB2', '#7B828C', '#93989F']
const PIGEON_HEAD = ['#5F6E74', '#4E6B62', '#6A5F74', '#556A72', '#4F6558', '#63596E']

class Pigeons {
  constructor(n, rng, bounds) {
    this.bounds = bounds
    this.birds = []
    for (let i = 0; i < n; i++) {
      const x = lerp(bounds.minX + 1.5, bounds.maxX - 1.5, rng())
      const z = lerp(bounds.minZ + 1.5, bounds.maxZ - 1.5, rng())
      this.birds.push({
        x, z, y: 0,
        yaw: rng() * TAU, heading: rng() * TAU, pitch: 0, roll: 0,
        state: 'peck', timer: rng() * 2.5, phase: rng() * TAU, walkP: rng() * TAU,
        dip: 0, wing: 0, tx: x, tz: z, f: null,
      })
    }
    this.meshes = []
    if (!n) return

    const skin = M('#FFFFFF', { flatShading: true })
    const plate = M('#FFFFFF', { flatShading: true, side: THREE.DoubleSide })
    this.body = inst(BLOB, skin, n, PIGEON_BODY)
    this.head = inst(BLOB, skin, n, PIGEON_HEAD)
    this.beak = inst(CONE, M('#D8A85C'), n)
    this.tail = inst(BOX, skin, n, PIGEON_BODY)
    this.wings = inst(WING, plate, n * 2, PIGEON_BODY.flatMap((c) => [c, c]))
    this.feet = inst(BOX, M('#C4655C'), n * 2)
    this.body.castShadow = true
    this.meshes = [this.body, this.head, this.beak, this.tail, this.wings, this.feet]
  }

  // Launch on an arc directly away from whatever spooked the bird.
  launch(b, awayX, awayZ) {
    const d = Math.hypot(awayX, awayZ) || 1
    const a = Math.atan2(awayX / d, awayZ / d) + (Math.random() - 0.5) * 0.7
    const dist = 8 + Math.random() * 6
    const B = this.bounds
    b.f = {
      sx: b.x, sz: b.z,
      tx: clamp(b.x + Math.sin(a) * dist, B.minX + 1, B.maxX - 1),
      tz: clamp(b.z + Math.cos(a) * dist, B.minZ + 1, B.maxZ - 1),
      t: 0, dur: 1.2 + Math.random() * 0.7, h: 2.4 + Math.random() * 1.8,
    }
    b.state = 'fly'
    b.heading = a
    b.yaw = a
    b.dip = 0
  }

  update(dt, t, playerPos) {
    if (!this.meshes.length) return
    const B = this.bounds

    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i]
      b.timer -= dt

      if (b.state !== 'fly' && playerPos) {
        const dx = b.x - playerPos.x
        const dz = b.z - playerPos.z
        if (dx * dx + dz * dz < 6.25) this.launch(b, dx, dz)
      }

      if (b.state === 'fly') {
        const f = b.f
        f.t += dt
        const k = Math.min(1, f.t / f.dur)
        b.x = lerp(f.sx, f.tx, k)
        b.z = lerp(f.sz, f.tz, k)
        b.y = Math.sin(k * Math.PI) * f.h
        // nose up on the climb, nose down flaring into the landing
        b.pitch = -Math.cos(k * Math.PI) * 0.38
        b.roll = Math.sin(t * 5 + b.phase) * 0.12
        b.wing = 0.2 + Math.sin(t * 22 + b.phase) * 0.95
        if (k >= 1) {
          b.state = 'idle'
          b.y = 0; b.pitch = 0; b.roll = 0; b.wing = 0
          b.timer = 0.5 + Math.random() * 1.2
        }
      } else if (b.state === 'walk') {
        const dx = b.tx - b.x
        const dz = b.tz - b.z
        const d = Math.hypot(dx, dz)
        if (d < 0.09 || b.timer <= 0) {
          b.state = 'peck'
          b.timer = 1.4 + Math.random() * 2.4
          b.pitch = 0; b.roll = 0; b.y = 0
        } else {
          const sp = 0.6
          b.x += (dx / d) * sp * dt
          b.z += (dz / d) * sp * dt
          b.heading = Math.atan2(dx, dz)
          b.walkP += dt * 9
          // waddle: the yaw wobble sells the gait far more than the leg motion
          b.yaw = b.heading + Math.sin(b.walkP) * 0.16
          b.pitch = Math.sin(b.walkP * 2) * 0.09
          b.roll = Math.sin(b.walkP) * 0.1
          b.y = Math.abs(Math.sin(b.walkP)) * 0.012
        }
      } else if (b.state === 'peck') {
        b.dip = Math.max(0, Math.sin(t * 4.6 + b.phase)) ** 3
        if (b.timer <= 0) this.repick(b)
      } else {
        b.dip *= Math.max(0, 1 - dt * 6)
        b.yaw += Math.sin(t * 0.8 + b.phase) * dt * 0.9
        if (b.timer <= 0) this.repick(b)
      }

      const flying = b.state === 'fly'
      const hy = 0.125 - b.dip * 0.105
      const hz = 0.125 + b.dip * 0.05

      setRoot(b.x, 0.135 + b.y, b.z, b.yaw, b.pitch, b.roll)
      setPart(this.body, i, 0, 0, 0, 0.115, 0.1, 0.165)
      setPart(this.head, i, 0, hy, hz, 0.058, 0.06, 0.058)
      setPart(this.beak, i, 0, hy - 0.014, hz + 0.062, 0.016, 0.05, 0.016, Math.PI / 2)
      setPart(this.tail, i, 0, 0.05, -0.2, 0.09, 0.018, 0.15, -0.2)
      // Wings only leave the body while airborne — a folded pigeon is a blob.
      const wa = flying ? b.wing : -0.02
      const wz = flying ? -0.02 : 0.0
      setPart(this.wings, i * 2, 0.045, 0.045, wz, 0.17, 0.02, 0.15, 0, 0, wa)
      setPart(this.wings, i * 2 + 1, -0.045, 0.045, wz, -0.17, 0.02, 0.15, 0, 0, -wa)
      const step = b.state === 'walk' ? Math.sin(b.walkP) * 0.035 : 0
      const fy = flying ? -0.04 : -0.115
      setPart(this.feet, i * 2, 0.04, fy, 0.02 + step, 0.025, 0.02, 0.06)
      setPart(this.feet, i * 2 + 1, -0.04, fy, 0.02 - step, 0.025, 0.02, 0.06)
    }
    flushMatrices(this.meshes)
  }

  repick(b) {
    const B = this.bounds
    const r = Math.random()
    if (r < 0.6) {
      const a = Math.random() * TAU
      const dist = 1.2 + Math.random() * 2.2
      b.tx = clamp(b.x + Math.cos(a) * dist, B.minX + 1, B.maxX - 1)
      b.tz = clamp(b.z + Math.sin(a) * dist, B.minZ + 1, B.maxZ - 1)
      b.state = 'walk'
      b.timer = 2 + Math.random() * 3
    } else if (r < 0.85) {
      b.state = 'peck'
      b.timer = 1.4 + Math.random() * 2.4
    } else {
      b.state = 'idle'
      b.timer = 1 + Math.random() * 2
    }
  }
}

// ============================================================================
// SQUIRRELS
// ============================================================================
// The tail is the entire silhouette. At 10 m a squirrel body is a brown lump —
// what identifies it is the big S-curve of fur arcing up over its back, so the
// three tail blobs are deliberately as large as the body and always visible
// above the spine, including while climbing.

const SQ_FUR = ['#9A5B33', '#8B5230', '#A5673C', '#7F4B2C', '#96603A']

class Squirrels {
  constructor(n, rng, trees, bounds) {
    this.bounds = bounds
    this.trees = trees
    this.list = []
    for (let i = 0; i < n; i++) {
      const a = trees[Math.floor(rng() * trees.length) % trees.length]
      const b = this.otherTree(a, rng)
      const ang = rng() * TAU
      this.list.push({
        x: a.x + Math.cos(ang) * 1.2, z: a.z + Math.sin(ang) * 1.2, y: 0,
        yaw: rng() * TAU, treeA: a, treeB: b, tree: a,
        state: 'pause', timer: rng() * 2, sit: 0, cling: rng() * TAU,
        climbTop: 0, calm: 0, bob: rng() * TAU, tx: a.x, tz: a.z,
      })
    }
    this.meshes = []
    if (!n) return

    const fur = M('#FFFFFF', { flatShading: true })
    const tailColors = []
    for (let i = 0; i < n; i++) {
      const c = SQ_FUR[i % SQ_FUR.length]
      tailColors.push(c, c, c)
    }
    this.body = inst(BLOB, fur, n, SQ_FUR)
    this.head = inst(BLOB, fur, n, SQ_FUR)
    this.tail = inst(BLOB, fur, n * 3, tailColors)
    this.body.castShadow = true
    this.meshes = [this.body, this.head, this.tail]
  }

  otherTree(a, rng) {
    // A scamper route wants a second tree close enough to sprint between.
    let best = a
    let bestD = Infinity
    for (const t of this.trees) {
      if (t === a) continue
      const d = (t.x - a.x) ** 2 + (t.z - a.z) ** 2
      if (d < bestD && d > 4) { bestD = d; best = t }
    }
    return bestD < 400 ? best : a
  }

  nearestTree(x, z) {
    let best = this.trees[0]
    let bestD = Infinity
    for (const t of this.trees) {
      const d = (t.x - x) ** 2 + (t.z - z) ** 2
      if (d < bestD) { bestD = d; best = t }
    }
    return best
  }

  update(dt, t, playerPos) {
    if (!this.meshes.length) return
    const B = this.bounds

    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i]
      s.timer -= dt

      let pd = Infinity
      if (playerPos) pd = Math.hypot(s.x - playerPos.x, s.z - playerPos.z)

      // Bolting for the nearest trunk is the reason to ever get close to one:
      // the player's approach is what triggers the best animation in the set.
      if (pd < 3 && s.state !== 'climb' && s.state !== 'flee') {
        s.tree = this.nearestTree(s.x, s.z)
        s.state = 'flee'
        s.sit = 0
      }

      if (s.state === 'flee') {
        const dx = s.tree.x - s.x
        const dz = s.tree.z - s.z
        const d = Math.hypot(dx, dz)
        s.yaw = Math.atan2(dx, dz)
        if (d < 0.45) {
          s.state = 'climb'
          s.climbTop = 1.8 + Math.random() * 1.2
          s.cling = s.yaw + Math.PI
          s.calm = 0
        } else {
          const sp = 4.2
          s.x += (dx / d) * sp * dt
          s.z += (dz / d) * sp * dt
          s.bob += dt * 20
        }
      } else if (s.state === 'climb') {
        // clamped to the trunk surface, facing into the bark
        s.x = s.tree.x + Math.sin(s.cling) * 0.26
        s.z = s.tree.z + Math.cos(s.cling) * 0.26
        // yaw = cling puts the belly against the bark and the tail hanging down
        s.yaw = s.cling
        s.y = Math.min(s.climbTop, s.y + 2.4 * dt)
        // freeze until the threat has been gone a beat, not just left the radius
        s.calm = pd > 6.5 ? s.calm + dt : 0
        if (s.calm > 1.6) s.state = 'descend'
      } else if (s.state === 'descend') {
        s.y = Math.max(0, s.y - 2.0 * dt)
        if (pd < 4) { s.state = 'climb'; s.calm = 0 }
        else if (s.y <= 0) { s.state = 'pause'; s.timer = 0.4 + Math.random() * 0.8 }
      } else if (s.state === 'run') {
        const dx = s.tx - s.x
        const dz = s.tz - s.z
        const d = Math.hypot(dx, dz)
        s.yaw = Math.atan2(dx, dz)
        if (d < 0.15 || s.timer <= 0) {
          s.state = 'pause'
          s.timer = 0.5 + Math.random() * 1.6
        } else {
          const sp = 2.7
          s.x = clamp(s.x + (dx / d) * sp * dt, B.minX + 0.5, B.maxX - 0.5)
          s.z = clamp(s.z + (dz / d) * sp * dt, B.minZ + 0.5, B.maxZ - 0.5)
          s.bob += dt * 18
        }
      } else if (s.state === 'sit') {
        s.sit = Math.min(1, s.sit + dt * 5)
        if (s.timer <= 0) { s.state = 'pause'; s.timer = 0.3 + Math.random() * 0.9 }
      } else {
        s.sit = Math.max(0, s.sit - dt * 5)
        if (s.timer <= 0) {
          if (Math.random() < 0.4) {
            s.state = 'sit'
            s.timer = 1 + Math.random() * 1.8
          } else {
            // burst to the far end of the two-tree beat, never straight at it
            const dest = Math.random() < 0.5 ? s.treeA : s.treeB
            const a = Math.random() * TAU
            s.tx = clamp(dest.x + Math.cos(a) * 1.4, B.minX + 0.5, B.maxX - 0.5)
            s.tz = clamp(dest.z + Math.sin(a) * 1.4, B.minZ + 0.5, B.maxZ - 0.5)
            s.state = 'run'
            s.timer = 1.2 + Math.random() * 1.4
          }
        }
      }

      const climbing = s.state === 'climb' || s.state === 'descend'
      // Vertical on the trunk, up on the haunches, or level on the ground.
      const pitch = climbing ? -Math.PI / 2 : -s.sit * 1.0
      const running = s.state === 'run' || s.state === 'flee'
      const hop = running ? Math.abs(Math.sin(s.bob)) * 0.035 : 0
      const base = climbing ? s.y + 0.16 : 0.105 + s.sit * 0.055 + hop
      const sway = Math.sin(t * 3 + i) * (climbing ? 0.03 : 0.09)

      setRoot(s.x, base, s.z, s.yaw, pitch, 0)
      setPart(this.body, i, 0, 0, 0, 0.078, 0.082, 0.125)
      setPart(this.head, i, 0, 0.075, 0.125, 0.06, 0.058, 0.062)
      // three blobs climbing the arc: base, apex, then curling forward over the back
      setPart(this.tail, i * 3, sway * 0.4, 0.03, -0.145, 0.075, 0.075, 0.085)
      setPart(this.tail, i * 3 + 1, sway * 0.8, 0.175, -0.2, 0.085, 0.09, 0.085)
      setPart(this.tail, i * 3 + 2, sway, 0.315, -0.115, 0.078, 0.082, 0.075)
    }
    flushMatrices(this.meshes)
  }
}

// ============================================================================
// SONGBIRDS
// ============================================================================
// Perched high in the canopies where nothing else in the world moves. They are
// far too small to identify at range — the read is a bright fleck of colour
// twitching in the leaves, and the occasional flit between trees.

const SONG_COLORS = ['#F2C14E', '#E4572E', '#4EA8DE', '#8AC926', '#FF6392', '#F7B32B', '#5BC0EB', '#C77DFF']

class Songbirds {
  constructor(n, rng, trees) {
    this.trees = trees
    this.list = []
    for (let i = 0; i < n; i++) {
      const tr = trees[Math.floor(rng() * trees.length) % trees.length]
      const p = this.perchOn(tr, rng)
      this.list.push({
        px: p.x, py: p.y, pz: p.z, x: p.x, y: p.y, z: p.z,
        yaw: rng() * TAU, state: 'perch', timer: rng() * 2, hopT: 0, f: null,
      })
    }
    this.meshes = []
    if (!n) return

    const feather = M('#FFFFFF', { flatShading: true })
    this.body = inst(BLOB, feather, n, SONG_COLORS)
    this.head = inst(BLOB, feather, n, SONG_COLORS)
    this.tail = inst(BOX, feather, n, SONG_COLORS)
    this.meshes = [this.body, this.head, this.tail]
  }

  perchOn(tr, rng = Math.random) {
    const h = tr.h ?? 4
    return {
      x: tr.x + (rng() - 0.5) * 1.6,
      y: h * 0.92 + (rng() - 0.5) * 0.5,
      z: tr.z + (rng() - 0.5) * 1.6,
    }
  }

  update(dt, t) {
    if (!this.meshes.length) return

    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i]
      b.timer -= dt
      b.hopT = Math.max(0, b.hopT - dt * 4.5)
      let roll = 0

      if (b.state === 'flit') {
        const f = b.f
        f.t += dt
        const k = Math.min(1, f.t / f.dur)
        b.x = lerp(f.sx, f.tx, k)
        b.z = lerp(f.sz, f.tz, k)
        b.y = lerp(f.sy, f.ty, k) + Math.sin(k * Math.PI) * 0.9
        roll = Math.sin(t * 20) * 0.25
        if (k >= 1) {
          b.px = f.tx; b.py = f.ty; b.pz = f.tz
          b.state = 'perch'
          b.timer = 0.6 + Math.random() * 1.6
        }
      } else {
        b.x = b.px
        b.z = b.pz
        b.y = b.py + Math.sin(b.hopT * Math.PI) * 0.06
        if (b.timer <= 0) {
          if (Math.random() < 0.2 && this.trees.length > 1) {
            const tr = this.trees[Math.floor(Math.random() * this.trees.length)]
            const p = this.perchOn(tr)
            b.f = { sx: b.x, sy: b.y, sz: b.z, tx: p.x, ty: p.y, tz: p.z, t: 0, dur: 0.9 + Math.random() * 0.7 }
            b.yaw = Math.atan2(p.x - b.x, p.z - b.z)
            b.state = 'flit'
          } else {
            // hop-turn on the spot: a snap of yaw plus a tiny bounce
            b.yaw += (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.3)
            b.hopT = 1
            b.timer = 0.5 + Math.random() * 1.7
          }
        }
      }

      setRoot(b.x, b.y, b.z, b.yaw, 0, roll)
      setPart(this.body, i, 0, 0, 0, 0.055, 0.05, 0.07)
      setPart(this.head, i, 0, 0.055, 0.06, 0.04, 0.04, 0.04)
      setPart(this.tail, i, 0, 0.02, -0.1, 0.04, 0.01, 0.075, -0.25)
    }
    flushMatrices(this.meshes)
  }
}

// ============================================================================
// BUTTERFLIES
// ============================================================================
// Pure eye-catch. Unlit bright pastels so they stay visible against the neon
// dusk instead of dropping into shadow like everything else at this scale.

const BFLY_COLORS = ['#FFD6E8', '#CDE7FF', '#FFF3B0', '#D9C7FF', '#C6F1D6', '#FFD9B0', '#B9E6F2', '#F7C9F0']

class Butterflies {
  constructor(n, rng, bounds) {
    this.bounds = bounds
    this.list = []
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: lerp(bounds.minX + 2, bounds.maxX - 2, rng()),
        z: lerp(bounds.minZ + 2, bounds.maxZ - 2, rng()),
        y: 1.2,
        heading: rng() * TAU,
        spd: 0.5 + rng() * 0.5,
        ph: rng() * TAU,
        ph2: rng() * TAU,
        wobF: 0.6 + rng() * 0.9,
        bobF: 0.7 + rng() * 0.8,
        flapF: 12 + rng() * 8,
      })
    }
    this.meshes = []
    if (!n) return

    const wingColors = []
    for (let i = 0; i < n; i++) {
      const c = BFLY_COLORS[i % BFLY_COLORS.length]
      wingColors.push(c, c)
    }
    this.wings = inst(
      PETAL_WING,
      new THREE.MeshBasicMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, toneMapped: false }),
      n * 2,
      wingColors
    )
    this.meshes = [this.wings]
  }

  update(dt, t) {
    if (!this.meshes.length) return
    const B = this.bounds

    for (let i = 0; i < this.list.length; i++) {
      const b = this.list[i]
      // A slowly-turning heading plus a sine bob gives the drunken wander that
      // reads as a butterfly; straight-line flight reads as a bee.
      b.heading += Math.sin(t * b.wobF + b.ph) * 1.7 * dt
      b.x += Math.sin(b.heading) * b.spd * dt
      b.z += Math.cos(b.heading) * b.spd * dt
      b.y = 1.2 + Math.sin(t * b.bobF + b.ph2) * 0.6

      if (b.x < B.minX + 1 || b.x > B.maxX - 1 || b.z < B.minZ + 1 || b.z > B.maxZ - 1) {
        b.x = clamp(b.x, B.minX + 1, B.maxX - 1)
        b.z = clamp(b.z, B.minZ + 1, B.maxZ - 1)
        b.heading = Math.atan2(-b.x, -b.z) + (Math.random() - 0.5) * 1.2
      }

      const flap = 0.2 + Math.sin(t * b.flapF + b.ph) * 0.95
      setRoot(b.x, b.y, b.z, b.heading, Math.sin(t * b.bobF + b.ph2) * 0.2, 0)
      setPart(this.wings, i * 2, 0, 0, 0, 0.11, 1, 0.17, 0, 0, flap)
      setPart(this.wings, i * 2 + 1, 0, 0, 0, -0.11, 1, 0.17, 0, 0, -flap)
    }
    flushMatrices(this.meshes)
  }
}

// ============================================================================

export class Critters {
  constructor(opts = {}) {
    const {
      rng = Math.random,
      trees = [],
      bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      count = {},
    } = opts

    this.rng = rng
    this.trees = trees
    this.bounds = bounds
    this.t = 0
    this.group = new THREE.Group()
    this.group.name = 'critters'

    // Squirrels and songbirds are defined by the trees they use; with no
    // planting to work from they simply don't exist rather than floating.
    const hasTrees = trees.length > 0
    this.systems = [
      new Pigeons(count.pigeons ?? 10, rng, bounds),
      new Squirrels(hasTrees ? (count.squirrels ?? 5) : 0, rng, trees, bounds),
      new Songbirds(hasTrees ? (count.songbirds ?? 8) : 0, rng, trees),
      new Butterflies(count.butterflies ?? 12, rng, bounds),
    ]
    for (const s of this.systems) for (const m of s.meshes) this.group.add(m)
  }

  addTo(world) {
    world.scene.add(this.group)
    world.critters = this
    // Deliberately no colliders: animals that block the player turn into
    // invisible walls the moment they wander into a doorway.
    return this
  }

  update(dt, playerPos) {
    // A tab-out produces a huge dt; without a cap every critter teleports.
    const step = Math.min(dt || 0, 0.1)
    this.t += step
    for (const s of this.systems) s.update(step, this.t, playerPos)
  }
}
