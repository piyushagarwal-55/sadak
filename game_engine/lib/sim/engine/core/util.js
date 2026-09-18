import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// mergeGeometries requires every input to be uniformly indexed (or not). Mixing
// RoundedBoxGeometry (non-indexed) with Box/Cylinder/Extrude (indexed) throws;
// normalize to non-indexed first (preserves position/normal/uv).
export function mergeSafe(parts) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false)
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t

export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

// Deterministic RNG so world generation is reproducible per seed.
export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Push a circle (x,z,r) out of axis-aligned boxes. Returns corrected [x,z].
export function collideCircle(x, z, r, boxes) {
  for (const b of boxes) {
    const nx = clamp(x, b.minX, b.maxX)
    const nz = clamp(z, b.minZ, b.maxZ)
    let dx = x - nx
    let dz = z - nz
    const d2 = dx * dx + dz * dz
    if (d2 < r * r) {
      if (d2 === 0) {
        // center is inside the box — push out through the nearest face
        const left = x - b.minX, right = b.maxX - x, top = z - b.minZ, bot = b.maxZ - z
        const m = Math.min(left, right, top, bot)
        if (m === left) x = b.minX - r
        else if (m === right) x = b.maxX + r
        else if (m === top) z = b.minZ - r
        else z = b.maxZ + r
      } else {
        const d = Math.sqrt(d2)
        x = nx + (dx / d) * r
        z = nz + (dz / d) * r
      }
    }
  }
  return [x, z]
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function makeCanvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

// Floating name tag rendered to a sprite (always faces camera, visible through walls).
export function textSprite(text, { fontSize = 46, color = '#ffffff', bg = 'rgba(10,15,30,0.72)' } = {}) {
  const pad = 22
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = `600 ${fontSize}px ui-sans-serif, system-ui`
  const tw = Math.ceil(measure.measureText(text).width)

  const tex = makeCanvasTexture(tw + pad * 2, fontSize + pad * 2, (ctx, w, h) => {
    ctx.fillStyle = bg
    roundRect(ctx, 1, 1, w - 2, h - 2, 20)
    ctx.fill()
    ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, w / 2, h / 2 + 2)
  })
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  const H = 0.42
  sp.scale.set((H * tex.image.width) / tex.image.height, H, 1)
  sp.renderOrder = 50
  return sp
}

export function gradientTexture(top, bottom) {
  const tex = makeCanvasTexture(16, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  })
  return tex
}

export function checkerTexture(c1, c2, n = 8) {
  const size = 256
  const tex = makeCanvasTexture(size, size, (ctx) => {
    const s = size / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? c1 : c2
        ctx.fillRect(i * s, j * s, s, s)
      }
  })
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

// ---------- procedural PBR ----------
// Derive a tangent-space normal map from a canvas's luminance via a Sobel pass.
// This is what stops procedural surfaces reading as flat paint: the base colour
// alone has no light response, but a normal map gives every speckle and grain
// an actual highlight. Costs nothing on the network — it's generated at runtime.
export function normalMapFromCanvas(canvas, strength = 1.4) {
  const w = canvas.width
  const h = canvas.height
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data

  // luminance lookup with edge clamping
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255
  }
  const at = (x, y) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  const img = ctx.createImageData(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel gradients
      const gx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const gy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))

      // normalise (gx, gy, 1/strength) into 0..255 RGB
      let nx = gx * strength
      let ny = gy * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz) || 1
      nx /= len
      ny /= len
      nz /= len

      const i = (y * w + x) * 4
      img.data[i] = (nx * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(out)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  // normal maps are data, not colour — must stay linear
  tex.colorSpace = THREE.NoColorSpace
  return tex
}

// Build a matched {map, roughnessMap, normalMap} set from one canvas draw.
// `draw(ctx, w, h)` paints albedo; `rough(ctx, w, h)` optionally paints a
// greyscale roughness pass (white = rough). The normal map is derived from the
// albedo luminance, which is a good-enough approximation for these surfaces.
export function pbrCanvas(size, draw, { rough = null, normalStrength = 1.4, repeat = 1 } = {}) {
  const albedo = document.createElement('canvas')
  albedo.width = albedo.height = size
  draw(albedo.getContext('2d'), size, size)

  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 4

  const normalMap = normalMapFromCanvas(albedo, normalStrength)

  let roughnessMap = null
  if (rough) {
    const rc = document.createElement('canvas')
    rc.width = rc.height = size
    rough(rc.getContext('2d'), size, size)
    roughnessMap = new THREE.CanvasTexture(rc)
    roughnessMap.colorSpace = THREE.NoColorSpace
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping
  }

  if (repeat !== 1) {
    for (const t of [map, normalMap, roughnessMap]) if (t) t.repeat.setScalar(repeat)
  }
  return { map, roughnessMap, normalMap }
}

// Uniformly scale an object so its largest dimension equals target, feet on y=0.
export function normalizeToSize(obj, target) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const s = target / Math.max(size.x, size.y, size.z, 0.0001)
  obj.scale.setScalar(s)
  const box2 = new THREE.Box3().setFromObject(obj)
  obj.position.y -= box2.min.y
  return obj
}
