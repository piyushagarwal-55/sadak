import * as THREE from 'three'

// ============================================================================
// POUNCE Footwear — procedural shoe catalog
// Every shoe is built from primitives (zero downloads). buildPair() returns a
// staggered left+right pair the way retail displays them; buildShoe() a single.
// ============================================================================

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o })

function part(geo, mat, x = 0, y = 0, z = 0, rot = null) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ----------------------------------------------------------------------------
// A single right-foot shoe, toe pointing +Z, heel at -Z. ~0.95 long.
// spec: { upper, sole, accent, lace, type }
//   type: runner | court | casual | formal | outdoor | luxury | slip
// ----------------------------------------------------------------------------
export function buildShoe(spec) {
  const { upper = '#ffffff', sole = '#f1f5f9', accent = '#ef4444', lace = '#ffffff', type = 'runner' } = spec
  const g = new THREE.Group()

  const upperMat = std(upper, { roughness: type === 'formal' || type === 'luxury' ? 0.35 : 0.65, metalness: type === 'luxury' ? 0.15 : 0 })
  const soleMat = std(sole, { roughness: 0.85 })
  const outMat = std('#1f2530', { roughness: 0.95 })
  const accentMat = std(accent, { roughness: 0.5 })
  const laceMat = std(lace, { roughness: 0.9 })

  const soleH = type === 'runner' ? 0.15 : type === 'outdoor' ? 0.16 : type === 'formal' ? 0.07 : 0.11
  const collarH = type === 'court' ? 0.42 : type === 'outdoor' ? 0.36 : 0.24 // ankle height

  // ---- outsole (dark rubber tread) ----
  const outsole = part(new THREE.BoxGeometry(0.34, 0.05, 0.92), outMat, 0, 0.025, 0)
  outsole.scale.z = 1
  g.add(outsole)
  // tread lugs for outdoor
  if (type === 'outdoor') {
    for (let z = -0.36; z <= 0.36; z += 0.12)
      g.add(part(new THREE.BoxGeometry(0.34, 0.03, 0.05), outMat, 0, 0.06, z))
  }

  // ---- midsole (the chunky foam) ----
  const mid = part(new THREE.BoxGeometry(0.35, soleH, 0.9), soleMat, 0, 0.05 + soleH / 2, 0)
  g.add(mid)
  // rounded toe & heel caps on the midsole
  const capGeo = new THREE.CylinderGeometry(soleH / 2, soleH / 2, 0.35, 10)
  g.add(part(capGeo, soleMat, 0, 0.05 + soleH / 2, 0.45, [0, 0, Math.PI / 2]))
  g.add(part(capGeo, soleMat, 0, 0.05 + soleH / 2, -0.45, [0, 0, Math.PI / 2]))
  // accent midsole stripe (running / court)
  if (type === 'runner' || type === 'court') {
    g.add(part(new THREE.BoxGeometry(0.355, 0.03, 0.9), accentMat, 0, 0.05 + soleH - 0.015, 0))
  }

  const baseY = 0.05 + soleH

  // ---- upper: toe box, vamp, heel counter ----
  // toe box (rounded via a squashed sphere)
  const toe = part(new THREE.SphereGeometry(0.17, 12, 9), upperMat, 0, baseY + 0.09, 0.3)
  toe.scale.set(1.0, 0.72, 1.15)
  g.add(toe)
  // vamp / mid upper
  g.add(part(new THREE.BoxGeometry(0.31, 0.17, 0.4), upperMat, 0, baseY + 0.085, 0.06))
  // heel counter (higher, wraps the ankle)
  const heel = part(new THREE.BoxGeometry(0.3, 0.1 + collarH, 0.28), upperMat, 0, baseY + (0.1 + collarH) / 2, -0.3)
  g.add(heel)
  // ankle collar padding ring (opening you slip your foot into)
  const collar = part(new THREE.TorusGeometry(0.13, 0.045, 6, 14), upperMat, 0, baseY + collarH, -0.2, [Math.PI / 2 - 0.35, 0, 0])
  g.add(collar)

  // ---- tongue ----
  g.add(part(new THREE.BoxGeometry(0.2, 0.06, 0.18), std(sole, { roughness: 0.9 }), 0, baseY + 0.19, 0.02, [-0.5, 0, 0]))

  // ---- laces (crossing bars over the vamp) ----
  if (type !== 'slip' && type !== 'formal') {
    for (let i = 0; i < 4; i++) {
      const z = -0.02 + i * 0.09
      const w = 0.22 - i * 0.015
      g.add(part(new THREE.BoxGeometry(w, 0.03, 0.03), laceMat, 0, baseY + 0.19 - i * 0.005, z, [0, 0, 0.04 * (i % 2 ? 1 : -1)]))
    }
    // eyestay panels
    for (const sx of [-1, 1])
      g.add(part(new THREE.BoxGeometry(0.03, 0.12, 0.34), upperMat, sx * 0.12, baseY + 0.13, 0.05))
  } else if (type === 'formal') {
    // brogue / oxford: smooth cap-toe seam
    g.add(part(new THREE.BoxGeometry(0.31, 0.02, 0.03), std('#00000020'), 0, baseY + 0.14, 0.18))
  }

  // ---- side accent (swoosh-style angled panel) ----
  if (type === 'runner' || type === 'court' || type === 'casual') {
    for (const sx of [-1, 1]) {
      const sw = part(new THREE.BoxGeometry(0.02, 0.1, 0.42), accentMat, sx * 0.155, baseY + 0.09, 0.02, [0, 0, sx * 0.5])
      g.add(sw)
    }
  }
  // heel pull-tab
  g.add(part(new THREE.BoxGeometry(0.08, 0.06, 0.02), accentMat, 0, baseY + collarH + 0.05, -0.36))

  // luxury monogram dots
  if (type === 'luxury') {
    for (let i = 0; i < 6; i++)
      g.add(part(new THREE.SphereGeometry(0.014, 8, 6), accentMat, -0.1 + (i % 3) * 0.1, baseY + 0.12 + Math.floor(i / 3) * 0.06, 0.02))
  }

  return g
}

