import * as THREE from 'three'

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o })

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

// ---------- wearables ----------

export function makeHat(style, color) {
  const g = new THREE.Group()
  if (style === 'sun') {
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), std(color), 0, 0.1, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.18, 20), std(color), 0, 0.2, 0))
  } else {
    // cap
    g.add(mesh(new THREE.SphereGeometry(0.23, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), std(color), 0, 0.06, 0))
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.035, 0.26), std(color), 0, 0.07, 0.24))
  }
  return g
}

function shirt(color) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.44, 0.52, 0.18), std(color), 0, 0.42, 0))
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.3, 0.16), std(color), -0.29, 0.52, 0))
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.3, 0.16), std(color), 0.29, 0.52, 0))
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), std(color), 0, 0.68, 0)) // collar
  return g
}

function sneakers(color) {
  const g = new THREE.Group()
  for (const sx of [-0.14, 0.14]) {
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.5), std('#f8fafc'), sx, 0.03, 0))
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.13, 0.42), std(color), sx, 0.12, -0.02))
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.07, 0.12), std('#f8fafc'), sx, 0.09, 0.17))
  }
  return g
}

// ---------- electronics ----------

function phone(color) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.6, 0.05), std(color, { roughness: 0.35 }), 0, 0.3, 0))
  const screen = mesh(new THREE.PlaneGeometry(0.26, 0.55), new THREE.MeshBasicMaterial({ color: '#38bdf8' }), 0, 0.3, 0.026)
  g.add(screen)
  return g
}

function laptop() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.62, 0.035, 0.42), std('#334155', { roughness: 0.4 }), 0, 0.02, 0.1))
  const lid = new THREE.Group()
  const lidGeo = new THREE.BoxGeometry(0.62, 0.42, 0.025)
  lidGeo.translate(0, 0.21, 0)
  lid.add(mesh(lidGeo, std('#334155', { roughness: 0.4 })))
  const scrGeo = new THREE.PlaneGeometry(0.56, 0.36)
  scrGeo.translate(0, 0.21, 0.014)
  lid.add(mesh(scrGeo, new THREE.MeshBasicMaterial({ color: '#67e8f9' })))
  lid.position.set(0, 0.03, -0.11)
  lid.rotation.x = -0.35
  g.add(lid)
  return g
}

function headphones(color) {
  const g = new THREE.Group()
  g.add(mesh(new THREE.TorusGeometry(0.22, 0.035, 10, 24, Math.PI), std(color), 0, 0.26, 0))
  for (const sx of [-0.23, 0.23]) {
    const cup = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 16), std(color), sx, 0.24, 0)
    cup.rotation.z = Math.PI / 2
    g.add(cup)
  }
  return g
}

function drone() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), std('#1f2937', { roughness: 0.4 }), 0, 0.1, 0))
  g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), std('#38bdf8'), 0, 0.07, 0.17))
  for (const [ax, az] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = mesh(new THREE.BoxGeometry(0.3, 0.035, 0.06), std('#374151'), ax * 0.24, 0.12, az * 0.24)
    arm.rotation.y = Math.atan2(az, ax)
    g.add(arm)
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 16), std('#64748b', { transparent: true, opacity: 0.7 }), ax * 0.36, 0.15, az * 0.36))
  }
  return g
}

function smartwatch(color) {
  const g = new THREE.Group()
  const band = mesh(new THREE.TorusGeometry(0.14, 0.03, 10, 24), std(color))
  band.position.y = 0.17
  g.add(band)
  g.add(mesh(new THREE.BoxGeometry(0.15, 0.05, 0.13), std('#0f172a', { roughness: 0.3 }), 0, 0.33, 0))
  g.add(mesh(new THREE.PlaneGeometry(0.11, 0.09), new THREE.MeshBasicMaterial({ color: '#4ade80' }), 0, 0.34, 0.028))
  return g
}

// ---------- café / grocery ----------

