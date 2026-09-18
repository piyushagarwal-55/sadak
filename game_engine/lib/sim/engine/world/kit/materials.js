import * as THREE from 'three'
import { PALETTE } from '../../core/design.js'
import { pbrCanvas } from '../../core/util.js'

// Cached PBR material factory. Every material in new content comes from here so
// that (a) the look stays consistent and (b) repeated fixtures share one
// material instance — the draw-call budget in the PRD depends on it.
//
// Metals and glass only read correctly once scene.environment is set; see
// core/Renderer.js. Without IBL these fall back to looking like flat plastic.
// See docs/PRD-v0.2-sole-flagship.md §1.5.

const cache = new Map()
const S = PALETTE.sole

function make(key, build) {
  let m = cache.get(key)
  if (!m) {
    m = build()
    m.name = key
    cache.set(key, m)
  }
  return m
}

// ---------- procedural surface art ----------

// Terrazzo: aggregate chips scattered on a pale binder. The roughness pass
// makes the chips slightly glossier than the binder, which is what sells it.
function terrazzoMaps() {
  const chips = [S.walnut, '#8C8378', '#B9AFA0', S.accent, '#6E6558']
  const draw = (ctx, w, h) => {
    ctx.fillStyle = S.stone
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const r = 1.5 + Math.random() * 5
      ctx.fillStyle = chips[(Math.random() * chips.length) | 0]
      ctx.globalAlpha = 0.35 + Math.random() * 0.5
      ctx.beginPath()
      ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  const rough = (ctx, w, h) => {
    ctx.fillStyle = '#b4b4b4' // binder — fairly rough
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = '#6a6a6a' // chips — polished
      ctx.globalAlpha = 0.5
      const r = 1.5 + Math.random() * 5
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, r, r, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }
  return pbrCanvas(512, draw, { rough, normalStrength: 0.9 })
}

// Micro-cement: broad soft mottling, no hard features.
function cementMaps(base) {
  const draw = (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 260; i++) {
      const r = 20 + Math.random() * 90
      const g = ctx.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, r)
      g.addColorStop(0, `rgba(0,0,0,${0.012 + Math.random() * 0.03})`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }
  }
  return pbrCanvas(256, draw, { normalStrength: 0.5 })
}

// Walnut: directional grain lines with occasional darker figure.
function walnutMaps() {
  const draw = (ctx, w, h) => {
    ctx.fillStyle = S.walnut
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 150; i++) {
      const y = Math.random() * h
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,20,12' : '110,86,60'},${0.1 + Math.random() * 0.3})`
      ctx.lineWidth = 0.6 + Math.random() * 2.4
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + i) * 3)
      ctx.stroke()
    }
  }
  return pbrCanvas(512, draw, { normalStrength: 0.8 })
}

// Brushed metal: fine horizontal striations. Anisotropy is faked by the normal
// map direction rather than a true anisotropic BRDF.
function brushedMaps(base) {
  const draw = (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * h
      ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.07})`
      ctx.lineWidth = Math.random() * 1.2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y + (Math.random() - 0.5))
      ctx.stroke()
    }
  }
  return pbrCanvas(512, draw, { normalStrength: 0.35 })
}

// Knit: a woven crosshatch for shoe uppers.
function knitMaps(base) {
  const draw = (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    const step = 8
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        ctx.fillStyle = ((x / step + y / step) | 0) % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'
        ctx.fillRect(x, y, step * 0.7, step * 0.7)
      }
    }
  }
  return pbrCanvas(128, draw, { normalStrength: 1.8 })
}

// ---------- public factory ----------

export const MATERIAL = {
  terrazzo: (repeat = 6) =>
    make(`terrazzo:${repeat}`, () => {
      const { map, roughnessMap, normalMap } = terrazzoMaps()
      for (const t of [map, roughnessMap, normalMap]) if (t) t.repeat.setScalar(repeat)
      return new THREE.MeshStandardMaterial({
        map, roughnessMap, normalMap,
        roughness: 0.55, metalness: 0.02,
        normalScale: new THREE.Vector2(0.35, 0.35),
      })
    }),

  microCement: (color = S.plaster, repeat = 3) =>
    make(`cement:${color}:${repeat}`, () => {
      const { map, normalMap } = cementMaps(color)
      for (const t of [map, normalMap]) t.repeat.setScalar(repeat)
      return new THREE.MeshStandardMaterial({
        map, normalMap, roughness: 0.92, metalness: 0,
        normalScale: new THREE.Vector2(0.25, 0.25),
      })
    }),

  walnut: (repeat = 2) =>
    make(`walnut:${repeat}`, () => {
      const { map, normalMap } = walnutMaps()
      for (const t of [map, normalMap]) t.repeat.setScalar(repeat)
      return new THREE.MeshStandardMaterial({
        map, normalMap, roughness: 0.45, metalness: 0.04,
        normalScale: new THREE.Vector2(0.4, 0.4),
      })
    }),

  brushedBrass: () =>
    make('brass', () => {
      const { map, normalMap } = brushedMaps(S.brass)
      return new THREE.MeshStandardMaterial({
        map, normalMap, color: 0xffffff,
        metalness: 0.95, roughness: 0.28,
        normalScale: new THREE.Vector2(0.15, 0.15),
      })
    }),

  chrome: () =>
    make('chrome', () => new THREE.MeshStandardMaterial({ color: S.chrome, metalness: 1, roughness: 0.08 })),

  glassPanel: () =>
    make('glass', () =>
      new THREE.MeshPhysicalMaterial({
        color: S.glass,
        transmission: 0.95,
        thickness: 0.4,
        roughness: 0.05,
        ior: 1.5,
        metalness: 0,
        transparent: true,
        side: THREE.DoubleSide,
      })
    ),

  matteRubber: (color = '#1A1A1A') =>
    make(`rubber:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 })),

  knitFabric: (color = '#DCD5CC') =>
    make(`knit:${color}`, () => {
      const { map, normalMap } = knitMaps(color)
      for (const t of [map, normalMap]) t.repeat.setScalar(4)
      return new THREE.MeshStandardMaterial({
        map, normalMap, roughness: 0.88, metalness: 0,
        normalScale: new THREE.Vector2(0.6, 0.6),
      })
    }),

  // Emissive-looking strip. MeshBasicMaterial ignores lighting, so it stays hot
  // enough to trip the bloom threshold — that's what makes signage glow.
  ledStrip: (color = '#FFE9C4') =>
    make(`led:${color}`, () => new THREE.MeshBasicMaterial({ color, toneMapped: false })),

  // Painted architectural surfaces where full PBR maps would be overkill.
  paint: (color, roughness = 0.8) =>
    make(`paint:${color}:${roughness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 })),
}

export function disposeMaterialCache() {
  for (const m of cache.values()) {
    for (const k of ['map', 'roughnessMap', 'normalMap']) m[k]?.dispose?.()
    m.dispose()
  }
  cache.clear()
}

export const materialCacheSize = () => cache.size