// A low-poly shelf shoe (~6 meshes) for stocking racks cheaply. Reads as a shoe
// at a glance without the draw-call cost of the detailed buildShoe.
export function buildShoeLite(spec) {
  const { upper = '#fff', sole = '#f1f5f9', accent = '#ef4444', type = 'runner' } = spec
  const g = new THREE.Group()
  const um = std(upper, { roughness: 0.7 })
  const sm = std(sole, { roughness: 0.85 })
  const am = std(accent, { roughness: 0.5 })
  const soleH = type === 'runner' ? 0.14 : type === 'formal' ? 0.07 : 0.11
  const collarH = type === 'court' || type === 'outdoor' ? 0.34 : 0.2
  g.add(part(new THREE.BoxGeometry(0.34, soleH, 0.9), sm, 0, 0.03 + soleH / 2, 0))
  g.add(part(new THREE.BoxGeometry(0.35, 0.03, 0.9), am, 0, 0.03 + soleH - 0.01, 0))
  const baseY = 0.03 + soleH
  const toe = part(new THREE.SphereGeometry(0.16, 8, 6), um, 0, baseY + 0.07, 0.29)
  toe.scale.set(1, 0.8, 1.15)
  g.add(toe)
  g.add(part(new THREE.BoxGeometry(0.3, 0.15 + collarH * 0.4, 0.44), um, 0, baseY + (0.15 + collarH * 0.4) / 2, -0.02))
  g.add(part(new THREE.BoxGeometry(0.3, 0.1 + collarH, 0.24), um, 0, baseY + (0.1 + collarH) / 2, -0.3))
  if (type !== 'slip' && type !== 'formal') g.add(part(new THREE.BoxGeometry(0.02, 0.1, 0.42), am, 0.155, baseY + 0.08, 0.02, [0, 0, 0.5]))
  return g
}

