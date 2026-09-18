import * as THREE from 'three'

// Procedural sky dome: gradient, sun with glow, drifting clouds and stars.
//
// A scene.background gradient texture (what v0.1 used) can never be *looked at*
// — it has no sun, no depth and no motion, so the world feels lidded. This is a
// real inside-out sphere with a shader gradient plus billboard clouds, so
// tilting the camera up gives you an actual sky.

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const SKY_FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

    // two-stop vertical gradient with a wider horizon band
    vec3 col = mix(uBottom, uMid, smoothstep(0.35, 0.52, h));
    col = mix(col, uTop, smoothstep(0.5, 0.92, h));

    // sun disc + falloff halo
    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, d);
    float halo = pow(d, 48.0) * 0.55 + pow(d, 8.0) * 0.18;
    col += uSunColor * (disc * 1.4 + halo);

    // subtle horizon haze so buildings sit in atmosphere instead of on a line
    col += vec3(0.06, 0.05, 0.08) * (1.0 - smoothstep(0.0, 0.28, abs(dir.y)));

    gl_FragColor = vec4(col, 1.0);
  }
`

export const SKY_PRESETS = {
  dusk: {
    top: '#241B52', mid: '#7C4A86', bottom: '#FF9E7D',
    sun: '#FFC98B', sunDir: [0.55, 0.10, -0.82], sunSize: 0.020,
    cloud: '#F0A6A0', cloudAlpha: 0.5, stars: 220, fog: '#B06A95',
  },
  day: {
    top: '#2E6FD6', mid: '#7FB6EE', bottom: '#D9EBF7',
    sun: '#FFF3D0', sunDir: [0.4, 0.42, -0.8], sunSize: 0.016,
    cloud: '#FFFFFF', cloudAlpha: 0.82, stars: 0, fog: '#BBD6EC',
  },
  night: {
    top: '#070B1E', mid: '#141C3C', bottom: '#2C2350',
    sun: '#9FB6FF', sunDir: [-0.4, 0.28, -0.7], sunSize: 0.012,
    cloud: '#3A3560', cloudAlpha: 0.42, stars: 700, fog: '#141433',
  },
}

// A whole cloud baked into ONE texture. Building clouds from clusters of 3–6
// sprites meant ~110 sprite draw calls just for the sky; a multi-blob texture
// gives the same shape for one call per cloud.
function cloudTexture(seed = 1) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S / 2
  const ctx = c.getContext('2d')
  let n = seed
  const rnd = () => ((n = (n * 16807) % 2147483647) / 2147483647)

  const puff = (cx, cy, r) => {
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const blobs = 5 + Math.floor(rnd() * 3)
  for (let i = 0; i < blobs; i++) {
    const t = (i + 0.5) / blobs
    puff(S * (0.16 + t * 0.68) + (rnd() - 0.5) * 24, S / 4 + (rnd() - 0.5) * 22, 26 + rnd() * 30)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

let sharedCloudTex = null

export class Sky {
  constructor(preset = 'dusk', { radius = 420 } = {}) {
    const p = typeof preset === 'string' ? SKY_PRESETS[preset] : preset
    this.preset = p
    this.group = new THREE.Group()
    this.clouds = []

    // ---- dome ----
    this.uniforms = {
      uTop: { value: new THREE.Color(p.top) },
      uMid: { value: new THREE.Color(p.mid) },
      uBottom: { value: new THREE.Color(p.bottom) },
      uSunDir: { value: new THREE.Vector3(...p.sunDir).normalize() },
      uSunColor: { value: new THREE.Color(p.sun) },
      uSunSize: { value: p.sunSize },
    }
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
// sky is background: never let it occlude world geometry
      toneMapped: true,
    })
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), domeMat)
    this.dome.renderOrder = -1000
    this.dome.frustumCulled = false
    this.group.add(this.dome)

    // ---- stars ----
    if (p.stars > 0) {
      const pos = new Float32Array(p.stars * 3)
      for (let i = 0; i < p.stars; i++) {
        // upper hemisphere only
        const u = Math.random()
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(u * 0.92 + 0.05)
        const r = radius * 0.94
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
        pos[i * 3 + 1] = r * Math.cos(phi)
        pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      this.stars = new THREE.Points(
        g,
        new THREE.PointsMaterial({ color: '#FFFFFF', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, depthWrite: false })
      )
      this.stars.renderOrder = -999
      this.stars.frustumCulled = false
      this.group.add(this.stars)
    }

    // ---- clouds: one sprite each, three shared textures for shape variety ----
    sharedCloudTex ??= [cloudTexture(7), cloudTexture(23), cloudTexture(101)]
    const cloudMats = sharedCloudTex.map(
      (map) => new THREE.SpriteMaterial({ map, color: p.cloud, transparent: true, opacity: p.cloudAlpha, depthWrite: false, fog: false })
    )
    for (let i = 0; i < 20; i++) {
      const s = new THREE.Sprite(cloudMats[i % cloudMats.length])
      const scale = 70 + Math.random() * 90
      s.scale.set(scale, scale * 0.5, 1)
      const a = Math.random() * Math.PI * 2
      const dist = 150 + Math.random() * 190
      s.position.set(Math.cos(a) * dist, 60 + Math.random() * 90, Math.sin(a) * dist)
      s.renderOrder = -998
      this.clouds.push({ obj: s, speed: 0.7 + Math.random() * 1.6 })
      this.group.add(s)
    }
  }

  // Where the sun is *drawn*.
  sunPosition(distance = 60) {
    return this.uniforms.uSunDir.value.clone().multiplyScalar(distance)
  }

  // Where the key light should sit. Deliberately NOT the same vector: a dusk sun
  // is near the horizon by design, and a directional light at that elevation
  // rakes the ground and leaves the scene almost unlit. Keep the azimuth so
  // shadows agree with the visible sun, but lift the elevation to a usable one.
  keyLightPosition(distance = 70, minElevation = 0.62) {
    const d = this.uniforms.uSunDir.value.clone()
    d.y = Math.max(d.y, minElevation)
    return d.normalize().multiplyScalar(distance)
  }

  addTo(world) {
    world.scene.add(this.group)
    world.sky = this
    return this
  }

  update(dt, cameraPos) {
    // keep the dome centred on the viewer so it never clips
    if (cameraPos) this.group.position.set(cameraPos.x, 0, cameraPos.z)
    for (const c of this.clouds) {
      c.obj.position.x += c.speed * dt
      if (c.obj.position.x > 360) c.obj.position.x = -360
    }
  }
}
