// Design tokens — the single source of truth for colour and form across every
// world. Worlds must pull from here rather than inlining hex codes, so the
// product reads as one place instead of four unrelated scenes.
// See docs/PRD-v0.2-sole-flagship.md §1.4.

export const PALETTE = {
  // "SOLE" flagship sneaker store — dark architectural shell, warm neutrals,
  // one hot accent used sparingly for signage and drop moments.
  sole: {
    shell: '#12100E',
    plaster: '#E8E3DA',
    stone: '#CFC7BA',
    walnut: '#4A3728',
    brass: '#C9A227',
    chrome: '#C8CDD4',
    accent: '#FF4D2E',
    glass: '#9FB6C4',
  },

  // Residential district — sun-warmed plaster, terracotta, planting greens.
  city: {
    plaster: '#E7DCC9',
    plasterAlt: '#D8C4A8',
    terracotta: '#B4653A',
    concrete: '#A8A29A',
    railing: '#3E4650',
    leaf: '#3F7D46',
    leafDeep: '#2C5A33',
    lawn: '#5C8A42',
    water: '#2E6C7E',
    lampWarm: '#FFD9A0',
  },
}

// Corner radii in metres, for RoundedBoxGeometry. Real objects have fillets;
// this is the single biggest reason v0.1 read as "blocks".
export const RADIUS = {
  chip: 0.012, // product-scale edges
  panel: 0.03, // furniture and fixtures
  plinth: 0.05, // architectural masses
}

// Standard tone/exposure targets, consumed by core/Renderer.js.
export const RENDER = {
  exposure: 1.05,
  // Per-world IBL strength. 'none' is the default: RoomEnvironment is a bright
  // studio interior, so blanket-applying it washes out hand-authored scenes
  // (measurably so on the neon-dusk plaza). Worlds opt in explicitly.
  envIntensity: { none: 0, outdoor: 0.35, interior: 0.32, studio: 1.0 },
  bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 },
}