export function buildPairLite(spec) {
  const g = new THREE.Group()
  const r = buildShoeLite(spec); r.position.set(0.22, 0, -0.05); r.rotation.y = -0.3
  const l = buildShoeLite(spec); l.position.set(-0.22, 0, 0.05); l.rotation.y = 0.3; l.scale.x = -1
  g.add(l, r)
  return g
}

// A staggered left+right pair, as displayed on a shelf.
export function buildPair(spec) {
  const g = new THREE.Group()
  const right = buildShoe(spec)
  right.position.set(0.24, 0, -0.05)
  right.rotation.y = -0.35
  const left = buildShoe(spec)
  left.position.set(-0.24, 0, 0.05)
  left.rotation.y = 0.35
  left.scale.x = -1 // mirror
  g.add(left, right)
  return g
}

// A cheap closed shoe box (2 meshes) for stocking shelves densely without the
// draw-call cost of a full detailed pair. Lid stripe uses the product tint.
export function shoeBox(color = '#c2410c', w = 0.5, h = 0.2, d = 0.32) {
  const g = new THREE.Group()
  g.add(part(new THREE.BoxGeometry(w, h, d), std('#f1f0ec', { roughness: 0.9 }), 0, h / 2, 0))
  g.add(part(new THREE.BoxGeometry(w * 1.02, h * 0.32, d * 1.02), std(color, { roughness: 0.8 }), 0, h * 0.5, 0))
  return g
}

// A short stack of boxes (n high), each tinted from a colour list.
export function boxStack(colors, n = 3, w = 0.5) {
  const g = new THREE.Group()
  const h = 0.2
  for (let i = 0; i < n; i++) {
    const b = shoeBox(colors[i % colors.length], w, h)
    b.position.y = i * (h + 0.015)
    b.rotation.y = (i % 2 ? 1 : -1) * 0.04
    g.add(b)
  }
  return g
}

// A single shoe standing angled (for detail/AR hero shots).
export function buildHero(spec) {
  const g = new THREE.Group()
  const s = buildShoe(spec)
  s.rotation.y = 0.6
  g.add(s)
  return g
}

