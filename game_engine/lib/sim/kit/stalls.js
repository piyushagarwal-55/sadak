import * as THREE from 'three'
import {
  bakedBox,
  bakedCone,
  bakedCyl,
  bakedSphere,
  mergeByMaterial,
  stdMat,
} from '@/lib/game/assets/shared'
import { mulberry32 } from '@/lib/game/props'

/**
 * MANDI STALLS — the bazaar kit.
 *
 * A market is not a row of shopfronts. It is heaps of goods on trestles and
 * handcarts under blue tarpaulin, with the buildings behind reduced to a
 * backdrop of paint and signboards. The first lane got this backwards: it gave
 * every bay lit glass, which is the vocabulary of a shopping centre, and the
 * result read as a mall with no doors.
 *
 * So the rule for everything in this file: the GOODS are the object. A stall is
 * a trestle, a tarp and a pile of something — and the pile is what the eye
 * lands on. Colour comes from produce and cloth, never from the structure.
 *
 * Built in the shipped game's idiom: a flat list of `baked*` primitives with
 * their transforms baked in, tagged by material, merged at the end. A stall
 * with sixty conceptual parts costs three or four draw calls.
 *
 * Local axes: +Z faces the customer, origin on the ground at the stall's centre.
 */

const P = (geo, mat) => ({ geo, mat })

const BAMBOO = 0xb08d52
const TRESTLE = 0x7a5230
const TARP_BLUE = 0x2f6fb5
const TARP_GREEN = 0x1f7a4a
const JUTE = 0xc4a574
const CRATE = 0x9a7442

/** Produce colours. Deliberately saturated: this is where the street gets its life. */
const VEG = [0x3f8f3a, 0xd94f3d, 0xe89b1f, 0x7a4f9e, 0xe4d04a, 0xa8c74a, 0xc23b22]
const FRUIT = [0xf2a03c, 0xe4c441, 0xd94f3d, 0x8fbf3f, 0xf7d060]
const CLOTH = [0xd93f6f, 0x2f6fb5, 0xe4b429, 0x2f9e5f, 0x7a3fb5, 0xe8612f, 0xf0f0f0]
const SPICE = [0xc2410c, 0xd9a521, 0x8a3324, 0x6b8f2a, 0xa6501e, 0xe0b040]
/** Marigold, rose and jasmine — a flower pitch is only ever these three. */
const FLOWER = [0xf0a01c, 0xe2620f, 0xd93f5f, 0xf2e8d0, 0xe8c21a]
/** The plastic a floor vendor spreads out: cheap, bright, always faded. */
const SHEET = [0x2f6fb5, 0x1f7a4a, 0xb03a5e, 0x8a6fb5]

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/** Trestle table: plank top on crossed legs. Every produce stall sits on one. */
function trestle(parts, mat, w, d, h = 0.85) {
  parts.push(P(bakedBox(w, 0.07, d, 0, h, 0), mat))
  parts.push(P(bakedBox(w + 0.1, 0.05, 0.08, 0, h - 0.09, d / 2 - 0.05), mat))
  for (const sx of [-1, 1]) {
    parts.push(P(bakedBox(0.07, h, 0.07, sx * (w / 2 - 0.15), h / 2, -d / 2 + 0.12), mat))
    parts.push(P(bakedBox(0.07, h, 0.07, sx * (w / 2 - 0.15), h / 2, d / 2 - 0.12), mat))
    parts.push(P(bakedBox(0.05, 0.05, d - 0.2, sx * (w / 2 - 0.15), h * 0.35, 0), mat))
  }
}

/**
 * A mound of produce. Spheres in a heap, packed tightest at the middle.
 *
 * This is the single most important shape in the bazaar: from two metres it
 * reads as tomatoes, and no amount of box-modelling a crate does the same job.
 */
function heap(parts, mat, cx, cy, cz, radius, count, size, rand) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * radius
    const lift = (1 - r / radius) * radius * 0.55
    parts.push(
      P(
        bakedSphere(size * (0.82 + rand() * 0.36), cx + Math.cos(a) * r, cy + lift + size * 0.5, cz + Math.sin(a) * r, {
          wSeg: 6,
          hSeg: 4,
        }),
        mat
      )
    )
  }
}