function appleCrate() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.05, 0.36), std('#8b5e3c'), 0, 0.025, 0))
  for (const [sx, sz] of [[-0.25, 0], [0.25, 0]]) g.add(mesh(new THREE.BoxGeometry(0.02, 0.16, 0.36), std('#8b5e3c'), sx, 0.1, sz))
  for (const [sx, sz] of [[0, -0.18], [0, 0.18]]) g.add(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.02), std('#8b5e3c'), sx, 0.1, sz))
  const spots = [[-0.14, -0.08], [0.02, -0.06], [0.16, -0.09], [-0.07, 0.09], [0.1, 0.08]]
  for (const [sx, sz] of spots) g.add(mesh(new THREE.SphereGeometry(0.075, 12, 10), std('#dc2626'), sx, 0.14, sz))
  return g
}

function bread() {
  const g = new THREE.Group()
  const loaf = mesh(new THREE.SphereGeometry(0.22, 16, 12), std('#c98a4b', { roughness: 0.9 }), 0, 0.12, 0)
  loaf.scale.set(1, 0.6, 0.55)
  g.add(loaf)
  return g
}

function milk() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 16), std('#f8fafc'), 0, 0.17, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.12, 16), std('#93c5fd'), 0, 0.19, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), std('#3b82f6'), 0, 0.37, 0))
  return g
}

function cupcake() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.12, 16), std('#b45309'), 0, 0.06, 0))
  g.add(mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), std('#f9a8d4'), 0, 0.12, 0))
  g.add(mesh(new THREE.SphereGeometry(0.032, 8, 6), std('#dc2626'), 0, 0.24, 0))
  return g
}

function coffeeBag() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.32, 0.14), std('#4b2e1e', { roughness: 0.9 }), 0, 0.16, 0))
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.05, 0.16), std('#3a2317'), 0, 0.34, 0))
  g.add(mesh(new THREE.PlaneGeometry(0.15, 0.11), new THREE.MeshBasicMaterial({ color: '#e7cba9' }), 0, 0.18, 0.071))
  return g
}

function juice() {
  const g = new THREE.Group()
  g.add(mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), std('#fb923c'), 0, 0.15, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), std('#16a34a'), 0, 0.32, 0))
  g.add(mesh(new THREE.PlaneGeometry(0.11, 0.13), new THREE.MeshBasicMaterial({ color: '#fff7ed' }), 0, 0.16, 0.081))
  return g
}

// ---------- catalog ----------

const P = (id, name, price, desc, tint, build, wearable = null) => ({ id, name, price, desc, tint, build, wearable })

export const FASHION_PRODUCTS = [
  P('shirt-azure', 'Azure Tee', 799, 'Soft cotton tee in a calm sky blue. Try it on in the trial room!', '#3b82f6', () => shirt('#3b82f6'), { shirt: '#3b82f6' }),
  P('shirt-coral', 'Coral Tee', 799, 'Warm coral for sunny plaza days.', '#f97360', () => shirt('#f97360'), { shirt: '#f97360' }),
  P('shirt-mint', 'Mint Tee', 849, 'Fresh mint green, breathable weave.', '#34d399', () => shirt('#34d399'), { shirt: '#34d399' }),
  P('shirt-sunset', 'Sunset Tee', 849, 'Golden amber, limited plaza edition.', '#f59e0b', () => shirt('#f59e0b'), { shirt: '#f59e0b' }),
  P('hat-cap', 'Street Cap', 499, 'Classic red cap. Instant style.', '#ef4444', () => makeHat('cap', '#ef4444'), { hat: { style: 'cap', color: '#ef4444' } }),
  P('hat-sun', 'Sun Hat', 699, 'Wide-brim straw hat for the plaza sun.', '#d4b483', () => makeHat('sun', '#d4b483'), { hat: { style: 'sun', color: '#d4b483' } }),
  P('shoes-cloud', 'Cloud Sneakers', 1999, 'Feather-light white runners.', '#f8fafc', () => sneakers('#f8fafc'), { shoes: '#f8fafc' }),
  P('shoes-flame', 'Flame Runners', 2299, 'Bold red — built for running between shops.', '#ef4444', () => sneakers('#ef4444'), { shoes: '#ef4444' }),
]