// ---------------------------------------------------------------------------
// Accessories
// ---------------------------------------------------------------------------
function cleanerKit() {
  const g = new THREE.Group()
  g.add(part(new THREE.BoxGeometry(0.4, 0.24, 0.3), std('#0ea5e9'), 0, 0.12, 0))
  g.add(part(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), std('#f1f5f9'), 0.12, 0.35, 0))
  g.add(part(new THREE.BoxGeometry(0.16, 0.05, 0.1), std('#facc15'), -0.1, 0.27, 0.05)) // brush
  return g
}
function socks(color) {
  const g = new THREE.Group()
  for (const sx of [-0.1, 0.1]) {
    g.add(part(new THREE.BoxGeometry(0.12, 0.28, 0.1), std(color), sx, 0.2, 0))
    g.add(part(new THREE.BoxGeometry(0.12, 0.08, 0.18), std(color), sx, 0.06, 0.05))
    g.add(part(new THREE.BoxGeometry(0.125, 0.05, 0.1), std('#ffffff'), sx, 0.33, 0))
  }
  return g
}
function insoles() {
  const g = new THREE.Group()
  for (const sx of [-0.09, 0.09]) {
    const i = part(new THREE.CapsuleGeometry(0.07, 0.28, 4, 8), std('#22c55e'), sx, 0.04, 0, [Math.PI / 2, 0, 0])
    i.scale.set(1, 1, 0.35)
    g.add(i)
  }
  return g
}
function lacesPack(color) {
  const g = new THREE.Group()
  g.add(part(new THREE.TorusGeometry(0.14, 0.03, 10, 24), std(color), 0, 0.16, 0, [0.4, 0, 0]))
  g.add(part(new THREE.TorusGeometry(0.11, 0.03, 10, 24), std(color), 0.04, 0.13, 0.03, [0.5, 0.3, 0]))
  return g
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------
// sizes: UK sizes 6..12; stock map controls what the inventory staff can fetch.
const sizeRun = (avail) => [6, 7, 8, 9, 10, 11, 12].map((s) => ({ size: s, stock: avail.includes(s) ? 1 + (s % 3) : 0 }))

let _id = 0
function shoe(o) {
  const spec = { upper: o.upper, sole: o.sole, accent: o.accent, lace: o.lace ?? '#ffffff', type: o.type }
  return {
    id: o.id ?? `sh-${++_id}`,
    kind: 'shoe',
    name: o.name,
    brand: o.brand,
    section: o.section,
    price: o.price,
    mrp: o.mrp ?? o.price,
    rating: o.rating,
    reviews: o.reviews,
    material: o.material,
    comfort: o.comfort, // 1..5
    usage: o.usage,
    warranty: o.warranty ?? '6-month manufacturer warranty',
    care: o.care ?? 'Wipe with a soft dry cloth. Avoid machine wash.',
    weight: o.weight,
    colors: o.colors, // [{name,hex}]
    sizes: sizeRun(o.avail ?? [6, 7, 8, 9, 10, 11]),
    tint: o.upper,
    spec,
    build: () => buildPair(spec),
    buildHero: () => buildHero(spec),
    desc: o.desc,
    tag: o.tag ?? null, // 'new' | 'sale' | 'hot'
  }
}

function accessory(o) {
  return {
    id: o.id ?? `ac-${++_id}`,
    kind: 'accessory',
    name: o.name,
    brand: 'POUNCE Care',
    section: 'Accessories',
    price: o.price,
    mrp: o.mrp ?? o.price,
    rating: o.rating ?? 4.4,
    reviews: o.reviews ?? 120,
    material: o.material ?? '—',
    usage: o.usage ?? 'Shoe care',
    colors: o.colors ?? [{ name: 'Standard', hex: o.tint }],
    sizes: [],
    tint: o.tint,
    build: o.build,
    buildHero: o.build,
    desc: o.desc,
    tag: o.tag ?? null,
    warranty: '—',
    care: '—',
  }
}

export const SHOES = [
  // ---- Running ----
  shoe({
    id: 'velocity-pro', name: 'Velocity Pro', brand: 'POUNCE Sport', section: 'Running',
    price: 8999, mrp: 10999, rating: 4.7, reviews: 1284, comfort: 5, weight: '238 g',
    material: 'Engineered flyknit upper · React foam midsole', usage: 'Daily running · tempo · long distance',
    type: 'runner', upper: '#0ea5e9', sole: '#f8fafc', accent: '#f97316', lace: '#e2e8f0',
    colors: [{ name: 'Sky/Ember', hex: '#0ea5e9' }, { name: 'Core Black', hex: '#1e293b' }, { name: 'Volt', hex: '#a3e635' }],
    avail: [6, 7, 8, 10, 11], // note: size 9 out of stock on the floor → warehouse fetch
    desc: 'Our lightest cushioned trainer. Springy React foam returns energy on every stride — built for the runner who logs miles before the city wakes.', tag: 'hot',
  }),
  shoe({
    id: 'glide-max', name: 'Glide Max 90', brand: 'POUNCE Sport', section: 'Running',
    price: 11499, mrp: 11499, rating: 4.8, reviews: 902, comfort: 5, weight: '295 g',
    material: 'Mesh upper · max air-cushion sole', usage: 'Long-distance · recovery runs · all-day comfort',
    type: 'runner', upper: '#111827', sole: '#e2e8f0', accent: '#22d3ee', lace: '#334155',
    colors: [{ name: 'Obsidian/Ice', hex: '#111827' }, { name: 'Triple White', hex: '#f8fafc' }],
    avail: [7, 8, 9, 10, 11, 12],
    desc: 'Maximum cushioning for marathon distances. The tallest air stack we make — cloud-soft landings, mile after mile.', tag: 'new',
  }),
  shoe({
    id: 'aerolite', name: 'Stride AeroLite', brand: 'Kestrel', section: 'Running',
    price: 6499, mrp: 7999, rating: 4.5, reviews: 611, comfort: 4, weight: '198 g',
    material: 'Ultra-mesh upper · EVA speed plate', usage: 'Race day · gym · sprint intervals',
    type: 'runner', upper: '#f43f5e', sole: '#fff1f2', accent: '#fde047',
    colors: [{ name: 'Rose Flash', hex: '#f43f5e' }, { name: 'Carbon', hex: '#334155' }],
    avail: [6, 7, 8, 9], desc: 'Feather-light racer with a snappy speed plate. When the clock matters, this is the shoe.',
  }),

  // ---- Basketball ----
  shoe({
    id: 'court-legend', name: "Court Legend '84", brand: 'POUNCE Hoops', section: 'Basketball',
    price: 9999, mrp: 12999, rating: 4.6, reviews: 743, comfort: 4, weight: '420 g',
    material: 'Full-grain leather · high-top ankle collar', usage: 'Basketball · streetwear · everyday flex',
    type: 'court', upper: '#dc2626', sole: '#f8fafc', accent: '#111827', lace: '#111827',
    colors: [{ name: 'Chicago Red', hex: '#dc2626' }, { name: 'Court White', hex: '#f1f5f9' }, { name: 'Royal', hex: '#2563eb' }],
    avail: [7, 8, 9, 10, 11], desc: 'The high-top that started it all. Locked-in ankle support and premium leather that only looks better with age.', tag: 'hot',
  }),
  shoe({
    id: 'skydunk', name: 'SkyDunk HD', brand: 'POUNCE Hoops', section: 'Basketball',
    price: 8499, mrp: 8499, rating: 4.4, reviews: 388, comfort: 4, weight: '405 g',
    material: 'Synthetic leather · padded collar · herringbone grip', usage: 'Indoor court · outdoor blacktop',
    type: 'court', upper: '#7c3aed', sole: '#ede9fe', accent: '#facc15',
    colors: [{ name: 'Grape', hex: '#7c3aed' }, { name: 'Panda', hex: '#0f172a' }],
    avail: [8, 9, 10, 11, 12], desc: 'Explosive traction and a padded collar that eats hard landings. Rise above the rim.',
  }),

  // ---- Casual Sneakers ----
  shoe({
    id: 'heritage-574', name: 'Heritage 574', brand: 'Northgate', section: 'Casual Sneakers',
    price: 5999, mrp: 5999, rating: 4.7, reviews: 2210, comfort: 5, weight: '310 g',
    material: 'Suede & mesh upper · ENCAP midsole', usage: 'Everyday casual · walking · smart-casual',
    type: 'casual', upper: '#64748b', sole: '#e2e8f0', accent: '#f8fafc', lace: '#f1f5f9',
    colors: [{ name: 'Slate Grey', hex: '#64748b' }, { name: 'Navy', hex: '#1e3a8a' }, { name: 'Sand', hex: '#d6c3a5' }],
    avail: [6, 7, 8, 9, 10, 11, 12], desc: 'The quiet classic. Understated suede that pairs with everything from joggers to chinos — a lifetime staple.', tag: 'new',
  }),
  shoe({
    id: 'velour-suede', name: 'Velour Suede Classic', brand: 'Fable', section: 'Casual Sneakers',
    price: 4499, mrp: 5499, rating: 4.5, reviews: 987, comfort: 4, weight: '340 g',
    material: 'Soft suede upper · rubber cupsole', usage: 'Streetwear · casual outings',
    type: 'casual', upper: '#b45309', sole: '#fef3c7', accent: '#78350f',
    colors: [{ name: 'Tobacco', hex: '#b45309' }, { name: 'Forest', hex: '#166534' }, { name: 'Black', hex: '#1c1917' }],
    avail: [6, 7, 8, 9, 10], desc: 'Buttery suede and a low, clean profile. Retro looks with a modern cupsole underneath.',
  }),

  // ---- Formal ----
  shoe({
    id: 'oxford-noir', name: 'Oxford Noir', brand: 'Aldwin & Co.', section: 'Formal',
    price: 7999, mrp: 7999, rating: 4.6, reviews: 322, comfort: 3, weight: '480 g',
    material: 'Full-grain calf leather · leather sole', usage: 'Formal wear · office · weddings',
    type: 'formal', upper: '#111827', sole: '#3f2a1e', accent: '#0b1120', lace: '#0b1120',
    colors: [{ name: 'Jet Black', hex: '#111827' }, { name: 'Oxblood', hex: '#7f1d1d' }],
    avail: [7, 8, 9, 10, 11], desc: 'A hand-finished Oxford in glossy calf leather. The shoe that finishes a suit.',
  }),
  shoe({
    id: 'exec-brogue', name: 'Executive Brogue', brand: 'Aldwin & Co.', section: 'Formal',
    price: 8999, mrp: 10499, rating: 4.5, reviews: 208, comfort: 3, weight: '505 g',
    material: 'Brogued leather · cushioned footbed', usage: 'Business formal · evening',
    type: 'formal', upper: '#78350f', sole: '#3f2a1e', accent: '#451a03', lace: '#451a03',
    colors: [{ name: 'Chestnut', hex: '#78350f' }, { name: 'Black', hex: '#1c1917' }],
    avail: [8, 9, 10, 11], desc: 'Classic wingtip broguing with a modern cushioned footbed — formal that you can actually wear all day.',
  }),

  // ---- Outdoor ----
  shoe({
    id: 'trailblazer', name: 'TrailBlazer GTX', brand: 'Summit', section: 'Outdoor',
    price: 10999, mrp: 12999, rating: 4.8, reviews: 654, comfort: 4, weight: '540 g',
    material: 'Waterproof membrane · Vibram-style lugged sole', usage: 'Hiking · trekking · wet terrain',
    type: 'outdoor', upper: '#166534', sole: '#292524', accent: '#f59e0b', lace: '#1c1917',
    colors: [{ name: 'Pine', hex: '#166534' }, { name: 'Granite', hex: '#44403c' }],
    avail: [7, 8, 9, 10, 11, 12], desc: 'Fully waterproof with an aggressive lugged sole that bites into any trail. Weather is no longer a reason to stay in.', tag: 'hot',
  }),
  shoe({
    id: 'summit-hiker', name: 'Summit Hiker Mid', brand: 'Summit', section: 'Outdoor',
    price: 8499, mrp: 8499, rating: 4.4, reviews: 341, comfort: 4, weight: '515 g',
    material: 'Nubuck & mesh · EVA midsole · grippy outsole', usage: 'Day hikes · outdoor walking',
    type: 'outdoor', upper: '#a16207', sole: '#292524', accent: '#65a30d',
    colors: [{ name: 'Ochre', hex: '#a16207' }, { name: 'Slate', hex: '#475569' }],
    avail: [6, 7, 8, 9, 10], desc: 'A do-everything trail shoe: breathable, grippy, and comfortable straight out of the box.',
  }),

  // ---- Luxury ----
  shoe({
    id: 'monogram-runner', name: 'POUNCE Monogram Runner', brand: 'POUNCE Atelier', section: 'Luxury',
    price: 34999, mrp: 34999, rating: 4.9, reviews: 96, comfort: 4, weight: '360 g',
    material: 'Italian leather · gold-tone hardware · monogram jacquard', usage: 'Luxury streetwear · statement',
    type: 'luxury', upper: '#1c1917', sole: '#fbbf24', accent: '#fbbf24', lace: '#fde68a',
    colors: [{ name: 'Onyx/Gold', hex: '#1c1917' }, { name: 'Ivory/Gold', hex: '#f5f5f4' }],
    avail: [7, 8, 9, 10], desc: 'Hand-assembled in Italy. Gold hardware, monogram jacquard, and a sole that turns heads. The crown jewel of the wall.', tag: 'new',
  }),
  shoe({
    id: 'prestige-low', name: 'Prestige Leather Low', brand: 'POUNCE Atelier', section: 'Luxury',
    price: 27999, mrp: 31999, rating: 4.8, reviews: 74, comfort: 4, weight: '345 g',
    material: 'Box-calf leather · leather-lined · blake stitch', usage: 'Luxury casual · smart evening',
    type: 'luxury', upper: '#f5f5f4', sole: '#e7e5e4', accent: '#a8a29e', lace: '#ffffff',
    colors: [{ name: 'Alabaster', hex: '#f5f5f4' }, { name: 'Espresso', hex: '#3f2a1e' }],
    avail: [7, 8, 9, 10, 11], desc: 'Minimalist luxury: a whisper-white leather low with a blake-stitched sole. Quiet money.',
  }),

  // ---- Accessories are appended below ----
]

export const ACCESSORIES = [
  accessory({ id: 'cleaner-kit', name: 'Sneaker Cleaner Kit', price: 899, mrp: 1199, tint: '#0ea5e9', build: cleanerKit, usage: 'Cleans knit, suede & leather', desc: 'Brush, foam solution and microfibre cloth — everything to keep a fresh pair fresh.', tag: 'sale' }),
  accessory({ id: 'premium-socks', name: 'Cushion Socks (3-pack)', price: 599, tint: '#f8fafc', build: () => socks('#f1f5f9'), usage: 'Everyday · running', material: 'Combed cotton · arch support', desc: 'Breathable cushioned socks with targeted arch compression. Sold in threes.' }),
  accessory({ id: 'insoles', name: 'Memory-Foam Insoles', price: 799, tint: '#22c55e', build: insoles, usage: 'Extra comfort · any shoe', material: 'Memory foam · gel heel', desc: 'Drop-in memory-foam insoles with a gel heel pod. Instantly upgrade any pair.' }),
  accessory({ id: 'waxed-laces', name: 'Waxed Laces (2 pairs)', price: 349, tint: '#111827', build: () => lacesPack('#1f2937'), usage: 'Formal · sneakers', material: 'Waxed cotton', desc: 'Crisp waxed-cotton laces that hold a knot all day. Two pairs, flat and round.' }),
]

export const CATALOG = [...SHOES, ...ACCESSORIES]

// Section → products, in showroom display order.
export const SECTIONS = [
  'New Arrivals', 'Running', 'Basketball', 'Casual Sneakers', 'Formal', 'Outdoor', 'Luxury', 'Sale', 'Accessories',
]

export function bySection(section) {
  if (section === 'New Arrivals') return SHOES.filter((s) => s.tag === 'new')
  if (section === 'Sale') return CATALOG.filter((s) => s.mrp > s.price)
  return CATALOG.filter((s) => s.section === section)
}

export const byId = (id) => CATALOG.find((p) => p.id === id)

export const formatPrice = (n) => '₹' + n.toLocaleString('en-IN')

export function discountPct(p) {
  if (!p.mrp || p.mrp <= p.price) return 0
  return Math.round(((p.mrp - p.price) / p.mrp) * 100)
}

// Which sizes are in stock on the floor vs need a warehouse fetch.
export function floorSizes(p) {
  return (p.sizes || []).filter((s) => s.stock > 0).map((s) => s.size)
}
export function hasFloorStock(p, size) {
  const s = (p.sizes || []).find((x) => x.size === size)
  return !!(s && s.stock > 0)
}