/** Sagging tarpaulin on bamboo, the thing that makes a lane read as covered. */
function tarpRoof(parts, tarpMat, poleMat, w, d, h = 2.5, colourSeed = 0) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push(P(bakedCyl(0.045, 0.055, h, 6, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1)), poleMat))
  }
  parts.push(P(bakedCyl(0.03, 0.03, w, 5, 0, h + 0.02, 0, 0, Math.PI / 2), poleMat))
  // Two panels tilted off a ridge, so it sags instead of reading as a lid.
  parts.push(P(bakedBox(w + 0.5, 0.035, d / 2 + 0.35, 0, h - 0.06, -d / 4, 0.16 + colourSeed * 0.02, 0, 0), tarpMat))
  parts.push(P(bakedBox(w + 0.5, 0.035, d / 2 + 0.35, 0, h - 0.06, d / 4, -0.16, 0, 0), tarpMat))
}

/** Stacked wooden crates: frames with air in them, not solid blocks. */
function crateStack(parts, mat, x, z, n, rand) {
  for (let i = 0; i < n; i++) {
    const y = 0.16 + i * 0.31
    const skew = (rand() - 0.5) * 0.25
    parts.push(P(bakedBox(0.68, 0.04, 0.48, x + skew * 0.2, y - 0.14, z, 0, skew, 0), mat))
    parts.push(P(bakedBox(0.04, 0.3, 0.48, x + skew * 0.2 - 0.32, y, z, 0, skew, 0), mat))
    parts.push(P(bakedBox(0.04, 0.3, 0.48, x + skew * 0.2 + 0.32, y, z, 0, skew, 0), mat))
    parts.push(P(bakedBox(0.68, 0.055, 0.04, x + skew * 0.2, y + 0.11, z - 0.22, 0, skew, 0), mat))
    parts.push(P(bakedBox(0.68, 0.055, 0.04, x + skew * 0.2, y + 0.11, z + 0.22, 0, skew, 0), mat))
  }
}

/* ------------------------------------------------------------------ *
 * The stalls
 * ------------------------------------------------------------------ */

