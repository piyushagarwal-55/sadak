import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeCanvasTexture, normalMapFromCanvas, mergeSafe } from '../../core/util.js'

// Water & fountain kit.
//
// Reference points, since a fountain is one of those objects everyone has seen
// and will instantly read as wrong:
//   · Bethesda Fountain, Central Park — the tiered silhouette: a wide low
//     octagonal basin, a stepped plinth, a raised upper bowl that overflows.
//   · Revson Fountain, Lincoln Center — the ring of vertical jets and the
//     uplighting that makes it the centrepiece of a plaza after dark.
//   · Real plaza behaviour — the basin coping is built at seat height, because
//     people sit on it. That single detail is what makes a fountain feel used.
//
// The water itself is the hard part. Still, flat, opaque water reads as plastic.
// Four cheap effects together read as convincing:
//   1. a dual-layer scrolling normal map (ripples travelling in two directions)
//   2. low roughness + envMap so it actually catches the neon around it
//   3. a soft foam ring where the jets land
//   4. spray particles with real ballistic arcs
// None of these need a custom shader or a reflection pass.

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o })

// ---------- shared textures (built once, reused by every fountain) ----------

let RIPPLE = null
function rippleNormal() {
  if (RIPPLE) return RIPPLE
  // Overlapping soft blobs → a bumpy height field. Run through the existing
  // Sobel converter so the ripples get a real tangent-space normal.
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const r = 8 + Math.random() * 26
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const bright = Math.random() > 0.5
    g.addColorStop(0, bright ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)')
    g.addColorStop(1, 'rgba(128,128,128,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  RIPPLE = normalMapFromCanvas(c, 1.1)
  return RIPPLE
}

let STREAK = null
// Vertical streaks — used for falling sheets and jet columns so moving water
// has visible structure instead of being a flat translucent tube.
function streakTexture() {
  if (STREAK) return STREAK
  STREAK = makeCanvasTexture(64, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w
      const wdt = 1 + Math.random() * 3
      const a = 0.18 + Math.random() * 0.5
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, `rgba(255,255,255,${a})`)
      grad.addColorStop(0.5, `rgba(235,248,255,${a * 0.8})`)
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = grad
      ctx.fillRect(x, 0, wdt, h)
    }
  })
  STREAK = Object.assign(STREAK, {})
  STREAK.wrapS = STREAK.wrapT = THREE.RepeatWrapping
  return STREAK
}