export const ELECTRONICS_PRODUCTS = [
  P('phone-nova-x', 'Nova X Phone', 49999, '6.7" AMOLED, 5G, week-long battery.', '#1f2937', () => phone('#1f2937')),
  P('phone-nova-air', 'Nova Air', 34999, 'Slim, light, ocean-blue finish.', '#3b82f6', () => phone('#3b82f6')),
  P('laptop-zen', 'ZenBook Pro', 89999, '14-core creator laptop, 3K display.', '#334155', () => laptop()),
  P('buds-pulse', 'Pulse Buds Max', 9999, 'Over-ear, active noise cancelling.', '#e2e8f0', () => headphones('#e2e8f0')),
  P('drone-skyhawk', 'SkyHawk Drone', 24999, '4K camera drone, 40-min flight time.', '#38bdf8', () => drone()),
  P('watch-pulse', 'Pulse Watch', 12999, 'Fitness tracking, 10-day battery.', '#f97316', () => smartwatch('#f97316')),
]

export const CAFE_PRODUCTS = [
  P('apples', 'Kashmiri Apples (1kg)', 249, 'Crisp, sweet, farm-fresh this morning.', '#dc2626', () => appleCrate()),
  P('bread', 'Sourdough Loaf', 149, 'Baked in-store, 24-hour ferment.', '#c98a4b', () => bread()),
  P('milk', 'Farm Milk 1L', 79, 'Single-origin dairy, chilled.', '#93c5fd', () => milk()),
  P('cupcake', 'Berry Cupcake', 129, 'Vanilla sponge, berry buttercream.', '#f9a8d4', () => cupcake()),
  P('coffee', 'House Roast Beans', 499, 'Medium roast, chocolate & citrus notes.', '#4b2e1e', () => coffeeBag()),
  P('juice', 'Orange Juice 1L', 119, 'Cold-pressed, no added sugar.', '#fb923c', () => juice()),
]

// ---------- SOLE flagship: sneakers ----------

// A single sneaker with a proper silhouette: midsole, outsole, upper, toe cap,
// swoosh-style side panel, heel tab, laces. Reads as footwear at plinth scale
// rather than the stacked boxes used for the v0.1 shelf props.
export function sneakerModel({ upper = '#F2EFE9', sole = '#FFFFFF', accent = '#E4572E', lace = '#F5F3EF', detail = 'high' } = {}) {
  const g = new THREE.Group()
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, ...o })

  // Low-detail variant for the shoe wall: 40 niches x 14 meshes blew the draw
  // budget four times over once shadow passes were counted. Four meshes still
  // reads as a sneaker at niche scale and distance.
  if (detail === 'low') {
    g.add(mesh(new THREE.BoxGeometry(0.355, 0.17, 0.96), M(sole, { roughness: 0.85 }), 0, 0.085, 0))
    g.add(mesh(new THREE.BoxGeometry(0.32, 0.24, 0.72), M(upper), 0, 0.29, -0.08))
    const t = mesh(new THREE.SphereGeometry(0.16, 10, 7), M(upper), 0, 0.24, 0.33)
    t.scale.set(1, 0.72, 1.25)
    g.add(t)
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.05, 0.5), M(accent, { roughness: 0.6 }), 0, 0.19, 0.02))
    return g
  }

  // outsole — flat slab with a slight toe spring
  const outsole = mesh(new THREE.BoxGeometry(0.34, 0.05, 0.95), M(accent, { roughness: 0.95 }), 0, 0.028, 0)
  g.add(outsole)
  // midsole — the chunky part that gives a sneaker its stance
  const mid = mesh(new THREE.BoxGeometry(0.355, 0.12, 0.96), M(sole, { roughness: 0.85 }), 0, 0.11, 0)
  g.add(mid)
  const heelWedge = mesh(new THREE.BoxGeometry(0.355, 0.09, 0.32), M(sole, { roughness: 0.85 }), 0, 0.19, -0.3)
  g.add(heelWedge)

  // upper body
  const body = mesh(new THREE.BoxGeometry(0.32, 0.22, 0.72), M(upper), 0, 0.27, -0.08)
  g.add(body)
  // toe box, tapered and rounded
  const toe = mesh(new THREE.SphereGeometry(0.16, 14, 10), M(upper), 0, 0.22, 0.33)
  toe.scale.set(1, 0.72, 1.25)
  g.add(toe)
  // heel counter
  const heel = mesh(new THREE.SphereGeometry(0.16, 14, 10), M(upper), 0, 0.3, -0.4)
  heel.scale.set(1, 1.05, 0.8)
  g.add(heel)
  // ankle collar opening
  const collar = mesh(new THREE.TorusGeometry(0.105, 0.032, 8, 16), M(accent), 0, 0.38, -0.15)
  collar.rotation.x = Math.PI / 2 - 0.18
  g.add(collar)

  // side panel stripe
  for (const sx of [-0.163, 0.163]) {
    const stripe = mesh(new THREE.BoxGeometry(0.012, 0.09, 0.44), M(accent, { roughness: 0.6 }), sx, 0.25, 0.0)
    stripe.rotation.x = 0.14
    g.add(stripe)
  }
  // toe cap
  const cap = mesh(new THREE.BoxGeometry(0.3, 0.015, 0.2), M(accent), 0, 0.155, 0.36)
  g.add(cap)
  // heel tab
  const tab = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), M(accent), 0, 0.44, -0.46)
  g.add(tab)
  // laces
  for (let i = 0; i < 4; i++) {
    const l = mesh(new THREE.BoxGeometry(0.19, 0.018, 0.03), M(lace, { roughness: 0.95 }), 0, 0.375 - i * 0.005, 0.02 + i * 0.1)
    g.add(l)
  }
  return g
}