/** Vegetables on a trestle under a blue tarp, with crates stacked behind. */
export function vegStall({ seed = 1, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(TARP_BLUE, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const crate = stdMat(CRATE, { roughness: 0.95 }, mats)
  const parts = []

  trestle(parts, wood, 2.6, 1.2)
  tarpRoof(parts, tarp, bamboo, 3.0, 1.9, 2.45)

  // Six heaps across the table, each a different vegetable.
  for (let i = 0; i < 6; i++) {
    const mat = stdMat(VEG[i % VEG.length], { roughness: 0.78 }, mats)
    heap(parts, mat, -1.0 + i * 0.4, 0.89, (i % 2 ? -0.22 : 0.2), 0.19, 11, 0.062, rand)
  }
  // Loose stock in crates on the ground.
  crateStack(parts, crate, -1.1, -0.75, 2, rand)
  crateStack(parts, crate, 0.9, -0.8, 3, rand)
  // A hanging scale off the frame.
  const steel = stdMat(0xb9bec3, { roughness: 0.35, metalness: 0.7 }, mats)
  parts.push(P(bakedCyl(0.008, 0.008, 0.45, 4, 1.25, 1.95, 0.1), steel))
  parts.push(P(bakedCyl(0.17, 0.14, 0.03, 12, 1.25, 1.72, 0.1), steel))

  return mergeByMaterial(parts)
}

/** Fruit: pyramids rather than heaps, plus bananas hanging off the frame. */
export function fruitStall({ seed = 2, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(TARP_GREEN, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const parts = []

  trestle(parts, wood, 2.6, 1.2)
  tarpRoof(parts, tarp, bamboo, 3.0, 1.9, 2.45, 1)

  // Stacked pyramids: fruit is sold built up, not tipped out.
  for (let i = 0; i < 4; i++) {
    const mat = stdMat(FRUIT[i % FRUIT.length], { roughness: 0.66 }, mats)
    const cx = -0.95 + i * 0.63
    for (let layer = 0; layer < 3; layer++) {
      const n = 6 - layer * 2
      const r = 0.2 - layer * 0.06
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2
        parts.push(
          P(bakedSphere(0.068, cx + Math.cos(a) * r, 0.94 + layer * 0.11, Math.sin(a) * r, { wSeg: 6, hSeg: 5 }), mat)
        )
      }
    }
    parts.push(P(bakedSphere(0.07, cx, 0.94 + 3 * 0.11, 0, { wSeg: 6, hSeg: 5 }), mat))
  }

  // Banana hands on the crossbar.
  const banana = stdMat(0xe8c93c, { roughness: 0.6 }, mats)
  for (let i = 0; i < 4; i++) {
    const x = -1.0 + i * 0.66
    for (let k = 0; k < 5; k++) {
      parts.push(
        P(bakedBox(0.05, 0.3, 0.05, x + (k - 2) * 0.035, 2.1, -0.55, 0.22 + rand() * 0.1, 0, (k - 2) * 0.12), banana)
      )
    }
  }
  return mergeByMaterial(parts)
}

/** Open sacks with cones of spice heaped above the rim. */
export function spiceStall({ seed = 3, mats } = {}) {
  const rand = mulberry32(seed)
  const jute = stdMat(JUTE, { roughness: 1 }, mats)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0xc9a227, { roughness: 0.9, side: THREE.DoubleSide }, mats)
  const parts = []

  trestle(parts, wood, 2.4, 1.0, 0.55)
  tarpRoof(parts, tarp, bamboo, 2.9, 1.8, 2.4, 2)

  for (let i = 0; i < 6; i++) {
    const x = -1.0 + i * 0.4
    const mat = stdMat(SPICE[i % SPICE.length], { roughness: 0.96 }, mats)
    parts.push(P(bakedCyl(0.17, 0.2, 0.34, 9, x, 0.73, 0), jute))
    parts.push(P(bakedCyl(0.19, 0.17, 0.08, 9, x, 0.93, 0), jute))
    parts.push(P(bakedCone(0.16, 0.2 + rand() * 0.07, 9, x, 1.06, 0), mat))
    parts.push(P(bakedCyl(0.16, 0.16, 0.03, 9, x, 0.97, 0), mat))
  }
  // Floor sacks, slumped.
  for (let i = 0; i < 3; i++) {
    parts.push(P(bakedCyl(0.24, 0.28, 0.5, 9, -0.9 + i * 0.85, 0.25, -0.75, 0.06 * (rand() - 0.5), 0), jute))
  }
  return mergeByMaterial(parts)
}

/** Cloth: bolts hanging off a rail, folded stacks on the counter. */
export function clothStall({ seed = 4, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.9 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const parts = []

  trestle(parts, wood, 2.6, 1.1, 0.8)
  for (const sx of [-1, 1]) {
    parts.push(P(bakedCyl(0.05, 0.055, 2.7, 6, sx * 1.3, 1.35, -0.5), bamboo))
  }
  parts.push(P(bakedCyl(0.035, 0.035, 2.6, 5, 0, 2.6, -0.5, 0, Math.PI / 2), bamboo))

  // Hanging bolts — the wall of colour is the whole read.
  for (let i = 0; i < 9; i++) {
    const mat = stdMat(CLOTH[i % CLOTH.length], { roughness: 0.96 }, mats)
    const len = 1.25 + rand() * 0.55
    parts.push(P(bakedBox(0.27, len, 0.06, -1.1 + i * 0.275, 2.55 - len / 2, -0.5), mat))
  }
  // Folded stacks.
  for (let i = 0; i < 5; i++) {
    const mat = stdMat(CLOTH[(i + 3) % CLOTH.length], { roughness: 0.96 }, mats)
    for (let k = 0; k < 3; k++) {
      parts.push(P(bakedBox(0.44, 0.07, 0.34, -0.9 + i * 0.46, 0.87 + k * 0.075, 0.12, 0, (rand() - 0.5) * 0.12, 0), mat))
    }
  }
  return mergeByMaterial(parts)
}

/** Bangles on vertical rods, with a small mirror. Glass catches the festoon. */
export function bangleStall({ seed = 5, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(0x6b4a2e, { roughness: 0.9 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0xd93f6f, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const velvet = stdMat(0x5a1030, { roughness: 0.98 }, mats)
  const parts = []

  trestle(parts, wood, 2.2, 0.95, 0.85)
  tarpRoof(parts, tarp, bamboo, 2.7, 1.7, 2.4, 3)
  parts.push(P(bakedBox(2.1, 0.02, 0.85, 0, 0.9, 0), velvet))

  // Rods of stacked bangles. Torus would be truer but forty of them is not
  // worth the triangles; short cylinders read the same at arm's length.
  const glassTones = [0xe83f6f, 0x2f9ed9, 0xe4c441, 0x2f9e5f, 0x9b59d0, 0xf07a2f]
  for (let i = 0; i < 8; i++) {
    const x = -0.9 + i * 0.26
    const mat = stdMat(glassTones[i % glassTones.length], {
      roughness: 0.15,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
    }, mats)
    parts.push(P(bakedCyl(0.015, 0.015, 0.42, 5, x, 1.1, -0.1), bamboo))
    const n = 7 + Math.floor(rand() * 4)
    for (let k = 0; k < n; k++) {
      parts.push(P(bakedCyl(0.065, 0.065, 0.028, 10, x, 0.93 + k * 0.032, -0.1), mat))
    }
  }
  const mirror = stdMat(0xdfe9ee, { roughness: 0.08, metalness: 0.6 }, mats)
  parts.push(P(bakedBox(0.34, 0.46, 0.03, 0.95, 1.35, -0.42), wood))
  parts.push(P(bakedBox(0.28, 0.4, 0.01, 0.95, 1.35, -0.4), mirror))
  return mergeByMaterial(parts)
}

/** Chai tapri: kettle on a burner, glasses in rows, stools out front. */
export function chaiTapri({ seed = 6, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(0x7a5230, { roughness: 0.9 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0xd9483b, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const steel = stdMat(0xc0c5c9, { roughness: 0.3, metalness: 0.82 }, mats)
  const glassy = stdMat(0xd9e7ef, { roughness: 0.2, transparent: true, opacity: 0.75 }, mats)
  const stove = stdMat(0x3a3a3a, { roughness: 0.85 }, mats)
  const flame = stdMat(0xff7a2f, { emissive: 0xff5a1f, emissiveIntensity: 0.95 }, mats)
  const parts = []

  parts.push(P(bakedBox(1.9, 0.95, 0.85, 0, 0.48, 0), wood))
  parts.push(P(bakedBox(2.0, 0.07, 0.95, 0, 0.99, 0), wood))
  tarpRoof(parts, tarp, bamboo, 2.4, 1.7, 2.35, 4)

  parts.push(P(bakedBox(0.42, 0.3, 0.4, -0.6, 1.17, -0.05), stove))
  parts.push(P(bakedCyl(0.11, 0.11, 0.03, 10, -0.6, 1.33, -0.05), flame))
  parts.push(P(bakedCyl(0.17, 0.2, 0.3, 10, -0.6, 1.5, -0.05), steel))
  parts.push(P(bakedCyl(0.07, 0.07, 0.09, 8, -0.6, 1.69, -0.05), steel))
  parts.push(P(bakedBox(0.1, 0.03, 0.1, -0.35, 1.55, -0.05, 0, 0, 0.5), steel))

  for (let i = 0; i < 10; i++) {
    parts.push(
      P(bakedCyl(0.036, 0.028, 0.1, 7, 0.05 + (i % 5) * 0.13, 1.08, 0.2 - Math.floor(i / 5) * 0.2), glassy)
    )
  }
  // Biscuit jars, tilted a little so the row is not machine-perfect.
  for (let i = 0; i < 3; i++) {
    parts.push(P(bakedCyl(0.1, 0.11, 0.28, 8, 0.45 + i * 0.25, 1.17, -0.3, 0, (rand() - 0.5) * 0.1), glassy))
  }
  // Two stools where people actually stand and drink.
  for (const [x, z] of [[-1.5, 1.2], [1.4, 1.35]]) {
    parts.push(P(bakedCyl(0.17, 0.17, 0.05, 10, x, 0.42, z), stove))
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      parts.push(P(bakedCyl(0.02, 0.025, 0.42, 5, x + Math.cos(a) * 0.12, 0.21, z + Math.sin(a) * 0.12), steel))
    }
  }
  return mergeByMaterial(parts)
}

/** Plastic goods: buckets, mugs, brooms. The cheap-and-cheerful corner. */
export function plasticStall({ seed = 7, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0x2f6fb5, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const tones = [0xe4402f, 0x2f9ed9, 0xe4c441, 0x2f9e5f, 0xe8612f, 0xf0f0f0]
  const parts = []

  trestle(parts, wood, 2.4, 1.1)
  tarpRoof(parts, tarp, bamboo, 2.9, 1.8, 2.45, 5)

  // Nested bucket stacks on the table.
  for (let i = 0; i < 5; i++) {
    const mat = stdMat(tones[i % tones.length], { roughness: 0.55 }, mats)
    const n = 2 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      parts.push(P(bakedCyl(0.14, 0.11, 0.22, 10, -0.9 + i * 0.45, 0.96 + k * 0.1, -0.05), mat))
    }
  }
  // Mugs hanging off the frame.
  for (let i = 0; i < 6; i++) {
    const mat = stdMat(tones[(i + 2) % tones.length], { roughness: 0.55 }, mats)
    parts.push(P(bakedCyl(0.055, 0.05, 0.11, 8, -0.8 + i * 0.32, 1.95, -0.5), mat))
  }
  // Brooms leaning at the end.
  const straw = stdMat(0xc9a86a, { roughness: 1 }, mats)
  for (let i = 0; i < 3; i++) {
    parts.push(P(bakedCyl(0.02, 0.02, 1.3, 5, 1.15 + i * 0.1, 0.65, 0.35, 0.16, 0.06), bamboo))
    parts.push(P(bakedCone(0.11, 0.42, 6, 1.2 + i * 0.1, 0.22, 0.45, Math.PI + 0.16, 0.06), straw))
  }
  return mergeByMaterial(parts)
}

/** Loaded handcart — the thela that is always parked mid-lane. */
export function handcart({ seed = 8, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const iron = stdMat(0x3a3a3a, { roughness: 0.9 }, mats)
  const jute = stdMat(JUTE, { roughness: 1 }, mats)
  const parts = [
    P(bakedBox(1.9, 0.09, 1.0, 0, 0.62, 0), wood),
    P(bakedBox(1.9, 0.22, 0.08, 0, 0.75, -0.5), wood),
    P(bakedCyl(0.34, 0.34, 0.08, 12, -0.72, 0.34, 0.5, 0, Math.PI / 2), iron),
    P(bakedCyl(0.34, 0.34, 0.08, 12, 0.72, 0.34, 0.5, 0, Math.PI / 2), iron),
    P(bakedCyl(0.045, 0.045, 1.25, 6, 0, 0.78, 0.95, 0.42, 0), wood),
  ]
  for (let i = 0; i < 4; i++) {
    parts.push(P(bakedBox(0.55 + rand() * 0.2, 0.3, 0.5, -0.55 + i * 0.38, 0.82 + (i % 2) * 0.28, (rand() - 0.5) * 0.2), jute))
  }
  return mergeByMaterial(parts)
}

/**
 * Marigold. The one pitch whose entire job is colour.
 *
 * Garlands hang in a curtain at the front, loose flowers sit in flat cane
 * baskets, and the trimmings go on the ground — no flower seller in India has a
 * clean pitch, and the mess is half of what makes it recognisable.
 */
export function flowerStall({ seed = 11, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(TARP_GREEN, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const cane = stdMat(0xc9a86a, { roughness: 1 }, mats)
  const parts = []

  trestle(parts, wood, 2.5, 1.1)
  tarpRoof(parts, tarp, bamboo, 2.9, 1.8, 2.4, 1)

  // Flat cane baskets of loose flowers, which is how they are actually sold.
  for (let i = 0; i < 4; i++) {
    const cx = -0.95 + i * 0.63
    parts.push(P(bakedCyl(0.3, 0.24, 0.12, 12, cx, 0.94, 0.05), cane))
    const petal = stdMat(FLOWER[i % FLOWER.length], { roughness: 0.75 }, mats)
    heap(parts, petal, cx, 0.99, 0.05, 0.24, 14, 0.045, rand)
  }

  // Garlands: strings of beads off the front rail, at uneven lengths.
  for (let i = 0; i < 9; i++) {
    const mat = stdMat(FLOWER[i % FLOWER.length], { roughness: 0.75 }, mats)
    const x = -1.1 + i * 0.27
    const beads = 6 + Math.floor(rand() * 6)
    for (let b = 0; b < beads; b++) {
      parts.push(P(bakedSphere(0.042, x, 2.1 - b * 0.09, 0.82, { wSeg: 5, hSeg: 3 }), mat))
    }
  }

  // Trimmings underfoot.
  for (let i = 0; i < 18; i++) {
    const mat = stdMat(FLOWER[i % FLOWER.length], { roughness: 0.8 }, mats)
    parts.push(
      P(bakedSphere(0.03, (rand() - 0.5) * 2.6, 0.015, 0.5 + rand() * 0.9, { wSeg: 4, hSeg: 3 }), mat)
    )
  }
  return mergeByMaterial(parts)
}

/**
 * Steel vessels, nested and stacked.
 *
 * Structurally it is a wall of cylinders, and the reason it works anyway is the
 * specular: polished steel is the only cold thing in a street of cloth and
 * produce, so the pitch reads from the far end of the gali.
 */
export function potStall({ seed = 12, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0x8a8f96, { roughness: 0.85, side: THREE.DoubleSide }, mats)
  const steel = stdMat(0xc3c9cf, { roughness: 0.22, metalness: 0.85 }, mats)
  const brass = stdMat(0xc9973f, { roughness: 0.3, metalness: 0.8 }, mats)
  const parts = []

  trestle(parts, wood, 2.7, 1.2)
  tarpRoof(parts, tarp, bamboo, 3.0, 1.9, 2.45, 2)

  // Graduated stacks, widest at the bottom, so they read as nesting.
  for (let i = 0; i < 5; i++) {
    const x = -1.05 + i * 0.52
    const n = 2 + Math.floor(rand() * 3)
    let y = 0.89
    for (let k = 0; k < n; k++) {
      const r = 0.2 - k * 0.028
      const h = 0.16 - k * 0.015
      parts.push(P(bakedCyl(r, r * 0.86, h, 12, x, y + h / 2, 0), k === n - 1 && i % 2 ? brass : steel))
      y += h
    }
  }
  // Buckets under the table and a milk can at the end.
  for (let i = 0; i < 4; i++) {
    parts.push(P(bakedCyl(0.17, 0.14, 0.3, 10, -1.1 + i * 0.6, 0.15, -0.72), steel))
  }
  parts.push(P(bakedCyl(0.21, 0.23, 0.62, 12, 1.3, 0.31, 0.55), steel))
  parts.push(P(bakedCyl(0.12, 0.12, 0.06, 12, 1.3, 0.65, 0.55), brass))
  return mergeByMaterial(parts)
}

/**
 * Coconuts. The stock is a heap on the floor, which is a silhouette nothing
 * else in the kit has — every other pitch puts its goods at waist height.
 */
export function coconutStall({ seed = 13, mats } = {}) {
  const rand = mulberry32(seed)
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const husk = stdMat(0x8a6a3a, { roughness: 1 }, mats)
  const green = stdMat(0x6f8f3a, { roughness: 0.85 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0xd9a521, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const parts = []

  tarpRoof(parts, tarp, bamboo, 2.6, 1.8, 2.35, 3)
  trestle(parts, wood, 1.8, 0.9, 0.7)

  // The heap: wide, low, spilling forward off the pitch.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * 0.75
    const lift = (1 - r / 0.75) * 0.34
    parts.push(
      P(
        bakedSphere(0.115 + rand() * 0.03, -0.75 + Math.cos(a) * r, 0.11 + lift, 0.35 + Math.sin(a) * r * 0.7, {
          wSeg: 6,
          hSeg: 4,
        }),
        rand() > 0.55 ? green : husk
      )
    )
  }
  // Tender coconuts lined up on the plank, ready to be topped.
  for (let i = 0; i < 6; i++) {
    parts.push(
      P(bakedSphere(0.115, 0.15 + (i % 3) * 0.28, 0.79, -0.2 + Math.floor(i / 3) * 0.3, { wSeg: 7, hSeg: 5 }), green)
    )
  }
  return mergeByMaterial(parts)
}

/**
 * Fish on ice.
 *
 * Flat trays of crushed ice with the catch laid out in rows: a horizontal
 * silver plane at waist height, which is the one thing in the gali that catches
 * the light rather than absorbing it.
 */
export function fishStall({ seed = 14, mats } = {}) {
  const wood = stdMat(TRESTLE, { roughness: 0.92 }, mats)
  const bamboo = stdMat(BAMBOO, { roughness: 0.9 }, mats)
  const tarp = stdMat(0x2f6fb5, { roughness: 0.88, side: THREE.DoubleSide }, mats)
  const ice = stdMat(0xd8e6ee, { roughness: 0.45 }, mats)
  const fish = stdMat(0xa9b4bd, { roughness: 0.35, metalness: 0.35 }, mats)
  const red = stdMat(0xb8474b, { roughness: 0.6 }, mats)
  const tin = stdMat(0x9aa0a6, { roughness: 0.5, metalness: 0.5 }, mats)
  const parts = []

  trestle(parts, wood, 2.6, 1.2, 0.78)
  tarpRoof(parts, tarp, bamboo, 3.0, 1.9, 2.4, 4)

  for (const tx of [-0.62, 0.62]) {
    parts.push(P(bakedBox(1.1, 0.04, 0.8, tx, 0.82, 0), tin))
    parts.push(P(bakedBox(1.06, 0.07, 0.76, tx, 0.865, 0), ice))
    for (let i = 0; i < 7; i++) {
      const fx = tx - 0.42 + (i % 4) * 0.28
      const fz = -0.18 + Math.floor(i / 4) * 0.3
      // Squashed long and thin: a sphere at these proportions is a fish.
      parts.push(
        P(
          bakedSphere(0.075, fx, 0.925, fz, { wSeg: 6, hSeg: 4, sx: 2.3, sy: 0.55, sz: 0.85 }),
          i % 5 === 0 ? red : fish
        )
      )
    }
  }
  // The water drum underneath and the weighing pan on the corner.
  parts.push(P(bakedCyl(0.3, 0.3, 0.6, 12, -1.25, 0.3, -0.55), tin))
  parts.push(P(bakedCyl(0.22, 0.18, 0.04, 12, 1.15, 0.86, 0.3), tin))
  return mergeByMaterial(parts)
}

/**
 * A sheet on the floor with goods on it.
 *
 * The cheapest pitch in any mandi, and the most recognisable one: no table, no
 * tarp, just plastic weighted at the corners. Costs almost nothing and breaks
 * up a street that is otherwise a row of identical trestles at identical
 * heights — which is what made the first lane read as a market stand at a trade
 * fair rather than a bazaar.
 */
export function groundSheet({ seed = 15, mats } = {}) {
  const rand = mulberry32(seed)
  const sheet = stdMat(SHEET[seed % SHEET.length], { roughness: 0.9 }, mats)
  const stone = stdMat(0x6b6b6b, { roughness: 1 }, mats)
  const parts = [P(bakedBox(1.7, 0.012, 1.3, 0, 0.006, 0), sheet)]

  // Weighted at the corners, because a sheet on an open street has to be.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push(P(bakedSphere(0.07, sx * 0.78, 0.04, sz * 0.58, { wSeg: 5, hSeg: 4, sy: 0.6 }), stone))
  }
  // Four small heaps in a grid, the way a floor vendor sorts stock.
  for (let i = 0; i < 4; i++) {
    const mat = stdMat(VEG[(i * 3 + seed) % VEG.length], { roughness: 0.78 }, mats)
    heap(parts, mat, -0.42 + (i % 2) * 0.84, 0.02, -0.3 + Math.floor(i / 2) * 0.6, 0.2, 10, 0.055, rand)
  }
  return mergeByMaterial(parts)
}

/* ------------------------------------------------------------------ *
 * Fillers — cheap, repeated, instanced by the caller
 * ------------------------------------------------------------------ */

export function cratePile({ seed = 9, mats } = {}) {
  const rand = mulberry32(seed)
  const parts = []
  crateStack(parts, stdMat(CRATE, { roughness: 0.95 }, mats), 0, 0, 3 + Math.floor(rand() * 2), rand)
  return mergeByMaterial(parts)
}

export function sackPile({ seed = 10, mats } = {}) {
  const rand = mulberry32(seed)
  const jute = stdMat(JUTE, { roughness: 1 }, mats)
  const parts = []
  for (let i = 0; i < 4; i++) {
    parts.push(
      P(bakedCyl(0.26, 0.3, 0.55, 9, (rand() - 0.5) * 0.5, 0.28 + (i > 1 ? 0.5 : 0), (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.14, 0), jute)
    )
  }
  return mergeByMaterial(parts)
}

export function gasCylinder({ mats } = {}) {
  const red = stdMat(0xb03a2e, { roughness: 0.55, metalness: 0.3 }, mats)
  const steel = stdMat(0x9aa0a6, { roughness: 0.4, metalness: 0.65 }, mats)
  return mergeByMaterial([
    P(bakedCyl(0.17, 0.17, 0.58, 12, 0, 0.29, 0), red),
    P(bakedCyl(0.17, 0.1, 0.08, 12, 0, 0.61, 0), red),
    P(bakedCyl(0.05, 0.05, 0.1, 8, 0, 0.69, 0), steel),
  ])
}

export function plasticChair({ mats, colour = 0xd94f3d } = {}) {
  const c = stdMat(colour, { roughness: 0.6 }, mats)
  const parts = [
    P(bakedBox(0.42, 0.05, 0.42, 0, 0.44, 0), c),
    P(bakedBox(0.42, 0.45, 0.05, 0, 0.67, -0.19, -0.1, 0, 0), c),
  ]
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
    parts.push(P(bakedCyl(0.022, 0.026, 0.44, 6, x, 0.22, z), c))
  }
  return mergeByMaterial(parts)
}

/** Every stall in the kit, by id, with the footprint the lane solver needs. */
export const STALLS = {
  veg_stall: { build: vegStall, footprint: { w: 3.0, d: 2.4 }, tags: ['sabzi', 'vegetable', 'tomato'] },
  fruit_stall: { build: fruitStall, footprint: { w: 3.0, d: 2.4 }, tags: ['fruit', 'mango', 'banana'] },
  spice_stall: { build: spiceStall, footprint: { w: 2.9, d: 2.2 }, tags: ['masala', 'spice', 'kirana'] },
  cloth_stall: { build: clothStall, footprint: { w: 2.8, d: 1.9 }, tags: ['kapda', 'cloth', 'saree'] },
  bangle_stall: { build: bangleStall, footprint: { w: 2.7, d: 2.0 }, tags: ['bangles', 'chudi', 'gift'] },
  chai_tapri: { build: chaiTapri, footprint: { w: 2.4, d: 2.2 }, tags: ['chai', 'tea', 'snack'] },
  plastic_stall: { build: plasticStall, footprint: { w: 2.9, d: 2.2 }, tags: ['bucket', 'plastic', 'household'] },
  flower_stall: { build: flowerStall, footprint: { w: 2.9, d: 2.0 }, tags: ['phool', 'flower', 'garland', 'puja'] },
  pot_stall: { build: potStall, footprint: { w: 3.0, d: 2.2 }, tags: ['bartan', 'steel', 'utensil', 'household'] },
  coconut_stall: { build: coconutStall, footprint: { w: 2.6, d: 2.0 }, tags: ['coconut', 'nariyal', 'tender'] },
  fish_stall: { build: fishStall, footprint: { w: 3.0, d: 2.2 }, tags: ['fish', 'machli', 'meat'] },
  ground_sheet: { build: groundSheet, footprint: { w: 1.8, d: 1.4 }, tags: ['floor', 'sabzi', 'cheap'] },
}