let DROPLET = null
// Soft round falloff for spray particles.
function dropletTexture() {
  if (DROPLET) return DROPLET
  DROPLET = makeCanvasTexture(32, 32, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.4, 'rgba(226,244,255,0.7)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  return DROPLET
}

let FOAM = null
function foamTexture() {
  if (FOAM) return FOAM
  FOAM = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.85)')
    g.addColorStop(0.55, 'rgba(226,244,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    // broken bubbly edge so it isn't a clean disc
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2
      const r = w * (0.2 + Math.random() * 0.28)
      ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.3})`
      ctx.beginPath()
      ctx.arc(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 1.5 + Math.random() * 4, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  return FOAM
}

// ---------- water surface ----------

// A pool surface. The two scrolling normal-map layers are the whole trick:
// one large and slow, one small and fast, travelling in different directions.
export function waterSurface({ radius = 1, segments = 40, color = '#1E6E8C', opacity = 0.86 } = {}) {
  const nrm = rippleNormal()
  const a = nrm.clone()
  a.needsUpdate = true
  a.wrapS = a.wrapT = THREE.RepeatWrapping
  a.repeat.set(3, 3)

  const mat = new THREE.MeshStandardMaterial({
    color,
    normalMap: a,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.08,
    metalness: 0.35,
    transparent: true,
    opacity,
    envMapIntensity: 1.6,
  })

  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.receiveShadow = true
  mesh.userData.scroll = a
  return mesh
}

// ---------- spray ----------

// One Points cloud for the whole fountain: particles are launched from the jet
// ring on a real ballistic arc and recycled when they fall back to the water.
class Spray {
  constructor({ count = 260, ringRadius, jetHeight, waterY }) {
    this.count = count
    this.ringRadius = ringRadius
    this.jetHeight = jetHeight
    this.waterY = waterY
    this.pos = new Float32Array(count * 3)
    this.vel = new Float32Array(count * 3)
    this.life = new Float32Array(count)

    for (let i = 0; i < count; i++) this.spawn(i, Math.random() * 1.6)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    const mat = new THREE.PointsMaterial({
      color: '#DCF3FF',
      // Without a sprite map, Points draw as hard squares — which reads as
      // floating confetti, not water. A soft round falloff is essential here.
      map: dropletTexture(),
      alphaTest: 0.02,
      size: 0.11,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.geo = geo
  }

  spawn(i, t = 0) {
    const a = Math.random() * Math.PI * 2
    const r = this.ringRadius * (0.94 + Math.random() * 0.12)
    this.pos[i * 3] = Math.cos(a) * r
    this.pos[i * 3 + 1] = this.waterY + 0.1
    this.pos[i * 3 + 2] = Math.sin(a) * r
    // mostly vertical, with a slight outward lean like a real jet
    const up = 4.4 + Math.random() * 2.6
    this.vel[i * 3] = Math.cos(a) * (0.25 + Math.random() * 0.5)
    this.vel[i * 3 + 1] = up
    this.vel[i * 3 + 2] = Math.sin(a) * (0.25 + Math.random() * 0.5)
    this.life[i] = t
  }

  update(dt) {
    const G = -9.8
    for (let i = 0; i < this.count; i++) {
      this.life[i] += dt
      this.vel[i * 3 + 1] += G * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      if (this.pos[i * 3 + 1] <= this.waterY) this.spawn(i)
    }
    this.geo.attributes.position.needsUpdate = true
  }
}

// ---------- the fountain ----------

export class Fountain {
  // `radius` is the outer basin radius. Coping height is fixed at 0.46 m — the
  // height people actually sit at — so the rim doubles as plaza seating.
  constructor({ radius = 3.4, stone = '#B9B3A6', water = '#1E6E8C', jets = 10 } = {}) {
    this.group = new THREE.Group()
    this.radius = radius
    this.t = 0

    const COPING_Y = 0.46
    const WATER_Y = 0.34

    // ---- stone, merged into a single draw call ----
    // Every static masonry piece is one geometry: the plaza is already near its
    // draw-call budget, so a 9-piece fountain shipping as 9 meshes is not free.
    const parts = []
    const add = (geo, x, y, z) => {
      geo.translate(x, y, z)
      parts.push(geo)
    }

    // outer basin: wall + wide flat coping to sit on
    add(new THREE.CylinderGeometry(radius, radius + 0.08, COPING_Y, 40, 1, true), 0, COPING_Y / 2, 0)
    add(new THREE.TorusGeometry(radius - 0.16, 0.17, 8, 44), 0, COPING_Y, 0)
    parts[parts.length - 1].rotateX(Math.PI / 2)
    add(new THREE.CircleGeometry(radius - 0.1, 36), 0, 0.04, 0)
    parts[parts.length - 1].rotateX(-Math.PI / 2)

    // stepped plinth
    add(new THREE.CylinderGeometry(1.5, 1.7, 0.3, 28), 0, WATER_Y + 0.15, 0)
    add(new THREE.CylinderGeometry(1.15, 1.35, 0.28, 24), 0, WATER_Y + 0.42, 0)
    // column
    add(new THREE.CylinderGeometry(0.34, 0.46, 1.25, 16), 0, WATER_Y + 1.15, 0)
    // upper bowl — the piece that overflows
    add(new THREE.CylinderGeometry(1.42, 0.72, 0.16, 28), 0, WATER_Y + 1.8, 0)
    add(new THREE.TorusGeometry(1.4, 0.1, 8, 32), 0, WATER_Y + 1.88, 0)
    parts[parts.length - 1].rotateX(Math.PI / 2)
    // finial
    add(new THREE.CylinderGeometry(0.1, 0.22, 0.5, 12), 0, WATER_Y + 2.16, 0)
    add(new THREE.SphereGeometry(0.17, 14, 10), 0, WATER_Y + 2.48, 0)

    const stoneMesh = new THREE.Mesh(mergeSafe(parts), M(stone, { roughness: 0.82, metalness: 0.05 }))
    stoneMesh.castShadow = true
    stoneMesh.receiveShadow = true
    this.group.add(stoneMesh)

    // ---- lower pool ----
    this.pool = waterSurface({ radius: radius - 0.22, color: water })
    this.pool.position.y = WATER_Y
    this.group.add(this.pool)

    // ---- upper bowl water ----
    this.bowl = waterSurface({ radius: 1.3, segments: 28, color: water, opacity: 0.9 })
    this.bowl.position.y = WATER_Y + 1.9
    this.group.add(this.bowl)

    // ---- overflow curtain: the sheet falling from the bowl to the pool ----
    const curtainTex = streakTexture().clone()
    curtainTex.needsUpdate = true
    curtainTex.wrapS = curtainTex.wrapT = THREE.RepeatWrapping
    curtainTex.repeat.set(10, 1)
    this.curtainTex = curtainTex
    const curtain = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.46, 1.55, 30, 1, true),
      new THREE.MeshStandardMaterial({
        map: curtainTex,
        color: '#CFEAF6',
        transparent: true,
        opacity: 0.5,
        roughness: 0.15,
        metalness: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
    curtain.position.y = WATER_Y + 1.12
    this.group.add(curtain)

    // ---- jet columns (one instanced draw call) ----
    const jetTex = streakTexture().clone()
    jetTex.needsUpdate = true
    jetTex.wrapS = jetTex.wrapT = THREE.RepeatWrapping
    jetTex.repeat.set(1, 2)
    this.jetTex = jetTex
    const jetH = 2.5
    const jetGeo = new THREE.CylinderGeometry(0.035, 0.1, jetH, 7, 1, true)
    jetGeo.translate(0, jetH / 2, 0)
    this.jets = new THREE.InstancedMesh(
      jetGeo,
      new THREE.MeshStandardMaterial({
        map: jetTex,
        color: '#E4F6FF',
        transparent: true,
        opacity: 0.62,
        roughness: 0.1,
        metalness: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      jets
    )
    this.jetCount = jets
    this.jetRing = radius - 0.95
    this.jetBase = WATER_Y
    this.jetPhase = new Float32Array(jets)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < jets; i++) {
      const a = (i / jets) * Math.PI * 2
      this.jetPhase[i] = Math.random() * Math.PI * 2
      dummy.position.set(Math.cos(a) * this.jetRing, WATER_Y, Math.sin(a) * this.jetRing)
      dummy.updateMatrix()
      this.jets.setMatrixAt(i, dummy.matrix)
    }
    this.jets.instanceMatrix.needsUpdate = true
    this.jets.frustumCulled = false
    this.group.add(this.jets)
    this._dummy = dummy

    // ---- foam ring where the jets and the curtain hit the pool ----
    const foamMat = new THREE.MeshBasicMaterial({
      map: foamTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.foam = new THREE.Mesh(new THREE.RingGeometry(this.jetRing - 0.5, this.jetRing + 0.5, 36), foamMat)
    this.foam.rotation.x = -Math.PI / 2
    this.foam.position.y = WATER_Y + 0.012
    this.group.add(this.foam)

    const centreFoam = new THREE.Mesh(new THREE.CircleGeometry(1.6, 28), foamMat)
    centreFoam.rotation.x = -Math.PI / 2
    centreFoam.position.y = WATER_Y + 0.014
    this.group.add(centreFoam)

    // ---- spray ----
    this.spray = new Spray({ ringRadius: this.jetRing, jetHeight: jetH, waterY: WATER_Y })
    this.group.add(this.spray.points)

    // ---- underwater uplights: what makes it the centrepiece after dark ----
    this.uplights = []
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const l = new THREE.PointLight('#63D2FF', 9, 9, 2)
      l.position.set(Math.cos(a) * (radius * 0.55), WATER_Y + 0.25, Math.sin(a) * (radius * 0.55))
      this.group.add(l)
      this.uplights.push(l)
    }

    this.copingY = COPING_Y
    this.waterY = WATER_Y
  }

  addTo(world, { x = 0, z = 0 } = {}) {
    this.group.position.set(x, 0, z)
    world.scene.add(this.group)
    // Collider matches the basin, not a loose square: the coping is seat height,
    // so the player stops at the rim rather than clipping through the water.
    world.addCollider(x - this.radius, x + this.radius, z - this.radius, z + this.radius, this.copingY + 0.35)
    world.fountain = this
    this.origin = { x, z }
    return this
  }

  update(dt) {
    this.t += dt

    // two ripple layers travelling in different directions and speeds
    const a = this.pool.userData.scroll
    a.offset.x = this.t * 0.035
    a.offset.y = this.t * 0.022
    const b = this.bowl.userData.scroll
    b.offset.x = -this.t * 0.05
    b.offset.y = this.t * 0.03

    // falling water reads as falling because the streaks travel downward
    this.curtainTex.offset.y = -this.t * 1.35
    this.jetTex.offset.y = -this.t * 2.1

    // jets breathe — each on its own phase so the ring isn't in lockstep
    const d = this._dummy
    for (let i = 0; i < this.jetCount; i++) {
      const ang = (i / this.jetCount) * Math.PI * 2
      const s = 0.78 + Math.sin(this.t * 1.7 + this.jetPhase[i]) * 0.22
      d.position.set(Math.cos(ang) * this.jetRing, this.jetBase, Math.sin(ang) * this.jetRing)
      d.scale.set(1, s, 1)
      d.updateMatrix()
      this.jets.setMatrixAt(i, d.matrix)
    }
    this.jets.instanceMatrix.needsUpdate = true

    // foam pulses gently with the jets
    this.foam.material.opacity = 0.42 + Math.sin(this.t * 2.2) * 0.1

    this.spray.update(dt)

    for (let i = 0; i < this.uplights.length; i++) {
      this.uplights[i].intensity = 8 + Math.sin(this.t * 2.6 + i * 2.1) * 2.4
    }
  }
}