const SNEAK = (id, name, price, desc, cw, tag = '') => ({
  id, name, price, desc,
  tint: cw.accent,
  colorway: cw,
  tag,
  build: (over) => sneakerModel({ ...cw, ...(over ?? {}) }),
  wearable: { shoes: cw.upper },
})

export const SNEAKER_PRODUCTS = [
  SNEAK('sole-af1', 'SOLE Vector 01', 12995, 'The flagship silhouette. Full-grain upper, sculpted midsole, brass eyelets.', { upper: '#F4F1EA', sole: '#FFFFFF', accent: '#E4572E' }, 'CORE'),
  SNEAK('sole-noir', 'Vector Noir', 13995, 'All-black colourway with a tonal side stripe and gum outsole.', { upper: '#1C1A19', sole: '#2A2724', accent: '#C9A227' }, 'CORE'),
  SNEAK('sole-runner', 'Meridian Runner', 9995, 'Knit runner built for the plaza. Breathable, feather-light.', { upper: '#3D5A80', sole: '#EDEAE4', accent: '#98C1D9' }),
  SNEAK('sole-court', 'Court Classic', 8495, 'Low-profile court shoe. Clean lines, everyday leather.', { upper: '#FAF8F4', sole: '#F0EDE7', accent: '#2A9D8F' }),
  SNEAK('sole-trail', 'Ridge Trail', 14995, 'Lugged outsole, reinforced toe. Made for weather.', { upper: '#5C6B4A', sole: '#3A3A38', accent: '#E9C46A' }),
  SNEAK('sole-retro', 'Retro 84', 11495, 'Archive reissue. Suede overlays and a vintage midsole tint.', { upper: '#C1436D', sole: '#F2E3D0', accent: '#F2A65A' }, 'ARCHIVE'),
  SNEAK('sole-mono', 'Mono Slate', 10995, 'Monochrome slate with a translucent outsole.', { upper: '#6B705C', sole: '#A5A58D', accent: '#43503F' }),
  SNEAK('sole-flare', 'Solar Flare', 15995, 'Limited drop. Reflective panels, volt accents.', { upper: '#1B1B1E', sole: '#E8E6E1', accent: '#D8F32B' }, 'DROP'),
  SNEAK('sole-cloud', 'Cloud Lite', 7995, 'The everyday trainer. Soft foam, no break-in.', { upper: '#E8E3DA', sole: '#FFFFFF', accent: '#9FB6C4' }),
  SNEAK('sole-ember', 'Ember High', 16995, 'High-top with a full brass eyelet run and leather collar.', { upper: '#7A2E22', sole: '#F0E6D8', accent: '#C9A227' }, 'ARCHIVE'),
]

export const ALL_PRODUCTS = [...FASHION_PRODUCTS, ...ELECTRONICS_PRODUCTS, ...CAFE_PRODUCTS, ...SNEAKER_PRODUCTS]

export const formatPrice = (n) => '₹' + n.toLocaleString('en-IN')
